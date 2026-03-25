use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, RunEvent, WindowEvent,
};

mod commands;
mod config;
mod kernel;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
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
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
                }
                // Ensure the window starts hidden (menu bar app)
                let _ = window.hide();
            }

            // Build tray menu
            let quit = MenuItem::with_id(app, "quit", "Quit Molt", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .unwrap_or_else(|| Image::new_owned(vec![0; 4], 1, 1)),
                )
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
            match event {
                // Hide window instead of closing (menu bar app stays in tray)
                WindowEvent::CloseRequested { api, .. } => {
                    let _ = window.hide();
                    api.prevent_close();
                }
                // Menu bar convention: hide panel when it loses focus
                WindowEvent::Focused(false) => {
                    let _ = window.hide();
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Molt");

    // Use run_return-style loop to intercept ExitRequested for cleanup
    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { .. } = &event {
            // Kill all kernel subprocesses before the app exits
            let km = app_handle.state::<kernel::KernelManager>();
            // Block on the async shutdown — we're exiting anyway
            let rt = tokio::runtime::Handle::current();
            rt.block_on(km.shutdown());
            log::info!("All kernel subprocesses terminated");
        }
    });
}
