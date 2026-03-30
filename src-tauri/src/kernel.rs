use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, Mutex, oneshot};

/// Kernel states matching the frontend contract
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KernelState {
    Starting,
    Idle,
    Busy,
    Stopped,
    Error,
}

/// JSON request sent to kernel_server.py
#[derive(Debug, Serialize)]
pub struct KernelRequest {
    pub id: String,
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

/// JSON response from kernel_server.py
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct KernelResponse {
    pub id: String,
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(default)]
    pub stdout: String,
    #[serde(default)]
    pub stderr: String,
    pub error: Option<String>,
    #[serde(default = "default_output_type")]
    pub output_type: String,
}

fn default_output_type() -> String {
    "text".to_string()
}

/// A pending execution request
struct PendingRequest {
    request: KernelRequest,
    responder: oneshot::Sender<Result<KernelResponse, String>>,
}

/// Per-tab kernel instance
struct KernelInstance {
    state: KernelState,
    child: Option<Child>,
    request_tx: Option<mpsc::Sender<PendingRequest>>,
}

/// Manages kernel subprocesses for all tabs
pub struct KernelManager {
    interpreter: String,
    script_path: PathBuf,
    kernels: Arc<Mutex<HashMap<u8, Arc<Mutex<KernelInstance>>>>>,
}

impl KernelManager {
    pub fn new(interpreter: String, script_path: PathBuf) -> Self {
        Self {
            interpreter,
            script_path,
            kernels: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Ensure a kernel exists for the given tab. Spawns if needed.
    pub async fn ensure_kernel(&self, tab_index: u8) -> Result<KernelState, String> {
        // Check if kernel already exists — clone the Arc, then drop map lock.
        {
            let kernels = self.kernels.lock().await;
            if let Some(instance) = kernels.get(&tab_index) {
                let instance = instance.clone();
                drop(kernels);
                let inst = instance.lock().await;
                return Ok(inst.state);
            }
        }

        // Spawn a new kernel
        let instance = self
            .spawn_kernel(tab_index)
            .await
            .map_err(|e| format!("Failed to spawn kernel for tab {}: {}", tab_index, e))?;
        let state = instance.lock().await.state;
        let mut kernels = self.kernels.lock().await;
        kernels.insert(tab_index, instance);
        Ok(state)
    }

    /// Spawn a new kernel subprocess and its I/O processing loop.
    async fn spawn_kernel(
        &self,
        tab_index: u8,
    ) -> Result<Arc<Mutex<KernelInstance>>, String> {
        let mut child = Command::new(&self.interpreter)
            .arg(&self.script_path)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| e.to_string())?;

        let stdin = child.stdin.take().ok_or("Failed to open kernel stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to open kernel stdout")?;

        let (request_tx, request_rx) = mpsc::channel::<PendingRequest>(64);

        let instance = Arc::new(Mutex::new(KernelInstance {
            state: KernelState::Idle,
            child: Some(child),
            request_tx: Some(request_tx),
        }));

        // Spawn the I/O loop
        let instance_ref = instance.clone();
        tokio::spawn(async move {
            Self::kernel_io_loop(instance_ref, stdin, stdout, request_rx, tab_index).await;
        });

        Ok(instance)
    }

    /// Main I/O loop: reads from the request channel, writes to stdin, reads responses from stdout.
    async fn kernel_io_loop(
        instance: Arc<Mutex<KernelInstance>>,
        mut stdin: tokio::process::ChildStdin,
        stdout: tokio::process::ChildStdout,
        mut request_rx: mpsc::Receiver<PendingRequest>,
        tab_index: u8,
    ) {
        let mut reader = BufReader::new(stdout).lines();

        while let Some(pending) = request_rx.recv().await {
            // Mark busy
            {
                let mut inst = instance.lock().await;
                inst.state = KernelState::Busy;
            }

            // Serialize and send request
            let json = match serde_json::to_string(&pending.request) {
                Ok(j) => j,
                Err(e) => {
                    let _ = pending.responder.send(Err(e.to_string()));
                    let mut inst = instance.lock().await;
                    inst.state = KernelState::Idle;
                    continue;
                }
            };

            if let Err(e) = stdin.write_all(format!("{}\n", json).as_bytes()).await {
                let _ = pending.responder.send(Err(format!("stdin write failed: {}", e)));
                let mut inst = instance.lock().await;
                inst.state = KernelState::Error;
                break;
            }
            if let Err(e) = stdin.flush().await {
                let _ = pending.responder.send(Err(format!("stdin flush failed: {}", e)));
                let mut inst = instance.lock().await;
                inst.state = KernelState::Error;
                break;
            }

            // Read response line
            match reader.next_line().await {
                Ok(Some(line)) => {
                    match serde_json::from_str::<KernelResponse>(&line) {
                        Ok(response) => {
                            let _ = pending.responder.send(Ok(response));
                        }
                        Err(e) => {
                            let _ = pending
                                .responder
                                .send(Err(format!("Invalid response JSON: {} (line: {})", e, line)));
                        }
                    }
                    let mut inst = instance.lock().await;
                    inst.state = KernelState::Idle;
                }
                Ok(None) => {
                    // Stdout closed — kernel process died
                    let _ = pending
                        .responder
                        .send(Err("Kernel process terminated unexpectedly".to_string()));
                    let mut inst = instance.lock().await;
                    inst.state = KernelState::Error;
                    break;
                }
                Err(e) => {
                    let _ = pending
                        .responder
                        .send(Err(format!("stdout read error: {}", e)));
                    let mut inst = instance.lock().await;
                    inst.state = KernelState::Error;
                    break;
                }
            }
        }

        log::info!("Kernel I/O loop for tab {} exited", tab_index);
    }

    /// Execute code in a tab's kernel. Queues via the channel (FIFO).
    pub async fn execute(
        &self,
        tab_index: u8,
        cell_id: &str,
        code: &str,
    ) -> Result<KernelResponse, String> {
        let instance = self.get_instance(tab_index).await?;
        let request_tx = {
            let inst = instance.lock().await;
            if inst.state == KernelState::Stopped {
                return Err("Kernel is not running. Restart to continue.".to_string());
            }
            inst.request_tx
                .clone()
                .ok_or_else(|| "Kernel has no request channel".to_string())?
        };

        let request = KernelRequest {
            id: cell_id.to_string(),
            msg_type: "execute".to_string(),
            code: Some(code.to_string()),
        };

        let (tx, rx) = oneshot::channel();
        request_tx
            .send(PendingRequest {
                request,
                responder: tx,
            })
            .await
            .map_err(|_| "Failed to queue execution request".to_string())?;

        rx.await.map_err(|_| "Response channel closed".to_string())?
    }

    /// Send interrupt (SIGINT) to the kernel process. Falls back to SIGKILL after 2s.
    pub async fn interrupt(&self, tab_index: u8) -> Result<(), String> {
        let instance = self.get_instance(tab_index).await?;
        let mut inst = instance.lock().await;

        if let Some(ref child) = inst.child {
            if let Some(pid) = child.id() {
                // Send SIGINT
                unsafe {
                    libc::kill(pid as i32, libc::SIGINT);
                }
                // Schedule SIGKILL fallback after 2s
                let pid = pid as i32;
                tokio::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    unsafe {
                        libc::kill(pid, libc::SIGKILL);
                    }
                });
                Ok(())
            } else {
                inst.state = KernelState::Error;
                Err("Kernel process has no PID".to_string())
            }
        } else {
            Err("No kernel process running".to_string())
        }
    }

    /// Restart the kernel: kill current process, spawn new one.
    pub async fn restart(&self, tab_index: u8) -> Result<KernelState, String> {
        self.kill_kernel(tab_index).await;
        let instance = self
            .spawn_kernel(tab_index)
            .await
            .map_err(|e| format!("Failed to restart kernel: {}", e))?;
        let state = instance.lock().await.state;
        let mut kernels = self.kernels.lock().await;
        kernels.insert(tab_index, instance);
        Ok(state)
    }

    /// Stop the kernel: kill the process and mark as stopped.
    pub async fn stop(&self, tab_index: u8) -> Result<(), String> {
        self.kill_kernel(tab_index).await;
        let mut kernels = self.kernels.lock().await;
        // Insert a stopped sentinel
        kernels.insert(
            tab_index,
            Arc::new(Mutex::new(KernelInstance {
                state: KernelState::Stopped,
                child: None,
                request_tx: None,
            })),
        );
        Ok(())
    }

    /// Get current kernel state for a tab.
    pub async fn get_state(&self, tab_index: u8) -> KernelState {
        let instance = {
            let kernels = self.kernels.lock().await;
            kernels.get(&tab_index).cloned()
        };
        match instance {
            Some(instance) => instance.lock().await.state,
            None => KernelState::Stopped,
        }
    }

    /// Kill the kernel process for a tab.
    async fn kill_kernel(&self, tab_index: u8) {
        let instance = {
            let mut kernels = self.kernels.lock().await;
            kernels.remove(&tab_index)
        };
        if let Some(instance) = instance {
            let mut inst = instance.lock().await;
            // Drop the request channel to signal the I/O loop to exit
            inst.request_tx = None;
            if let Some(ref mut child) = inst.child {
                let _ = child.kill().await;
            }
            inst.child = None;
            inst.state = KernelState::Stopped;
        }
    }

    /// Get a kernel instance, returning error if it doesn't exist.
    async fn get_instance(&self, tab_index: u8) -> Result<Arc<Mutex<KernelInstance>>, String> {
        let kernels = self.kernels.lock().await;
        kernels
            .get(&tab_index)
            .cloned()
            .ok_or_else(|| format!("No kernel for tab {}", tab_index))
    }

    /// Kill all kernels (called on app shutdown).
    pub async fn shutdown(&self) {
        let mut kernels = self.kernels.lock().await;
        for (tab_index, instance) in kernels.drain() {
            let mut inst = instance.lock().await;
            inst.request_tx = None;
            if let Some(ref mut child) = inst.child {
                let _ = child.kill().await;
            }
            log::info!("Killed kernel for tab {}", tab_index);
        }
    }
}
