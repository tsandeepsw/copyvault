use super::error::PasteError;

/// Trait abstracting OS-specific synthetic keystroke dispatch and application focus management.
pub trait PasteSimulator: Send + Sync {
    /// Checks whether the running process has OS authorization to simulate input events (macOS Accessibility).
    fn check_accessibility(&self) -> bool;

    /// Triggers the native OS prompt to grant Accessibility permissions if not already granted.
    fn request_accessibility(&self);

    /// Simulates a paste keystroke (`Cmd+V` on macOS, `Ctrl+V` on Windows) into the currently active target window.
    fn simulate_paste_keystroke(&self) -> Result<(), PasteError>;

    /// Returns the bundle ID, process name, or window handle of the currently frontmost active application.
    fn get_foreground_app(&self) -> Option<String>;

    /// Attempts to restore focus to a target application previously recorded before CopyVault was summoned.
    fn activate_app(&self, app_id: &str) -> Result<(), PasteError>;
}

