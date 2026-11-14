use std::sync::Mutex;
use serde::{Deserialize, Serialize};

use super::error::PasteError;
use super::simulator::PasteSimulator;
use crate::clipboard::service::ClipboardService;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SequentialItemPayload {
    pub id: i64,
    pub content_type: String,
    pub text_content: String,
    pub media_path: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PasteMode {
    Synthetic,
    SteppedClipboard,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SequentialStatusDto {
    pub is_active: bool,
    pub current_index: usize,
    pub total_items: usize,
    pub remaining_items: usize,
    pub current_item_id: Option<i64>,
    pub current_item_preview: Option<String>,
    pub current_item_type: Option<String>,
    pub paste_mode: String,
    pub is_completed: bool,
    pub message: String,
    pub accessibility_granted: bool,
}

struct ActiveSession {
    items: Vec<SequentialItemPayload>,
    current_index: usize,
    target_app: Option<String>,
    mode: PasteMode,
    is_completed: bool,
}

/// Thread-safe manager for sequential paste queues and execution lifecycle.
pub struct SequentialSessionManager {
    session: Mutex<Option<ActiveSession>>,
}

impl SequentialSessionManager {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }

    /// Previews or checks current session status.
    pub fn get_status(&self, simulator: &dyn PasteSimulator) -> SequentialStatusDto {
        let guard = self.session.lock().unwrap();
        let accessibility_granted = simulator.check_accessibility();

        match &*guard {
            Some(s) => {
                let remaining = s.items.len().saturating_sub(s.current_index);
                let current_item = s.items.get(s.current_index);

                SequentialStatusDto {
                    is_active: !s.is_completed,
                    current_index: s.current_index,
                    total_items: s.items.len(),
                    remaining_items: remaining,
                    current_item_id: current_item.map(|i| i.id),
                    current_item_preview: current_item.map(|i| {
                        if i.content_type == "image" {
                            format!("🖼️ {}", i.text_content)
                        } else {
                            let text = &i.text_content;
                            let preview = text.chars().take(48).collect::<String>();
                            if text.len() > 48 {
                                format!("{preview}…")
                            } else {
                                preview
                            }
                        }
                    }),
                    current_item_type: current_item.map(|i| i.content_type.clone()),
                    paste_mode: match s.mode {
                        PasteMode::Synthetic => "synthetic".to_string(),
                        PasteMode::SteppedClipboard => "stepped_clipboard".to_string(),
                    },
                    is_completed: s.is_completed,
                    message: if s.is_completed {
                        "Sequential paste queue completed.".to_string()
                    } else {
                        format!("Queue item {} of {} ready.", s.current_index + 1, s.items.len())
                    },
                    accessibility_granted,
                }
            }
            None => SequentialStatusDto {
                is_active: false,
                current_index: 0,
                total_items: 0,
                remaining_items: 0,
                current_item_id: None,
                current_item_preview: None,
                current_item_type: None,
                paste_mode: "none".to_string(),
                is_completed: false,
                message: "No active sequential paste queue.".to_string(),
                accessibility_granted,
            },
        }
    }

    /// Initializes a new sequential paste session with the specified ordered items.
    pub fn start_session(
        &self,
        items: Vec<SequentialItemPayload>,
        requested_mode: Option<PasteMode>,
        simulator: &dyn PasteSimulator,
        clipboard: &ClipboardService,
    ) -> Result<SequentialStatusDto, PasteError> {
        if items.is_empty() {
            return Err(PasteError::InvalidQueue(
                "Sequential paste queue cannot be empty".to_string(),
            ));
        }

        if items.len() > 50 {
            return Err(PasteError::InvalidQueue(
                "Sequential paste queue exceeds maximum limit of 50 items".to_string(),
            ));
        }

        let accessibility_granted = simulator.check_accessibility();
        let target_app = simulator.get_foreground_app();

        // If synthetic mode is requested but accessibility is denied, fall back safely to stepped clipboard mode
        let mode = match requested_mode.unwrap_or(PasteMode::Synthetic) {
            PasteMode::Synthetic if !accessibility_granted => PasteMode::SteppedClipboard,
            other => other,
        };

        // Write Item 1 (index 0) to clipboard immediately
        let first_item = &items[0];
        Self::load_item_to_clipboard(first_item, clipboard)?;

        let session = ActiveSession {
            items,
            current_index: 0,
            target_app,
            mode,
            is_completed: false,
        };

        {
            let mut guard = self.session.lock().unwrap();
            *guard = Some(session);
        }

        Ok(self.get_status(simulator))
    }

    /// Pastes or advances to the next item in the active sequence.
    pub fn paste_next(
        &self,
        simulator: &dyn PasteSimulator,
        clipboard: &ClipboardService,
    ) -> Result<SequentialStatusDto, PasteError> {
        let mut guard = self.session.lock().unwrap();
        let session = guard.as_mut().ok_or(PasteError::SessionInactive)?;

        if session.is_completed || session.current_index >= session.items.len() {
            return Err(PasteError::SessionCompleted);
        }

        // If synthetic mode, execute keystroke into target application
        if session.mode == PasteMode::Synthetic {
            if !simulator.check_accessibility() {
                return Err(PasteError::AccessibilityDenied);
            }

            // Restore focus to previous application if known
            if let Some(target) = &session.target_app {
                let _ = simulator.activate_app(target);
                // 35ms synchronization delay for OS window manager to transfer focus
                std::thread::sleep(std::time::Duration::from_millis(35));
            }

            simulator.simulate_paste_keystroke()?;
        }

        // Advance queue pointer
        session.current_index += 1;

        if session.current_index < session.items.len() {
            // Load subsequent item onto OS clipboard
            let next_item = &session.items[session.current_index];
            Self::load_item_to_clipboard(next_item, clipboard)?;
        } else {
            // Reached the end of queue
            session.is_completed = true;
        }

        drop(guard);
        Ok(self.get_status(simulator))
    }

    /// Cancels and dismisses any active sequential paste session.
    pub fn cancel_session(&self, simulator: &dyn PasteSimulator) -> SequentialStatusDto {
        let mut guard = self.session.lock().unwrap();
        *guard = None;
        drop(guard);

        let mut status = self.get_status(simulator);
        status.message = "Sequential paste session canceled.".to_string();
        status
    }

    /// Internal helper to load an item (text or image) safely onto the system clipboard.
    fn load_item_to_clipboard(
        item: &SequentialItemPayload,
        clipboard: &ClipboardService,
    ) -> Result<(), PasteError> {
        // Handle images: if file exists on disk, we write fallback text or native image
        if item.content_type == "image" {
            // Write text content as fallback (e.g. filename) so text fields receive clean descriptor
            clipboard
                .write_to_clipboard(&item.text_content)
                .map_err(|e| PasteError::ClipboardError(e.to_string()))?;
        } else {
            // Plain text or code snippet
            clipboard
                .write_to_clipboard(&item.text_content)
                .map_err(|e| PasteError::ClipboardError(e.to_string()))?;
        }
        Ok(())
    }
}

impl Default for SequentialSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use crate::clipboard::mock::MockClipboardBackend;
    use crate::db::service::DatabaseService;
    use crate::media::MediaManager;
    use crate::paste::mock::MockPasteSimulator;

    fn setup_test_services() -> (Arc<ClipboardService>, MockPasteSimulator) {
        let backend = Arc::new(MockClipboardBackend::new());
        let db = DatabaseService::open_in_memory().unwrap();
        let temp_dir = std::env::temp_dir().join(format!("cv_test_media_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let media = MediaManager::new(&temp_dir).unwrap();
        let clipboard = Arc::new(ClipboardService::new(backend, db, media));
        let simulator = MockPasteSimulator::new(true);
        (clipboard, simulator)
    }

    #[test]
    fn test_sequential_session_lifecycle_with_mixed_items() {
        let (clipboard, simulator) = setup_test_services();
        let manager = SequentialSessionManager::new();

        let items = vec![
            SequentialItemPayload {
                id: 1,
                content_type: "text".to_string(),
                text_content: "First Name: Alice".to_string(),
                media_path: None,
            },
            SequentialItemPayload {
                id: 2,
                content_type: "image".to_string(),
                text_content: "profile_avatar.png".to_string(),
                media_path: Some("/tmp/avatar.png".to_string()),
            },
            SequentialItemPayload {
                id: 3,
                content_type: "code".to_string(),
                text_content: "const auth = true;".to_string(),
                media_path: None,
            },
        ];

        // 1. Start Session
        let start_status = manager
            .start_session(items, Some(PasteMode::Synthetic), &simulator, &clipboard)
            .unwrap();

        assert!(start_status.is_active);
        assert_eq!(start_status.current_index, 0);
        assert_eq!(start_status.total_items, 3);
        assert_eq!(start_status.remaining_items, 3);
        assert_eq!(start_status.current_item_id, Some(1));
        assert_eq!(start_status.paste_mode, "synthetic");
        assert!(!start_status.is_completed);

        // 2. Paste First Item -> advances to Item 2 (image)
        let status_2 = manager.paste_next(&simulator, &clipboard).unwrap();
        assert_eq!(simulator.get_paste_count(), 1);
        assert_eq!(status_2.current_index, 1);
        assert_eq!(status_2.remaining_items, 2);
        assert_eq!(status_2.current_item_id, Some(2));
        assert_eq!(status_2.current_item_type.as_deref(), Some("image"));

        // 3. Paste Second Item (image) -> advances to Item 3 (code)
        let status_3 = manager.paste_next(&simulator, &clipboard).unwrap();
        assert_eq!(simulator.get_paste_count(), 2);
        assert_eq!(status_3.current_index, 2);
        assert_eq!(status_3.remaining_items, 1);
        assert_eq!(status_3.current_item_id, Some(3));
        assert_eq!(status_3.current_item_type.as_deref(), Some("code"));

        // 4. Paste Third Item -> Queue completes
        let status_final = manager.paste_next(&simulator, &clipboard).unwrap();
        assert_eq!(simulator.get_paste_count(), 3);
        assert_eq!(status_final.current_index, 3);
        assert_eq!(status_final.remaining_items, 0);
        assert!(status_final.is_completed);
        assert!(!status_final.is_active);

        // 5. Subsequent paste attempt returns SessionCompleted error
        let err = manager.paste_next(&simulator, &clipboard).unwrap_err();
        assert_eq!(err, PasteError::SessionCompleted);
    }

    #[test]
    fn test_sequential_session_empty_and_overflow_guards() {
        let (clipboard, simulator) = setup_test_services();
        let manager = SequentialSessionManager::new();

        // Empty items
        let empty_err = manager
            .start_session(vec![], Some(PasteMode::Synthetic), &simulator, &clipboard)
            .unwrap_err();
        assert!(matches!(empty_err, PasteError::InvalidQueue(_)));

        // Overflow (> 50 items)
        let too_many = (0..51)
            .map(|i| SequentialItemPayload {
                id: i,
                content_type: "text".to_string(),
                text_content: format!("Item {}", i),
                media_path: None,
            })
            .collect();
        let overflow_err = manager
            .start_session(too_many, Some(PasteMode::Synthetic), &simulator, &clipboard)
            .unwrap_err();
        assert!(matches!(overflow_err, PasteError::InvalidQueue(_)));
    }

    #[test]
    fn test_accessibility_denied_falls_back_to_stepped_clipboard() {
        let (clipboard, simulator) = setup_test_services();
        simulator.set_accessibility(false); // Simulate missing accessibility permissions
        let manager = SequentialSessionManager::new();

        let items = vec![SequentialItemPayload {
            id: 10,
            content_type: "text".to_string(),
            text_content: "Fallback Text".to_string(),
            media_path: None,
        }];

        // When accessibility is denied, mode falls back to stepped_clipboard without error
        let status = manager
            .start_session(items, Some(PasteMode::Synthetic), &simulator, &clipboard)
            .unwrap();

        assert_eq!(status.paste_mode, "stepped_clipboard");
        assert!(!status.accessibility_granted);

        // Advance queue in stepped mode: no simulated keystrokes, advances index cleanly
        let next_status = manager.paste_next(&simulator, &clipboard).unwrap();
        assert_eq!(simulator.get_paste_count(), 0);
        assert!(next_status.is_completed);
    }

    #[test]
    fn test_sequential_session_cancellation() {
        let (clipboard, simulator) = setup_test_services();
        let manager = SequentialSessionManager::new();

        let items = vec![
            SequentialItemPayload {
                id: 1,
                content_type: "text".to_string(),
                text_content: "Cancel Me".to_string(),
                media_path: None,
            },
            SequentialItemPayload {
                id: 2,
                content_type: "text".to_string(),
                text_content: "Item 2".to_string(),
                media_path: None,
            },
        ];

        manager
            .start_session(items, Some(PasteMode::Synthetic), &simulator, &clipboard)
            .unwrap();

        let cancel_status = manager.cancel_session(&simulator);
        assert!(!cancel_status.is_active);
        assert_eq!(cancel_status.total_items, 0);

        // Attempting to paste next after cancellation errors with SessionInactive
        let err = manager.paste_next(&simulator, &clipboard).unwrap_err();
        assert_eq!(err, PasteError::SessionInactive);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_macos_paste_simulator_accessibility_query() {
        use crate::paste::MacOsPasteSimulator;
        let sim = MacOsPasteSimulator::new();
        // Verifies the native AXIsProcessTrusted call returns a boolean cleanly without crashing
        let _ = sim.check_accessibility();
    }
}

