pub mod backend;
pub mod deduplicator;
pub mod detector;
pub mod error;
#[cfg(target_os = "macos")]
pub mod macos;
pub mod mock;
pub mod service;

pub use backend::{
    ClipboardBackend, ClipboardPayloadData, RawClipboardPayload, MAX_CLIPBOARD_IMAGE_BYTES,
    MAX_CLIPBOARD_TEXT_BYTES,
};
pub use error::ClipboardError;
#[cfg(target_os = "macos")]
pub use macos::MacOsClipboardBackend;
pub use mock::MockClipboardBackend;
pub use service::ClipboardService;

