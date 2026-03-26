use tauri::{Manager, RunEvent};

mod commands;
mod config;
mod kernel;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::execute_cell,
            commands::restart_kernel,
            commands::stop_kernel,
            commands::interrupt_kernel,
            commands::ensure_kernel,
            commands::get_kernel_status,
            commands::get_config_warning,
        ])
        .setup(|app| {
            // Validate Python interpreter at startup
            let warning = config::validate_interpreter();
            if let Some(ref msg) = warning {
                log::warn!("Interpreter validation failed: {}", msg);
            }
            app.manage(config::ConfigState::new(warning));

            // Initialize kernel manager
            app.manage(kernel::KernelManager::new(
                config::resolve_interpreter(),
                config::resolve_kernel_script_path(app.handle()),
            ));

            // Apply macOS vibrancy to the main window (frosted glass appearance)
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                    let _ =
                        apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
                }
            }

            log::info!("Molt initialized");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Molt");

    // Intercept ExitRequested for kernel subprocess cleanup
    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { .. } = &event {
            let km = app_handle.state::<kernel::KernelManager>();
            let rt = tokio::runtime::Handle::current();
            rt.block_on(km.shutdown());
            log::info!("All kernel subprocesses terminated");
        }
    });
}
