use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

mod commands;
mod config;
mod kernel;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_positioner::init())
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
            // Store warning for frontend to query
            app.manage(config::ConfigState::new(warning));

            // Initialize kernel manager
            app.manage(kernel::KernelManager::new(
                config::resolve_interpreter(),
                config::resolve_kernel_script_path(app.handle()),
            ));

            // Build tray menu
            let quit = MenuItem::with_id(app, "quit", "Quit Molt", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap_or_else(|| Image::new_owned(vec![0; 4], 1, 1)))
                .icon_as_template(true)
                .menu(&menu)
                .tooltip("Molt")
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    use tauri::tray::TrayIconEvent;
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                // Position window near tray icon
                                use tauri_plugin_positioner::{Position, WindowExt};
                                let _ = window.move_window(Position::TrayCenter);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide window instead of closing (menu bar app behavior)
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Molt");
}
