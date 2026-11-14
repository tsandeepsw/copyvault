use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::db::service::DatabaseService;
use crate::paste::PasteSimulator;
pub use self::autostart::{AutostartManager, MacOsAutostartManager, MockAutostartManager};
pub use self::hotkey::{HotkeyManager, MockHotkeyManager};

pub mod autostart;
pub mod hotkey;
pub mod tray;

pub const QUICK_PANEL_WIDTH: f64 = 720.0;
pub const QUICK_PANEL_HEIGHT: f64 = 460.0;
pub const FULL_WORKSPACE_WIDTH: f64 = 960.0;
pub const FULL_WORKSPACE_HEIGHT: f64 = 680.0;

/// Desktop and window management preferences stored in SQLite.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopSettings {
    pub global_shortcut: String,
    pub launch_at_login: bool,
    pub auto_hide_on_blur: bool,
    pub compact_density: bool,
    pub theme: String,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            global_shortcut: "Cmd+Shift+V".to_string(),
            launch_at_login: false,
            auto_hide_on_blur: false,
            compact_density: false,
            theme: "dark".to_string(),
        }
    }
}

/// Window Manager coordinator handling quick panel visibility, target app focus caching, and desktop integration.
pub struct WindowManager {
    db_service: DatabaseService,
    simulator: Arc<dyn PasteSimulator>,
    autostart: Arc<dyn AutostartManager>,
    last_target_app: std::sync::Mutex<Option<String>>,
    is_quick_panel: std::sync::atomic::AtomicBool,
}

impl WindowManager {
    pub fn new(
        db_service: DatabaseService,
        simulator: Arc<dyn PasteSimulator>,
    ) -> Self {
        #[cfg(target_os = "macos")]
        let autostart: Arc<dyn AutostartManager> = Arc::new(MacOsAutostartManager::new());

        #[cfg(not(target_os = "macos"))]
        let autostart: Arc<dyn AutostartManager> = Arc::new(MockAutostartManager::new(false));

        Self {
            db_service,
            simulator,
            autostart,
            last_target_app: std::sync::Mutex::new(None),
            is_quick_panel: std::sync::atomic::AtomicBool::new(false),
        }
    }

    pub fn with_autostart(
        db_service: DatabaseService,
        simulator: Arc<dyn PasteSimulator>,
        autostart: Arc<dyn AutostartManager>,
    ) -> Self {
        Self {
            db_service,
            simulator,
            autostart,
            last_target_app: std::sync::Mutex::new(None),
            is_quick_panel: std::sync::atomic::AtomicBool::new(false),
        }
    }

    /// Sets whether the window is currently presenting as the compact quick panel overlay.
    pub fn set_quick_panel_mode(&self, active: bool) {
        self.is_quick_panel.store(active, std::sync::atomic::Ordering::SeqCst);
    }

    /// Returns whether the window is currently in compact quick panel overlay mode.
    pub fn is_quick_panel_mode(&self) -> bool {
        self.is_quick_panel.load(std::sync::atomic::Ordering::SeqCst)
    }

    /// Determines whether the window should auto-hide when losing focus (blur).
    /// Never hides workspace mode on blur, only the quick panel overlay if user enabled it.
    pub fn should_auto_hide_on_blur(&self) -> bool {
        self.get_settings().auto_hide_on_blur && self.is_quick_panel_mode()
    }

    /// Records the frontmost target application before CopyVault is focused.
    pub fn record_foreground_target(&self) {
        if let Some(target) = self.simulator.get_foreground_app() {
            let mut lock = self.last_target_app.lock().unwrap();
            *lock = Some(target);
        }
    }

    /// Retrieves and clears the cached target application handle.
    pub fn take_last_target_app(&self) -> Option<String> {
        let mut lock = self.last_target_app.lock().unwrap();
        lock.take()
    }

    /// Loads desktop settings from SQLite settings table.
    pub fn get_settings(&self) -> DesktopSettings {
        let mut settings = DesktopSettings::default();

        if let Ok(Some(s)) = self.db_service.get_setting("global_shortcut") {
            settings.global_shortcut = s;
        }
        if let Ok(Some(s)) = self.db_service.get_setting("launch_at_login") {
            settings.launch_at_login = s == "true" || s == "1";
        }
        if let Ok(Some(s)) = self.db_service.get_setting("auto_hide_on_blur") {
            settings.auto_hide_on_blur = s == "true" || s == "1";
        }
        if let Ok(Some(s)) = self.db_service.get_setting("compact_density") {
            settings.compact_density = s == "true" || s == "1";
        }
        if let Ok(Some(s)) = self.db_service.get_setting("theme") {
            settings.theme = s;
        }

        // Sync with real OS autostart status
        settings.launch_at_login = self.autostart.is_enabled();
        settings
    }

    /// Saves updated desktop settings to SQLite.
    pub fn update_settings(&self, new_settings: &DesktopSettings) -> Result<(), String> {
        self.db_service
            .set_setting("global_shortcut", &new_settings.global_shortcut)
            .map_err(|e| e.to_string())?;

        self.db_service
            .set_setting(
                "launch_at_login",
                if new_settings.launch_at_login { "true" } else { "false" },
            )
            .map_err(|e| e.to_string())?;

        self.db_service
            .set_setting(
                "auto_hide_on_blur",
                if new_settings.auto_hide_on_blur { "true" } else { "false" },
            )
            .map_err(|e| e.to_string())?;

        self.db_service
            .set_setting(
                "compact_density",
                if new_settings.compact_density { "true" } else { "false" },
            )
            .map_err(|e| e.to_string())?;

        self.db_service
            .set_setting("theme", &new_settings.theme)
            .map_err(|e| e.to_string())?;

        // Synchronize OS autostart registration
        self.autostart.set_enabled(new_settings.launch_at_login)?;

        Ok(())
    }

    /// Shows the main quick panel window, centers it, and focuses it.
    pub fn show_quick_panel(app: &AppHandle) -> Result<(), String> {
        if let Some(window) = app.get_webview_window("main") {
            // Apply quick panel dimensions
            let _ = window.set_size(tauri::LogicalSize::new(QUICK_PANEL_WIDTH, QUICK_PANEL_HEIGHT));
            let _ = window.center();
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            Ok(())
        } else {
            Err("Main window not found".to_string())
        }
    }

    /// Hides the CopyVault launcher window smoothly without affecting the clipboard.
    pub fn hide_window(app: &AppHandle) -> Result<(), String> {
        if let Some(window) = app.get_webview_window("main") {
            window.hide().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("Main window not found".to_string())
        }
    }

    /// Toggles visibility of the quick panel.
    pub fn toggle_quick_panel(app: &AppHandle) -> Result<bool, String> {
        if let Some(window) = app.get_webview_window("main") {
            let is_visible = window.is_visible().unwrap_or(false);
            if is_visible {
                window.hide().map_err(|e| e.to_string())?;
                Ok(false)
            } else {
                Self::show_quick_panel(app)?;
                Ok(true)
            }
        } else {
            Err("Main window not found".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::service::DatabaseService;
    use crate::paste::MockPasteSimulator;
    use crate::window::autostart::MockAutostartManager;

    fn create_test_window_manager() -> (WindowManager, tempfile_guard::TempDb) {
        let temp_db = tempfile_guard::TempDb::new();
        let db_service = DatabaseService::open(&temp_db.path).expect("open db failed");
        let simulator = Arc::new(MockPasteSimulator::new(true));
        let autostart = Arc::new(MockAutostartManager::new(false));
        let manager = WindowManager::with_autostart(db_service, simulator, autostart);
        (manager, temp_db)
    }

    mod tempfile_guard {
        use std::path::PathBuf;
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(1);

        pub struct TempDb {
            pub path: PathBuf,
        }
        impl TempDb {
            pub fn new() -> Self {
                let count = COUNTER.fetch_add(1, Ordering::SeqCst);
                let path = std::env::temp_dir().join(format!("cv_test_win_{}_{}.db", std::process::id(), count));
                Self { path }
            }
        }
        impl Drop for TempDb {
            fn drop(&mut self) {
                let _ = std::fs::remove_file(&self.path);
            }
        }
    }

    #[test]
    fn test_desktop_settings_lifecycle_and_autostart_sync() {
        let (manager, _guard) = create_test_window_manager();

        let initial = manager.get_settings();
        assert_eq!(initial.global_shortcut, "Cmd+Shift+V");
        assert!(!initial.launch_at_login);
        assert!(!initial.auto_hide_on_blur);
        assert!(!manager.should_auto_hide_on_blur());

        let updated = DesktopSettings {
            global_shortcut: "Ctrl+Shift+V".to_string(),
            launch_at_login: true,
            auto_hide_on_blur: false,
            compact_density: true,
            theme: "light".to_string(),
        };

        manager.update_settings(&updated).expect("update failed");

        let loaded = manager.get_settings();
        assert_eq!(loaded.global_shortcut, "Ctrl+Shift+V");
        assert!(loaded.launch_at_login);
        assert!(!loaded.auto_hide_on_blur);
        assert!(loaded.compact_density);
        assert_eq!(loaded.theme, "light");
    }

    #[test]
    fn test_foreground_target_recording() {
        let (manager, _guard) = create_test_window_manager();

        assert_eq!(manager.take_last_target_app(), None);
        manager.record_foreground_target();
        // MockPasteSimulator returns Some("com.apple.Terminal") by default
        assert_eq!(manager.take_last_target_app(), Some("com.apple.Terminal".to_string()));
        // Once taken, cached target is cleared
        assert_eq!(manager.take_last_target_app(), None);
    }

    #[test]
    fn test_quick_panel_and_workspace_dimensions() {
        assert_eq!(QUICK_PANEL_WIDTH, 720.0);
        assert_eq!(QUICK_PANEL_HEIGHT, 460.0);
        assert_eq!(FULL_WORKSPACE_WIDTH, 960.0);
        assert_eq!(FULL_WORKSPACE_HEIGHT, 680.0);
    }
}
