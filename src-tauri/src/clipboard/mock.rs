use std::sync::Mutex;
use crate::clipboard::error::ClipboardError;
use crate::clipboard::macos::{ClipboardBackend, ClipboardPayloadData, RawClipboardPayload};

/// In-memory mock clipboard backend for deterministic unit and integration tests.
pub struct MockClipboardBackend {
    state: Mutex<MockState>,
}

struct MockState {
    change_count: i64,
    payload: Option<ClipboardPayloadData>,
    is_concealed: bool,
    source_app_name: Option<String>,
    source_app_bundle: Option<String>,
}

impl Default for MockClipboardBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl MockClipboardBackend {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(MockState {
                change_count: 1,
                payload: None,
                is_concealed: false,
                source_app_name: None,
                source_app_bundle: None,
            }),
        }
    }

    /// Sets the simulated clipboard contents and increments the change count.
    pub fn set_payload(&self, data: ClipboardPayloadData, app_name: Option<&str>, app_bundle: Option<&str>) {
        let mut state = self.state.lock().unwrap();
        state.change_count += 1;
        state.payload = Some(data);
        state.is_concealed = false;
        state.source_app_name = app_name.map(|s| s.to_string());
        state.source_app_bundle = app_bundle.map(|s| s.to_string());
    }

    /// Sets simulated concealed status (e.g. 1Password copy).
    pub fn set_concealed(&self, concealed: bool) {
        let mut state = self.state.lock().unwrap();
        state.change_count += 1;
        state.is_concealed = concealed;
    }
}

impl ClipboardBackend for MockClipboardBackend {
    fn get_change_count(&self) -> Result<i64, ClipboardError> {
        let state = self.state.lock().unwrap();
        Ok(state.change_count)
    }

    fn is_concealed(&self) -> Result<bool, ClipboardError> {
        let state = self.state.lock().unwrap();
        Ok(state.is_concealed)
    }

    fn read_current_payload(&self) -> Result<Option<RawClipboardPayload>, ClipboardError> {
        let state = self.state.lock().unwrap();
        if state.is_concealed {
            return Err(ClipboardError::ConcealedContent);
        }

        match &state.payload {
            Some(data) => Ok(Some(RawClipboardPayload {
                change_count: state.change_count,
                data: data.clone(),
                source_app_name: state.source_app_name.clone(),
                source_app_bundle: state.source_app_bundle.clone(),
            })),
            None => Ok(None),
        }
    }

    fn write_text(&self, text: &str) -> Result<i64, ClipboardError> {
        let mut state = self.state.lock().unwrap();
        state.change_count += 1;
        state.payload = Some(ClipboardPayloadData::Text {
            text: text.to_string(),
            html: None,
            rtf: None,
        });
        state.is_concealed = false;
        Ok(state.change_count)
    }

    fn write_image(&self, bytes: &[u8], mime_type: &str) -> Result<i64, ClipboardError> {
        let mut state = self.state.lock().unwrap();
        state.change_count += 1;
        state.payload = Some(ClipboardPayloadData::Image {
            bytes: bytes.to_vec(),
            mime_type: mime_type.to_string(),
            width: None,
            height: None,
        });
        state.is_concealed = false;
        Ok(state.change_count)
    }
}

