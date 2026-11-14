use std::fs;
use std::path::{Path, PathBuf};
use crate::db::service::DatabaseService;
use crate::utils::error::VaultError;

/// Storage manager for binary media payloads (images, GIFs) stored outside SQLite.
#[derive(Debug, Clone)]
pub struct MediaManager {
    media_dir: PathBuf,
}

impl MediaManager {
    pub fn new<P: AsRef<Path>>(media_dir: P) -> Result<Self, VaultError> {
        let path = media_dir.as_ref().to_path_buf();
        if !path.exists() {
            fs::create_dir_all(&path)?;
        }
        Ok(Self { media_dir: path })
    }

    /// Stores raw binary media file content addressed by its SHA-256 hash.
    /// Returns the relative file name (e.g. `<hash>.<ext>`).
    pub fn store_media(
        &self,
        hash: &str,
        extension: &str,
        bytes: &[u8],
    ) -> Result<String, VaultError> {
        let file_name = format!("{}.{}", hash, extension.trim_start_matches('.'));
        let target_path = self.media_dir.join(&file_name);

        if !target_path.exists() {
            fs::write(&target_path, bytes)?;
        }

        Ok(file_name)
    }

    /// Resolves full absolute path on disk for a relative media file name.
    pub fn resolve_path(&self, file_name: &str) -> PathBuf {
        self.media_dir.join(file_name)
    }

    /// Reads media bytes from disk.
    pub fn read_media(&self, file_name: &str) -> Result<Vec<u8>, VaultError> {
        let target_path = self.resolve_path(file_name);
        let bytes = fs::read(target_path)?;
        Ok(bytes)
    }

    /// Safely cleans up a media file from disk only if no other database rows reference it.
    pub fn cleanup_media_if_unreferenced(
        &self,
        db_service: &DatabaseService,
        media_path: &str,
    ) -> Result<bool, VaultError> {
        let ref_count = db_service.count_media_references(media_path)?;
        if ref_count == 0 {
            let full_path = self.resolve_path(media_path);
            if full_path.exists() {
                fs::remove_file(full_path)?;
                return Ok(true);
            }
        }
        Ok(false)
    }
}

