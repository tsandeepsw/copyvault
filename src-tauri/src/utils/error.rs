use serde::Serialize;
use thiserror::Error;

/// Domain error type for CopyVault backend operations.
#[derive(Debug, Error)]
pub enum VaultError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Migration error: {0}")]
    Migration(String),

    #[error("Item not found with id: {0}")]
    NotFound(i64),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Lock contention or poisoned state: {0}")]
    LockPoisoned(String),

    #[error("Database integrity check failed: {0}")]
    IntegrityCheckFailed(String),
}

/// Standardized IPC error envelope returned across the Tauri FFI boundary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppErrorDto {
    pub code: String,
    pub message: String,
}

impl From<VaultError> for AppErrorDto {
    fn from(err: VaultError) -> Self {
        let code = match &err {
            VaultError::Database(_) => "DATABASE_ERROR",
            VaultError::Migration(_) => "MIGRATION_ERROR",
            VaultError::NotFound(_) => "NOT_FOUND",
            VaultError::InvalidInput(_) => "INVALID_INPUT",
            VaultError::Io(_) => "IO_ERROR",
            VaultError::Serialization(_) => "SERIALIZATION_ERROR",
            VaultError::LockPoisoned(_) => "LOCK_ERROR",
            VaultError::IntegrityCheckFailed(_) => "INTEGRITY_ERROR",
        };
        Self {
            code: code.to_string(),
            message: err.to_string(),
        }
    }
}

impl From<VaultError> for String {
    fn from(err: VaultError) -> Self {
        err.to_string()
    }
}

