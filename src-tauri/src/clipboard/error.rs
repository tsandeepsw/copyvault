use thiserror::Error;

/// Error type for clipboard operations and ingestion.
#[derive(Debug, Error)]
pub enum ClipboardError {
    #[error("Platform clipboard error: {0}")]
    Platform(String),

    #[error("Clipboard access was suppressed (concealed content from password manager)")]
    ConcealedContent,

    #[error("Clipboard content from excluded application: {0}")]
    ExcludedApplication(String),

    #[error("Clipboard content exceeded maximum size limit: {0} bytes")]
    PayloadTooLarge(usize),

    #[error("Unsupported or malformed clipboard format: {0}")]
    UnsupportedFormat(String),

    #[error("Service is paused")]
    ServicePaused,

    #[error("Database error during clipboard persistence: {0}")]
    Database(#[from] crate::utils::error::VaultError),

    #[error("Thread communication or synchronization error: {0}")]
    SyncError(String),
}

