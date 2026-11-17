use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;
use sha2::{Digest, Sha256};
use crate::clipboard::backend::{
    ClipboardBackend, ClipboardPayloadData, RawClipboardPayload,
    MAX_CLIPBOARD_IMAGE_BYTES, MAX_CLIPBOARD_TEXT_BYTES,
};
use crate::clipboard::error::ClipboardError;

/// Cross-platform native clipboard backend using `arboard`.
/// Operates on Windows, Linux (X11 & Wayland), and macOS.
pub struct ArboardClipboardBackend {
    clipboard: Mutex<Option<arboard::Clipboard>>,
    last_known_change_count: AtomicI64,
    last_content_hash: Mutex<Option<[u8; 32]>>,
    cached_payload: Mutex<Option<RawClipboardPayload>>,
}

impl ArboardClipboardBackend {
    pub fn new() -> Self {
        let cb = arboard::Clipboard::new().ok();
        Self {
            clipboard: Mutex::new(cb),
            last_known_change_count: AtomicI64::new(1),
            last_content_hash: Mutex::new(None),
            cached_payload: Mutex::new(None),
        }
    }

    fn compute_hash(bytes: &[u8]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        hasher.finalize().into()
    }

    fn fetch_latest_payload(&self) -> Result<Option<RawClipboardPayload>, ClipboardError> {
        let mut guard = self.clipboard.lock().map_err(|_| {
            ClipboardError::Platform("Failed to acquire clipboard mutex lock".into())
        })?;

        // Reconnect if clipboard handle was dropped or previously failed
        if guard.is_none() {
            *guard = arboard::Clipboard::new().ok();
        }

        let cb: &mut arboard::Clipboard = match guard.as_mut() {
            Some(c) => c,
            None => {
                return Err(ClipboardError::Platform(
                    "System clipboard is unavailable or access was denied".into(),
                ))
            }
        };

        // 1. Try reading text first
        if let Ok(text) = cb.get_text() {
            if !text.is_empty() {
                let bytes = text.as_bytes();
                if bytes.len() > MAX_CLIPBOARD_TEXT_BYTES {
                    return Err(ClipboardError::PayloadTooLarge(bytes.len()));
                }

                let hash = Self::compute_hash(bytes);
                let mut hash_guard = self.last_content_hash.lock().unwrap();
                if hash_guard.as_ref() == Some(&hash) {
                    // Content has not changed
                    return Ok(None);
                }

                *hash_guard = Some(hash);
                let count = self.last_known_change_count.fetch_add(1, Ordering::SeqCst) + 1;

                return Ok(Some(RawClipboardPayload {
                    change_count: count,
                    data: ClipboardPayloadData::Text {
                        text,
                        html: None,
                        rtf: None,
                    },
                    source_app_name: None,
                    source_app_bundle: None,
                }));
            }
        }

        // 2. Try reading image
        if let Ok(img) = cb.get_image() {
            let width = img.width as u32;
            let height = img.height as u32;
            let rgba_raw = img.bytes.as_ref();

            let mut png_bytes = Vec::new();
            let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
            if image::ImageEncoder::write_image(
                encoder,
                rgba_raw,
                width,
                height,
                image::ExtendedColorType::Rgba8,
            ).is_ok() {
                if png_bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES {
                    return Err(ClipboardError::PayloadTooLarge(png_bytes.len()));
                }

                let hash = Self::compute_hash(&png_bytes);
                let mut hash_guard = self.last_content_hash.lock().unwrap();
                if hash_guard.as_ref() == Some(&hash) {
                    // Image content has not changed
                    return Ok(None);
                }

                *hash_guard = Some(hash);
                let count = self.last_known_change_count.fetch_add(1, Ordering::SeqCst) + 1;

                return Ok(Some(RawClipboardPayload {
                    change_count: count,
                    data: ClipboardPayloadData::Image {
                        bytes: png_bytes,
                        mime_type: "image/png".to_string(),
                        width: Some(width),
                        height: Some(height),
                    },
                    source_app_name: None,
                    source_app_bundle: None,
                }));
            }
        }

        Ok(None)
    }
}

impl Default for ArboardClipboardBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl ClipboardBackend for ArboardClipboardBackend {
    fn get_change_count(&self) -> Result<i64, ClipboardError> {
        #[cfg(target_os = "windows")]
        {
            // On Windows, GetClipboardSequenceNumber() increments instantaneously on EVERY system copy action!
            let seq = unsafe { windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber() };
            if seq != 0 {
                return Ok(seq as i64);
            }
        }

        // On Linux / X11 / Wayland, polling fetch checks if content has changed
        if let Ok(Some(payload)) = self.fetch_latest_payload() {
            let count = payload.change_count;
            if let Ok(mut cache) = self.cached_payload.lock() {
                *cache = Some(payload);
            }
            return Ok(count);
        }

        Ok(self.last_known_change_count.load(Ordering::SeqCst))
    }

    fn is_concealed(&self) -> Result<bool, ClipboardError> {
        Ok(false)
    }

    fn read_current_payload(&self) -> Result<Option<RawClipboardPayload>, ClipboardError> {
        // If a payload was already fetched during change detection (e.g. on Linux), return it
        if let Ok(mut cache) = self.cached_payload.lock() {
            if let Some(payload) = cache.take() {
                return Ok(Some(payload));
            }
        }

        self.fetch_latest_payload()
    }

    fn write_text(&self, text: &str) -> Result<i64, ClipboardError> {
        let mut guard = self.clipboard.lock().map_err(|_| {
            ClipboardError::Platform("Failed to acquire clipboard mutex lock".into())
        })?;

        if guard.is_none() {
            *guard = arboard::Clipboard::new().ok();
        }

        let cb: &mut arboard::Clipboard = match guard.as_mut() {
            Some(c) => c,
            None => {
                return Err(ClipboardError::Platform(
                    "System clipboard is unavailable".into(),
                ))
            }
        };

        cb.set_text(text).map_err(|e| {
            ClipboardError::Platform(format!("Failed to write text to clipboard: {e}"))
        })?;

        let hash = Self::compute_hash(text.as_bytes());
        let mut hash_guard = self.last_content_hash.lock().unwrap();
        *hash_guard = Some(hash);

        #[cfg(target_os = "windows")]
        {
            let seq = unsafe { windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber() };
            if seq != 0 {
                return Ok(seq as i64);
            }
        }

        let count = self.last_known_change_count.fetch_add(1, Ordering::SeqCst) + 1;
        Ok(count)
    }

    fn write_image(&self, bytes: &[u8], _mime_type: &str) -> Result<i64, ClipboardError> {
        let mut guard = self.clipboard.lock().map_err(|_| {
            ClipboardError::Platform("Failed to acquire clipboard mutex lock".into())
        })?;

        if guard.is_none() {
            *guard = arboard::Clipboard::new().ok();
        }

        let cb: &mut arboard::Clipboard = match guard.as_mut() {
            Some(c) => c,
            None => {
                return Err(ClipboardError::Platform(
                    "System clipboard is unavailable".into(),
                ))
            }
        };

        // Decode the image bytes into raw RGBA
        let img = image::load_from_memory(bytes).map_err(|e| {
            ClipboardError::Platform(format!("Failed to decode image bytes for clipboard: {e}"))
        })?;
        let rgba = img.to_rgba8();
        let (width, height) = rgba.dimensions();

        let img_data = arboard::ImageData {
            width: width as usize,
            height: height as usize,
            bytes: std::borrow::Cow::Owned(rgba.into_raw()),
        };

        cb.set_image(img_data).map_err(|e| {
            ClipboardError::Platform(format!("Failed to write image to clipboard: {e}"))
        })?;

        let hash = Self::compute_hash(bytes);
        let mut hash_guard = self.last_content_hash.lock().unwrap();
        *hash_guard = Some(hash);

        #[cfg(target_os = "windows")]
        {
            let seq = unsafe { windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber() };
            if seq != 0 {
                return Ok(seq as i64);
            }
        }

        let count = self.last_known_change_count.fetch_add(1, Ordering::SeqCst) + 1;
        Ok(count)
    }
}
