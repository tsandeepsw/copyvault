use std::sync::atomic::{AtomicBool, Ordering};

/// Supported modifier flags for global shortcuts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ShortcutModifiers {
    pub cmd_or_ctrl: bool,
    pub shift: bool,
    pub alt: bool,
}

/// Parsed representation of a global hotkey combination.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedShortcut {
    pub raw: String,
    pub modifiers: ShortcutModifiers,
    pub key: String,
}

impl ParsedShortcut {
    /// Parses a string representation (e.g. "Cmd+Shift+V", "Ctrl+Shift+V", "Alt+Space") into structured tokens.
    pub fn parse(input: &str) -> Result<Self, String> {
        let parts: Vec<&str> = input.split('+').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        if parts.is_empty() {
            return Err("Shortcut cannot be empty".to_string());
        }

        let mut cmd_or_ctrl = false;
        let mut shift = false;
        let mut alt = false;
        let mut key: Option<String> = None;

        for part in parts {
            let lower = part.to_lowercase();
            match lower.as_str() {
                "cmd" | "command" | "ctrl" | "control" | "super" => cmd_or_ctrl = true,
                "shift" => shift = true,
                "alt" | "option" => alt = true,
                other => {
                    if let Some(existing) = key {
                        return Err(format!("Multiple primary keys specified: '{}' and '{}'", existing, other));
                    }
                    key = Some(other.to_uppercase());
                }
            }
        }

        let key = key.ok_or_else(|| "Shortcut must include a primary key (e.g. 'V', 'Space')".to_string())?;

        // Guard: A global shortcut MUST contain at least one modifier to prevent hijacking normal typing!
        if !cmd_or_ctrl && !shift && !alt {
            return Err("Global shortcut must include at least one modifier key (Cmd/Ctrl, Shift, or Alt)".to_string());
        }

        Ok(Self {
            raw: input.to_string(),
            modifiers: ShortcutModifiers {
                cmd_or_ctrl,
                shift,
                alt,
            },
            key,
        })
    }
}

/// Abstract interface for managing system-level global hotkey registration and callbacks.
pub trait HotkeyManager: Send + Sync {
    /// Attempts to register a global hotkey with the operating system.
    fn register(&self, shortcut: &str, on_trigger: Box<dyn Fn() + Send + Sync + 'static>) -> Result<(), String>;

    /// Unregisters any currently active global hotkey.
    fn unregister(&self) -> Result<(), String>;

    /// Returns whether a global shortcut is currently registered and active.
    fn is_registered(&self) -> bool;

    /// Checks if a proposed shortcut conflicts with reserved system shortcuts.
    fn validate_shortcut(&self, shortcut: &str) -> Result<ParsedShortcut, String> {
        let parsed = ParsedShortcut::parse(shortcut)?;
        
        // Check for catastrophic system conflicts
        if parsed.modifiers.cmd_or_ctrl
            && !parsed.modifiers.shift
            && !parsed.modifiers.alt
            && (parsed.key == "C" || parsed.key == "V" || parsed.key == "X" || parsed.key == "Z" || parsed.key == "Q")
        {
            return Err(format!(
                "Shortcut '{}' conflicts with standard system edit/quit shortcuts",
                shortcut
            ));
        }
        Ok(parsed)
    }
}

/// Mock Hotkey Manager for unit testing and headless environments.
pub struct MockHotkeyManager {
    is_active: AtomicBool,
    current_shortcut: std::sync::Mutex<Option<String>>,
}

impl MockHotkeyManager {
    pub fn new() -> Self {
        Self {
            is_active: AtomicBool::new(false),
            current_shortcut: std::sync::Mutex::new(None),
        }
    }
}

impl Default for MockHotkeyManager {
    fn default() -> Self {
        Self::new()
    }
}

impl HotkeyManager for MockHotkeyManager {
    fn register(&self, shortcut: &str, _on_trigger: Box<dyn Fn() + Send + Sync + 'static>) -> Result<(), String> {
        self.validate_shortcut(shortcut)?;
        let mut lock = self.current_shortcut.lock().unwrap();
        *lock = Some(shortcut.to_string());
        self.is_active.store(true, Ordering::SeqCst);
        Ok(())
    }

    fn unregister(&self) -> Result<(), String> {
        let mut lock = self.current_shortcut.lock().unwrap();
        *lock = None;
        self.is_active.store(false, Ordering::SeqCst);
        Ok(())
    }

    fn is_registered(&self) -> bool {
        self.is_active.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_shortcuts() {
        let sc1 = ParsedShortcut::parse("Cmd+Shift+V").expect("parse failed");
        assert!(sc1.modifiers.cmd_or_ctrl);
        assert!(sc1.modifiers.shift);
        assert!(!sc1.modifiers.alt);
        assert_eq!(sc1.key, "V");

        let sc2 = ParsedShortcut::parse("Ctrl + Alt + Space").expect("parse failed");
        assert!(sc2.modifiers.cmd_or_ctrl);
        assert!(!sc2.modifiers.shift);
        assert!(sc2.modifiers.alt);
        assert_eq!(sc2.key, "SPACE");
    }

    #[test]
    fn test_parse_invalid_shortcuts() {
        // Missing modifier (hijacks typing)
        assert!(ParsedShortcut::parse("V").is_err());
        assert!(ParsedShortcut::parse("").is_err());
        assert!(ParsedShortcut::parse("Ctrl+").is_err());
    }

    #[test]
    fn test_conflict_detection_with_system_shortcuts() {
        let manager = MockHotkeyManager::new();
        // Cmd+C / Cmd+V conflicts
        assert!(manager.validate_shortcut("Cmd+C").is_err());
        assert!(manager.validate_shortcut("Ctrl+V").is_err());

        // Cmd+Shift+V is safe and approved
        assert!(manager.validate_shortcut("Cmd+Shift+V").is_ok());
    }

    #[test]
    fn test_hotkey_manager_lifecycle() {
        let manager = MockHotkeyManager::new();
        assert!(!manager.is_registered());

        manager.register("Cmd+Shift+V", Box::new(|| {})).expect("register failed");
        assert!(manager.is_registered());

        manager.unregister().expect("unregister failed");
        assert!(!manager.is_registered());
    }
}
