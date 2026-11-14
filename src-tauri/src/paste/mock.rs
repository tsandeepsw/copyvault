use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;

use super::error::PasteError;
use super::simulator::PasteSimulator;

/// Controlled in-memory mock implementation of `PasteSimulator` for deterministic unit testing.
pub struct MockPasteSimulator {
    pub accessibility_trusted: AtomicBool,
    pub simulated_keystrokes_count: AtomicUsize,
    pub foreground_app: Mutex<Option<String>>,
    pub activated_apps: Mutex<Vec<String>>,
    pub should_fail_simulation: AtomicBool,
}

impl MockPasteSimulator {
    pub fn new(accessible: bool) -> Self {
        Self {
            accessibility_trusted: AtomicBool::new(accessible),
            simulated_keystrokes_count: AtomicUsize::new(0),
            foreground_app: Mutex::new(Some("com.apple.Terminal".to_string())),
            activated_apps: Mutex::new(Vec::new()),
            should_fail_simulation: AtomicBool::new(false),
        }
    }

    pub fn set_accessibility(&self, accessible: bool) {
        self.accessibility_trusted.store(accessible, Ordering::SeqCst);
    }

    pub fn set_should_fail(&self, fail: bool) {
        self.should_fail_simulation.store(fail, Ordering::SeqCst);
    }

    pub fn get_paste_count(&self) -> usize {
        self.simulated_keystrokes_count.load(Ordering::SeqCst)
    }

    pub fn get_activated_apps(&self) -> Vec<String> {
        self.activated_apps.lock().unwrap().clone()
    }
}

impl Default for MockPasteSimulator {
    fn default() -> Self {
        Self::new(true)
    }
}

impl PasteSimulator for MockPasteSimulator {
    fn check_accessibility(&self) -> bool {
        self.accessibility_trusted.load(Ordering::SeqCst)
    }

    fn request_accessibility(&self) {
        // In mock, simulate user approving permission
        self.accessibility_trusted.store(true, Ordering::SeqCst);
    }

    fn simulate_paste_keystroke(&self) -> Result<(), PasteError> {
        if !self.check_accessibility() {
            return Err(PasteError::AccessibilityDenied);
        }

        if self.should_fail_simulation.load(Ordering::SeqCst) {
            return Err(PasteError::KeystrokeDispatchFailed(
                "Mock forced keystroke failure".into(),
            ));
        }

        self.simulated_keystrokes_count.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    fn get_foreground_app(&self) -> Option<String> {
        self.foreground_app.lock().unwrap().clone()
    }

    fn activate_app(&self, app_id: &str) -> Result<(), PasteError> {
        self.activated_apps.lock().unwrap().push(app_id.to_string());
        Ok(())
    }
}

