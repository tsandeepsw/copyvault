use std::path::PathBuf;

/// Interface for configuring launch-at-login behavior across platforms without external network dependencies.
pub trait AutostartManager: Send + Sync {
    fn is_enabled(&self) -> bool;
    fn set_enabled(&self, enable: bool) -> Result<(), String>;
}

/// Standard macOS LaunchAgent implementation (`~/Library/LaunchAgents/com.copyvault.app.plist`).
pub struct MacOsAutostartManager {
    plist_path: PathBuf,
}

impl MacOsAutostartManager {
    pub fn new() -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        let plist_path = PathBuf::from(home)
            .join("Library")
            .join("LaunchAgents")
            .join("com.copyvault.desktop.plist");
        Self { plist_path }
    }

    pub fn with_custom_path(path: PathBuf) -> Self {
        Self { plist_path: path }
    }
}

impl Default for MacOsAutostartManager {
    fn default() -> Self {
        Self::new()
    }
}

impl AutostartManager for MacOsAutostartManager {
    fn is_enabled(&self) -> bool {
        self.plist_path.exists()
    }

    fn set_enabled(&self, enable: bool) -> Result<(), String> {
        if enable {
            // Locate current executable path
            let current_exe = std::env::current_exe()
                .map_err(|e| format!("Failed to determine executable path: {}", e))?;
            let exe_str = current_exe.to_string_lossy();

            let plist_content = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.copyvault.desktop</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>ProcessType</key>
    <string>Interactive</string>
</dict>
</plist>
"#,
                exe_str
            );

            // Ensure parent directory exists
            if let Some(parent) = self.plist_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create LaunchAgents directory: {}", e))?;
            }

            std::fs::write(&self.plist_path, plist_content)
                .map_err(|e| format!("Failed to write LaunchAgent plist: {}", e))?;
            Ok(())
        } else {
            if self.plist_path.exists() {
                std::fs::remove_file(&self.plist_path)
                    .map_err(|e| format!("Failed to remove LaunchAgent plist: {}", e))?;
            }
            Ok(())
        }
    }
}

/// Fallback / Mock Autostart manager for tests and unconfigured platforms.
pub struct MockAutostartManager {
    enabled: std::sync::atomic::AtomicBool,
}

impl MockAutostartManager {
    pub fn new(initial: bool) -> Self {
        Self {
            enabled: std::sync::atomic::AtomicBool::new(initial),
        }
    }
}

impl Default for MockAutostartManager {
    fn default() -> Self {
        Self::new(false)
    }
}

impl AutostartManager for MockAutostartManager {
    fn is_enabled(&self) -> bool {
        self.enabled.load(std::sync::atomic::Ordering::SeqCst)
    }

    fn set_enabled(&self, enable: bool) -> Result<(), String> {
        self.enabled
            .store(enable, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_autostart_toggle() {
        let manager = MockAutostartManager::new(false);
        assert!(!manager.is_enabled());

        manager.set_enabled(true).expect("enable failed");
        assert!(manager.is_enabled());

        manager.set_enabled(false).expect("disable failed");
        assert!(!manager.is_enabled());
    }

    #[test]
    fn test_macos_plist_lifecycle() {
        let temp_dir = std::env::temp_dir().join(format!("copyvault_test_{}", std::process::id()));
        let plist_path = temp_dir.join("com.copyvault.desktop.plist");
        let manager = MacOsAutostartManager::with_custom_path(plist_path.clone());

        assert!(!manager.is_enabled());
        manager.set_enabled(true).expect("failed to write plist");
        assert!(manager.is_enabled());
        assert!(plist_path.exists());

        let content = std::fs::read_to_string(&plist_path).unwrap();
        assert!(content.contains("<string>com.copyvault.desktop</string>"));
        assert!(content.contains("<key>RunAtLoad</key>"));

        manager.set_enabled(false).expect("failed to delete plist");
        assert!(!manager.is_enabled());
        assert!(!plist_path.exists());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

