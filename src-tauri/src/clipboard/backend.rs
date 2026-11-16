use crate::clipboard::error::ClipboardError;

pub const MAX_CLIPBOARD_TEXT_BYTES: usize = 10 * 1024 * 1024; // 10 MB limit
pub const MAX_CLIPBOARD_IMAGE_BYTES: usize = 50 * 1024 * 1024; // 50 MB limit

#[derive(Debug, Clone)]
pub enum ClipboardPayloadData {
    Text {
        text: String,
        html: Option<String>,
        rtf: Option<Vec<u8>>,
    },
    Image {
        bytes: Vec<u8>,
        mime_type: String,
        width: Option<u32>,
        height: Option<u32>,
    },
    FileUri(String),
}

#[derive(Debug, Clone)]
pub struct RawClipboardPayload {
    pub change_count: i64,
    pub data: ClipboardPayloadData,
    pub source_app_name: Option<String>,
    pub source_app_bundle: Option<String>,
}

pub trait ClipboardBackend: Send + Sync {
    fn get_change_count(&self) -> Result<i64, ClipboardError>;
    fn is_concealed(&self) -> Result<bool, ClipboardError>;
    fn read_current_payload(&self) -> Result<Option<RawClipboardPayload>, ClipboardError>;
    fn write_text(&self, text: &str) -> Result<i64, ClipboardError>;
    fn write_image(&self, bytes: &[u8], mime_type: &str) -> Result<i64, ClipboardError>;
}

