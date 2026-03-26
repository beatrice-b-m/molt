use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::{Manager, RunEvent};

mod commands;
mod config;
mod kernel;
mod theme;

/// Opens (or focuses) the settings window.
fn open_settings_window(app_handle: &tauri::AppHandle) {
    // If the window already exists, just bring it to front.
    if let Some(window) = app_handle.get_webview_window("settings") {
        let _ = window.set_focus();
        return;
    }

    let url = tauri::WebviewUrl::App("settings.html".into());
    let builder = tauri::WebviewWindowBuilder::new(app_handle, "settings", url)
        .title("Settings")
        .inner_size(520.0, 480.0)
        .resizable(true)
        .minimizable(true)
        .maximizable(false);

    match builder.build() {
        Ok(_) => {}
        Err(e) => log::error!("Failed to open settings window: {}", e),
    }
}

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
            commands::list_themes,
            commands::load_theme,
            commands::load_active_theme,
            commands::get_config,
            commands::save_config,
        ])
        .setup(|app| {
            // Validate Python interpreter at startup
            let warning = config::validate_interpreter();
            if let Some(ref msg) = warning {
                log::warn!("Interpreter validation failed: {}", msg);
            }
            app.manage(config::ConfigState::new(warning));

            // Copy bundled default themes to user config dir if needed
            theme::ensure_default_themes(app.handle());

            // Initialize kernel manager
            app.manage(kernel::KernelManager::new(
                config::resolve_interpreter(),
                config::resolve_kernel_script_path(app.handle()),
            ));

            // Build the native menu bar
            let file_menu = SubmenuBuilder::new(app, "File")
                .text("settings", "Settings...")
                .separator()
                .close_window()
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&window_menu)
                .build()?;

            app.set_menu(menu)?;

            // Handle menu events
            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                if event.id().0 == "settings" {
                    open_settings_window(&handle);
                }
            });

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
