use super::error::PasteError;
use super::simulator::PasteSimulator;

/// Windows implementation stub for `PasteSimulator`.
/// Note: Marked as Unverified on Windows until tested on native Windows hardware.
pub struct WindowsPasteSimulator;

impl WindowsPasteSimulator {
    pub fn new() -> Self {
        Self
    }
}

impl Default for WindowsPasteSimulator {
    fn default() -> Self {
        Self::new()
    }
}

impl PasteSimulator for WindowsPasteSimulator {
    fn check_accessibility(&self) -> bool {
        // Windows does not require macOS Accessibility permissions for SendInput
        true
    }

    fn request_accessibility(&self) {}

    fn simulate_paste_keystroke(&self) -> Result<(), PasteError> {
        // Will be verified with SendInput (VK_CONTROL + 'V') on native Windows hardware
        Err(PasteError::UnsupportedPlatform(
            "Windows synthetic paste is pending verification on Windows hardware".into(),
        ))
    }

    fn get_foreground_app(&self) -> Option<String> {
        None
    }

    fn activate_app(&self, _app_id: &str) -> Result<(), PasteError> {
        Ok(())
    }
}

