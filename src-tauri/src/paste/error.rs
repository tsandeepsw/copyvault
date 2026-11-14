use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum PasteError {
    #[error("Accessibility permission denied by macOS: synthetic keystrokes require Accessibility authorization in System Settings")]
    AccessibilityDenied,

    #[error("Target application did not accept focus: {0}")]
    TargetAppUnresponsive(String),

    #[error("Failed to post synthetic keystroke event: {0}")]
    KeystrokeDispatchFailed(String),

    #[error("No active sequential paste session")]
    SessionInactive,

    #[error("Sequential paste queue has already reached the end")]
    SessionCompleted,

    #[error("Invalid queue parameters: {0}")]
    InvalidQueue(String),

    #[error("Clipboard operation failed: {0}")]
    ClipboardError(String),

    #[error("Unsupported platform: {0}")]
    UnsupportedPlatform(String),
}

