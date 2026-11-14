use std::sync::Arc;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::clipboard::ClipboardService;
use crate::window::WindowManager;

pub const TRAY_ID: &str = "copyvault-tray";

pub struct TrayManager;

impl TrayManager {
    /// Creates and attaches the system tray icon and menu to the running application.
    pub fn setup_tray(app: &AppHandle) -> Result<TrayIcon, tauri::Error> {
        // Construct context menu items
        let item_open = MenuItem::with_id(app, "open_quick_panel", "Show Quick Panel (⌘⇧V)", true, None::<&str>)?;
        let item_history = MenuItem::with_id(app, "open_history", "Open All History", true, None::<&str>)?;
        let sep1 = PredefinedMenuItem::separator(app)?;
        let item_pause = MenuItem::with_id(app, "toggle_pause", "Pause Monitoring", true, None::<&str>)?;
        let item_clear = MenuItem::with_id(app, "clear_history", "Clear History...", true, None::<&str>)?;
        let sep2 = PredefinedMenuItem::separator(app)?;
        let item_settings = MenuItem::with_id(app, "open_settings", "Settings...", true, None::<&str>)?;
        let item_quit = MenuItem::with_id(app, "quit", "Quit CopyVault", true, None::<&str>)?;

        let menu = Menu::with_items(
            app,
            &[
                &item_open,
                &item_history,
                &sep1,
                &item_pause,
                &item_clear,
                &sep2,
                &item_settings,
                &item_quit,
            ],
        )?;

        let mut builder = TrayIconBuilder::with_id(TRAY_ID)
            .tooltip("CopyVault - Local-First Clipboard Manager")
            .menu(&menu)
            .show_menu_on_left_click(false);

        if let Some(icon) = app.default_window_icon() {
            builder = builder.icon(icon.clone());
        }

        let tray = builder
            .on_menu_event(|app, event| {
                match event.id.as_ref() {
                    "open_quick_panel" => {
                        let _ = WindowManager::show_quick_panel(app);
                    }
                    "open_history" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.set_size(tauri::LogicalSize::new(
                                crate::window::FULL_WORKSPACE_WIDTH,
                                crate::window::FULL_WORKSPACE_HEIGHT,
                            ));
                            let _ = window.center();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "toggle_pause" => {
                        if let Some(clipboard) = app.try_state::<Arc<ClipboardService>>() {
                            if clipboard.is_paused() {
                                clipboard.resume();
                            } else {
                                clipboard.pause();
                            }
                        }
                    }
                    "clear_history" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("copyvault://prompt-clear-history", ());
                        }
                    }
                    "open_settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("copyvault://open-settings", ());
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                }
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    let app = tray.app_handle();
                    let _ = WindowManager::toggle_quick_panel(app);
                }
            })
            .build(app)?;

        Ok(tray)
    }
}
