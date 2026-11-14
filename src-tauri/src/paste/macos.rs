use super::error::PasteError;
use super::simulator::PasteSimulator;

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGEventCreateKeyboardEvent(
        source: *const std::ffi::c_void,
        virtual_key: u16,
        key_down: bool,
    ) -> *mut std::ffi::c_void;
    fn CGEventSetFlags(event: *mut std::ffi::c_void, flags: u64);
    fn CGEventPost(tap: u32, event: *mut std::ffi::c_void);
    fn CFRelease(cf: *const std::ffi::c_void);
}

/// Native macOS implementation of `PasteSimulator` utilizing CoreGraphics and ApplicationServices.
pub struct MacOsPasteSimulator;

impl MacOsPasteSimulator {
    pub fn new() -> Self {
        Self
    }
}

impl Default for MacOsPasteSimulator {
    fn default() -> Self {
        Self::new()
    }
}

impl PasteSimulator for MacOsPasteSimulator {
    fn check_accessibility(&self) -> bool {
        #[cfg(target_os = "macos")]
        unsafe {
            AXIsProcessTrusted()
        }
        #[cfg(not(target_os = "macos"))]
        false
    }

    fn request_accessibility(&self) {
        #[cfg(target_os = "macos")]
        {
            // Open macOS System Settings directly to Privacy & Security -> Accessibility
            let _ = std::process::Command::new("open")
                .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
                .spawn();
        }
    }

    fn simulate_paste_keystroke(&self) -> Result<(), PasteError> {
        #[cfg(target_os = "macos")]
        {
            if !self.check_accessibility() {
                return Err(PasteError::AccessibilityDenied);
            }

            // Virtual key code for ANSI 'v' is 0x09 (kVK_ANSI_V)
            // Command flag mask is 0x00100000 (1 << 20)
            const VK_ANSI_V: u16 = 0x09;
            const CG_FLAG_COMMAND: u64 = 1 << 20;
            const CG_HID_EVENT_TAP: u32 = 0;

            unsafe {
                // Key down
                let event_down = CGEventCreateKeyboardEvent(std::ptr::null(), VK_ANSI_V, true);
                if event_down.is_null() {
                    return Err(PasteError::KeystrokeDispatchFailed(
                        "CGEventCreateKeyboardEvent key_down returned null".to_string(),
                    ));
                }
                CGEventSetFlags(event_down, CG_FLAG_COMMAND);
                CGEventPost(CG_HID_EVENT_TAP, event_down);
                CFRelease(event_down);

                // Small 15ms pulse between key-down and key-up to simulate human tap
                std::thread::sleep(std::time::Duration::from_millis(15));

                // Key up
                let event_up = CGEventCreateKeyboardEvent(std::ptr::null(), VK_ANSI_V, false);
                if !event_up.is_null() {
                    CGEventSetFlags(event_up, CG_FLAG_COMMAND);
                    CGEventPost(CG_HID_EVENT_TAP, event_up);
                    CFRelease(event_up);
                }
            }

            Ok(())
        }
        #[cfg(not(target_os = "macos"))]
        {
            Err(PasteError::UnsupportedPlatform("macOS required".into()))
        }
    }

    fn get_foreground_app(&self) -> Option<String> {
        #[cfg(target_os = "macos")]
        {
            // Read active frontmost application via AppleScript/NSWorkspace without crashing
            let output = std::process::Command::new("osascript")
                .arg("-e")
                .arg("tell application \"System Events\" to get name of first application process whose frontmost is true")
                .output()
                .ok()?;

            if output.status.success() {
                let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !name.is_empty() && name != "CopyVault" && name != "copyvault" {
                    return Some(name);
                }
            }
            None
        }
        #[cfg(not(target_os = "macos"))]
        None
    }

    fn activate_app(&self, app_id: &str) -> Result<(), PasteError> {
        #[cfg(target_os = "macos")]
        {
            if app_id.is_empty() {
                return Ok(());
            }

            let status = std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!("tell application \"{}\" to activate", app_id.replace('"', "\\\"")))
                .status();

            match status {
                Ok(s) if s.success() => Ok(()),
                _ => Err(PasteError::TargetAppUnresponsive(app_id.to_string())),
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = app_id;
            Ok(())
        }
    }
}
