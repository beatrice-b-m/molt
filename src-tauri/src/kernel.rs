use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};

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
    execution: u64,
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
        Self::validate_tab(tab_index)?;
        // Keep the map lock through insertion so concurrent first views cannot
        // spawn two processes for the same tab.
        let mut kernels = self.kernels.lock().await;
        if let Some(instance) = kernels.get(&tab_index) {
            return Ok(instance.lock().await.state);
        }
        let instance = self.spawn_kernel(tab_index).await?;
        kernels.insert(tab_index, instance);
        Ok(KernelState::Idle)
    }

    fn validate_tab(tab_index: u8) -> Result<(), String> {
        if tab_index < 4 {
            Ok(())
        } else {
            Err(format!("Invalid tab index: {}", tab_index))
        }
    }

    /// Spawn a new kernel subprocess and its I/O processing loop.
    async fn spawn_kernel(&self, tab_index: u8) -> Result<Arc<Mutex<KernelInstance>>, String> {
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
        let mut stderr = child.stderr.take().ok_or("Failed to open kernel stderr")?;
        // Native extensions and subprocesses bypass Python's StringIO capture.
        // Drain stderr so a full pipe cannot deadlock execution.
        tokio::spawn(async move {
            let _ = tokio::io::copy(&mut stderr, &mut tokio::io::sink()).await;
        });

        let (request_tx, request_rx) = mpsc::channel::<PendingRequest>(64);

        let instance = Arc::new(Mutex::new(KernelInstance {
            state: KernelState::Idle,
            child: Some(child),
            request_tx: Some(request_tx),
            execution: 0,
        }));

        // Spawn the I/O loop
        let instance_ref = instance.clone();
        tokio::spawn(async move {
            Self::kernel_io_loop(instance_ref, stdin, stdout, request_rx, tab_index).await;
        });

        // Do not report ready merely because an executable was spawned. Verify
        // that the bundled server has installed its handlers and speaks our protocol.
        let (tx, rx) = oneshot::channel();
        let sender = instance
            .lock()
            .await
            .request_tx
            .clone()
            .ok_or("Kernel channel closed")?;
        let readiness = async {
            sender
                .send(PendingRequest {
                    request: KernelRequest {
                        id: uuid::Uuid::new_v4().to_string(),
                        msg_type: "ping".into(),
                        code: None,
                    },
                    responder: tx,
                })
                .await
                .map_err(|_| "Kernel startup channel closed".to_string())?;
            let response = rx
                .await
                .map_err(|_| "Kernel startup response closed".to_string())??;
            if response.stdout == "pong" && response.error.is_none() {
                Ok(())
            } else {
                Err("Kernel failed its startup handshake".to_string())
            }
        };
        let ready = tokio::time::timeout(std::time::Duration::from_secs(5), readiness)
            .await
            .unwrap_or_else(|_| Err("Kernel startup timed out".into()));
        if let Err(error) = ready {
            Self::stop_instance(&instance).await;
            return Err(error);
        }
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
                if matches!(inst.state, KernelState::Stopped | KernelState::Error) {
                    let _ = pending
                        .responder
                        .send(Err("Kernel is not running. Restart to continue.".into()));
                    break;
                }
                inst.execution += 1;
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
                let _ = pending
                    .responder
                    .send(Err(format!("stdin write failed: {}", e)));
                let mut inst = instance.lock().await;
                inst.state = KernelState::Error;
                break;
            }
            if let Err(e) = stdin.flush().await {
                let _ = pending
                    .responder
                    .send(Err(format!("stdin flush failed: {}", e)));
                let mut inst = instance.lock().await;
                inst.state = KernelState::Error;
                break;
            }

            let result = match reader.next_line().await {
                Ok(Some(line)) => serde_json::from_str::<KernelResponse>(&line)
                    .map_err(|e| format!("Invalid kernel response: {}", e))
                    .and_then(|response| {
                        if response.id == pending.request.id && response.msg_type == "result" {
                            Ok(response)
                        } else {
                            Err("Kernel response does not match the request".into())
                        }
                    }),
                Ok(None) => Err("Kernel process terminated unexpectedly".into()),
                Err(e) => Err(format!("stdout read error: {}", e)),
            };
            let failed = result.is_err();
            {
                let mut inst = instance.lock().await;
                if inst.state == KernelState::Busy {
                    inst.state = if failed {
                        KernelState::Error
                    } else {
                        KernelState::Idle
                    };
                }
            }
            let _ = pending.responder.send(result);
            if failed {
                break;
            }
        }

        // Break the instance/channel ownership cycle and reap failed children.
        let mut inst = instance.lock().await;
        inst.request_tx = None;
        if let Some(mut child) = inst.child.take() {
            let _ = child.kill().await;
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
            if matches!(inst.state, KernelState::Stopped | KernelState::Error) {
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

        rx.await
            .map_err(|_| "Response channel closed".to_string())?
    }

    /// Send interrupt (SIGINT) to the kernel process. Falls back to SIGKILL after 2s.
    pub async fn interrupt(&self, tab_index: u8) -> Result<(), String> {
        let instance = self.get_instance(tab_index).await?;
        let mut inst = instance.lock().await;
        if inst.state != KernelState::Busy {
            return Ok(());
        }
        let execution = inst.execution;
        let child = inst.child.as_mut().ok_or("No kernel process running")?;
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            return Err("Kernel process has exited".into());
        }
        let pid = child.id().ok_or("Kernel process has no PID")?;
        if unsafe { libc::kill(pid as i32, libc::SIGINT) } != 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        drop(inst);
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let mut inst = instance.lock().await;
            // Only kill the owned process if this exact execution is still busy.
            // A completed interrupt, subsequent cell, or restart cancels fallback.
            if inst.state == KernelState::Busy && inst.execution == execution {
                inst.state = KernelState::Error;
                inst.request_tx = None;
                if let Some(mut child) = inst.child.take() {
                    let _ = child.kill().await;
                }
            }
        });
        Ok(())
    }

    /// Restart the kernel: kill current process, spawn new one.
    pub async fn restart(&self, tab_index: u8) -> Result<KernelState, String> {
        Self::validate_tab(tab_index)?;
        let mut kernels = self.kernels.lock().await;
        if let Some(instance) = kernels.remove(&tab_index) {
            Self::stop_instance(&instance).await;
        }
        let instance = self.spawn_kernel(tab_index).await?;
        kernels.insert(tab_index, instance);
        Ok(KernelState::Idle)
    }

    /// Stop the kernel and retain a sentinel so viewing a tab cannot restart it.
    pub async fn stop(&self, tab_index: u8) -> Result<(), String> {
        Self::validate_tab(tab_index)?;
        let mut kernels = self.kernels.lock().await;
        if let Some(instance) = kernels.get(&tab_index) {
            Self::stop_instance(instance).await;
        } else {
            kernels.insert(
                tab_index,
                Arc::new(Mutex::new(KernelInstance {
                    state: KernelState::Stopped,
                    child: None,
                    request_tx: None,
                    execution: 0,
                })),
            );
        }
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

    async fn stop_instance(instance: &Mutex<KernelInstance>) {
        let mut inst = instance.lock().await;
        inst.state = KernelState::Stopped;
        inst.request_tx = None;
        if let Some(mut child) = inst.child.take() {
            let _ = child.kill().await;
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
        for (_, instance) in kernels.drain() {
            Self::stop_instance(&instance).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn manager() -> Arc<KernelManager> {
        Arc::new(KernelManager::new(
            "python3".into(),
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/kernel_server.py"),
        ))
    }

    async fn run(manager: &KernelManager, tab: u8, code: &str) -> Result<KernelResponse, String> {
        tokio::time::timeout(Duration::from_secs(8), manager.execute(tab, "test", code))
            .await
            .expect("execution timed out")
    }

    #[tokio::test]
    async fn executable_without_kernel_protocol_is_not_reported_ready() {
        let manager = KernelManager::new("/usr/bin/true".into(), PathBuf::from("unused"));
        assert!(manager.ensure_kernel(0).await.is_err());
        assert_eq!(manager.get_state(0).await, KernelState::Stopped);
        manager.shutdown().await;
    }

    #[tokio::test]
    async fn simultaneous_start_has_one_owner_and_tabs_are_isolated() {
        let manager = manager();
        let (a, b) = tokio::join!(manager.ensure_kernel(0), manager.ensure_kernel(0));
        assert_eq!(a.unwrap(), KernelState::Idle);
        assert_eq!(b.unwrap(), KernelState::Idle);
        assert_eq!(manager.kernels.lock().await.len(), 1);
        run(&manager, 0, "x = 42").await.unwrap();
        manager.ensure_kernel(1).await.unwrap();
        assert!(run(&manager, 1, "x")
            .await
            .unwrap()
            .error
            .unwrap()
            .contains("NameError"));
        assert_eq!(run(&manager, 0, "x").await.unwrap().stdout, "42\n");
        manager.shutdown().await;
    }

    #[tokio::test]
    async fn stop_requires_restart_and_restart_clears_namespace() {
        let manager = manager();
        manager.ensure_kernel(0).await.unwrap();
        run(&manager, 0, "x = 42").await.unwrap();
        manager.stop(0).await.unwrap();
        assert_eq!(
            manager.ensure_kernel(0).await.unwrap(),
            KernelState::Stopped
        );
        assert!(run(&manager, 0, "x").await.is_err());
        manager.restart(0).await.unwrap();
        assert!(run(&manager, 0, "x").await.unwrap().error.is_some());
        assert!(manager.ensure_kernel(4).await.is_err());
        manager.shutdown().await;
    }

    #[tokio::test]
    async fn stderr_cannot_fill_pipe_and_crashes_are_reported() {
        let manager = manager();
        manager.ensure_kernel(0).await.unwrap();
        assert!(
            run(&manager, 0, "import os; n = os.write(2, b'x' * 200000)")
                .await
                .unwrap()
                .error
                .is_none()
        );
        assert!(run(&manager, 0, "os._exit(1)").await.is_err());
        assert_eq!(manager.get_state(0).await, KernelState::Error);
        manager.shutdown().await;
    }

    async fn interrupt_case(ignore: bool) {
        let manager = manager();
        manager.ensure_kernel(0).await.unwrap();
        let marker = std::env::temp_dir().join(format!("molt-interrupt-{}", uuid::Uuid::new_v4()));
        let code = format!(
            "import signal, pathlib\n{}\npathlib.Path({:?}).touch()\nwhile True: pass",
            if ignore {
                "signal.signal(signal.SIGINT, signal.SIG_IGN)"
            } else {
                ""
            },
            marker.to_string_lossy(),
        );
        let running_manager = manager.clone();
        let execution = tokio::spawn(async move { run(&running_manager, 0, &code).await });
        tokio::time::timeout(Duration::from_secs(5), async {
            while !marker.exists() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("kernel never became ready");
        manager.interrupt(0).await.unwrap();
        let result = execution.await.unwrap();
        if ignore {
            assert!(result.is_err());
            assert_eq!(manager.get_state(0).await, KernelState::Error);
        } else {
            assert!(result.unwrap().error.unwrap().contains("KeyboardInterrupt"));
            // The old fallback must not kill the next execution either.
            assert_eq!(
                run(&manager, 0, "import time; time.sleep(2.2); 42")
                    .await
                    .unwrap()
                    .stdout,
                "42\n"
            );
        }
        manager.shutdown().await;
        std::fs::remove_file(marker).unwrap();
    }

    #[tokio::test]
    async fn successful_interrupt_preserves_kernel_and_next_execution() {
        interrupt_case(false).await;
    }

    #[tokio::test]
    async fn ignored_interrupt_kills_only_the_owned_kernel() {
        interrupt_case(true).await;
    }
}
