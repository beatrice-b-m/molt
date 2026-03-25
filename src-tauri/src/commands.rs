use crate::config::ConfigState;
use crate::kernel::{KernelManager, KernelResponse};
use tauri::State;

#[tauri::command]
pub async fn ensure_kernel(
    tab_index: u8,
    kernel_manager: State<'_, KernelManager>,
) -> Result<String, String> {
    let state = kernel_manager.ensure_kernel(tab_index).await?;
    serde_json::to_string(&state).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_cell(
    tab_index: u8,
    cell_id: String,
    code: String,
    kernel_manager: State<'_, KernelManager>,
) -> Result<KernelResponse, String> {
    kernel_manager.execute(tab_index, &cell_id, &code).await
}

#[tauri::command]
pub async fn restart_kernel(
    tab_index: u8,
    kernel_manager: State<'_, KernelManager>,
) -> Result<String, String> {
    let state = kernel_manager.restart(tab_index).await?;
    serde_json::to_string(&state).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_kernel(
    tab_index: u8,
    kernel_manager: State<'_, KernelManager>,
) -> Result<(), String> {
    kernel_manager.stop(tab_index).await
}

#[tauri::command]
pub async fn interrupt_kernel(
    tab_index: u8,
    kernel_manager: State<'_, KernelManager>,
) -> Result<(), String> {
    kernel_manager.interrupt(tab_index).await
}

#[tauri::command]
pub async fn get_kernel_status(
    tab_index: u8,
    kernel_manager: State<'_, KernelManager>,
) -> Result<String, String> {
    let state = kernel_manager.get_state(tab_index).await;
    serde_json::to_string(&state).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_config_warning(
    config_state: State<'_, ConfigState>,
) -> Result<Option<String>, String> {
    let warning = config_state
        .warning
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(warning.clone())
}
