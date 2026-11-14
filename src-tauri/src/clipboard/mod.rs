pub mod deduplicator;
pub mod detector;
pub mod error;
pub mod macos;
pub mod mock;
pub mod service;

pub use error::ClipboardError;
pub use macos::{ClipboardBackend, ClipboardPayloadData, RawClipboardPayload};
#[cfg(target_os = "macos")]
pub use macos::MacOsClipboardBackend;
pub use mock::MockClipboardBackend;
pub use service::ClipboardService;

