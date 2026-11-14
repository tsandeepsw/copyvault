use std::path::{Path, PathBuf};
use crate::utils::error::VaultError;

/// Storage path provider for CopyVault application directories and files.
#[derive(Debug, Clone)]
pub struct AppPaths {
    pub app_data_dir: PathBuf,
    pub db_path: PathBuf,
    pub media_dir: PathBuf,
}

impl AppPaths {
    /// Resolves standard operating system specific application data paths.
    pub fn from_default() -> Result<Self, VaultError> {
        let base_dir = resolve_system_app_data_dir()?;
        Self::from_base_dir(base_dir)
    }

    /// Initializes application paths from an explicit base directory (ideal for testing).
    pub fn from_base_dir<P: AsRef<Path>>(base: P) -> Result<Self, VaultError> {
        let app_data_dir = base.as_ref().to_path_buf();
        let db_path = app_data_dir.join("copyvault.db");
        let media_dir = app_data_dir.join("media");

        let paths = Self {
            app_data_dir,
            db_path,
            media_dir,
        };

        paths.ensure_directories()?;
        Ok(paths)
    }

    /// Creates required directories with strict secure permissions.
    pub fn ensure_directories(&self) -> Result<(), VaultError> {
        if !self.app_data_dir.exists() {
            std::fs::create_dir_all(&self.app_data_dir)?;
            set_directory_permissions(&self.app_data_dir)?;
        }

        if !self.media_dir.exists() {
            std::fs::create_dir_all(&self.media_dir)?;
            set_directory_permissions(&self.media_dir)?;
        }

        Ok(())
    }
}

/// Resolves standard OS application support directory.
fn resolve_system_app_data_dir() -> Result<PathBuf, VaultError> {
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let path = PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("com.copyvault.app");
            return Ok(path);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let path = PathBuf::from(appdata).join("com.copyvault.app");
            return Ok(path);
        }
    }

    // Generic Linux or fallback
    if let Some(home) = std::env::var_os("HOME") {
        let path = PathBuf::from(home).join(".copyvault");
        return Ok(path);
    }

    Err(VaultError::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "Unable to determine system home directory for application data",
    )))
}

/// Sets POSIX 0700 (rwx------) permissions on Unix systems for privacy.
fn set_directory_permissions(path: &Path) -> Result<(), VaultError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o700);
        std::fs::set_permissions(path, perms)?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

