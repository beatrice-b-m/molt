use crate::config::ConfigState;
use crate::kernel::{KernelManager, KernelResponse};
use tauri::{AppHandle, State};

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

#[tauri::command]
pub fn set_native_effects(enabled: bool, app_handle: AppHandle) -> Result<(), String> {
    crate::set_main_window_native_effects(&app_handle, enabled)
}

#[tauri::command]
pub fn get_config() -> Result<String, String> {
    let config = crate::config::load_config();
    serde_json::to_string(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_config(config: String) -> Result<(), String> {
    let parsed: crate::config::AppConfig =
        serde_json::from_str(&config).map_err(|e| format!("Invalid config: {}", e))?;
    crate::config::save_config(&parsed)
}

#[tauri::command]
pub fn load_notebooks() -> Result<Option<String>, String> {
	crate::persistence::load_notebooks()
}

#[tauri::command]
pub fn save_notebooks(data: String) -> Result<(), String> {
	crate::persistence::save_notebooks(&data)
}