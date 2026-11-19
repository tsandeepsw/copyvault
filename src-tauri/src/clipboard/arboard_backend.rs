use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;
use sha2::{Digest, Sha256};
use crate::clipboard::backend::{
    ClipboardBackend, ClipboardPayloadData, RawClipboardPayload,
    MAX_CLIPBOARD_IMAGE_BYTES, MAX_CLIPBOARD_TEXT_BYTES,
};
use crate::clipboard::error::ClipboardError;

#[cfg(target_os = "windows")]
fn query_os_change_count() -> Option<i64> {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetClipboardSequenceNumber() -> u32;
    }
    let seq = unsafe { GetClipboardSequenceNumber() };
    if seq != 0 {
        Some(seq as i64)
    } else {
        None
    }
}

#[cfg(not(target_os = "windows"))]
fn query_os_change_count() -> Option<i64> {
    None
}

#[cfg(target_os = "windows")]
fn is_windows_clipboard_concealed() -> bool {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn IsClipboardFormatAvailable(format: u32) -> i32;
        fn RegisterClipboardFormatW(lpszFormat: *const u16) -> u32;
    }

    let formats = [
        "Clipboard Viewer Ignore\0",
        "ExcludeClipboardContentFromMonitorProcessing\0",
        "ExcludeClipboardContentFromMonitor\0",
    ];

    for name in &formats {
        let wide: Vec<u16> = name.encode_utf16().collect();
        let format_id = unsafe { RegisterClipboardFormatW(wide.as_ptr()) };
        if format_id != 0 && unsafe { IsClipboardFormatAvailable(format_id) } != 0 {
            return true;
        }
    }
    false
}

#[cfg(target_os = "windows")]
fn get_windows_clipboard_files() -> Option<Vec<PathBuf>> {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn OpenClipboard(hWndNewOwner: *mut std::ffi::c_void) -> i32;
        fn CloseClipboard() -> i32;
        fn GetClipboardData(uFormat: u32) -> *mut std::ffi::c_void;
        fn IsClipboardFormatAvailable(format: u32) -> i32;
    }
    #[link(name = "shell32")]
    unsafe extern "system" {
        fn DragQueryFileW(
            hDrop: *mut std::ffi::c_void,
            iFile: u32,
            lpszFile: *mut u16,
            cch: u32,
        ) -> u32;
    }

    const CF_HDROP: u32 = 15;

    unsafe {
        if IsClipboardFormatAvailable(CF_HDROP) == 0 {
            return None;
        }

        let mut opened = false;
        for _ in 0..5 {
            if OpenClipboard(std::ptr::null_mut()) != 0 {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }

        if !opened {
            return None;
        }

        let h_drop = GetClipboardData(CF_HDROP);
        if h_drop.is_null() {
            CloseClipboard();
            return None;
        }

        let count = DragQueryFileW(h_drop, 0xFFFFFFFF, std::ptr::null_mut(), 0);
        let mut result = Vec::new();

        for i in 0..count {
            let len = DragQueryFileW(h_drop, i, std::ptr::null_mut(), 0);
            if len > 0 {
                let mut buf: Vec<u16> = vec![0; (len + 1) as usize];
                let copied = DragQueryFileW(h_drop, i, buf.as_mut_ptr(), len + 1);
                if copied > 0 {
                    buf.truncate(copied as usize);
                    let path_str = String::from_utf16_lossy(&buf);
                    result.push(PathBuf::from(path_str));
                }
            }
        }

        CloseClipboard();
        if result.is_empty() {
            None
        } else {
            Some(result)
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn get_windows_clipboard_files() -> Option<Vec<PathBuf>> {
    None
}

/// Resolves raw image bytes, MIME type, and dimensions from a local file path.
fn resolve_image_from_path(path: &Path) -> Option<(Vec<u8>, String, Option<u32>, Option<u32>)> {
    if !path.is_file() {
        return None;
    }
    let ext = path.extension()?.to_str()?.to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "tiff" | "tif" => "image/tiff",
        "ico" => "image/x-icon",
        _ => return None,
    };

    let bytes = std::fs::read(path).ok()?;
    if bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES || bytes.is_empty() {
        return None;
    }

    let (width, height) = match image::load_from_memory(&bytes) {
        Ok(img) => (Some(img.width()), Some(img.height())),
        Err(_) => (None, None),
    };

    Some((bytes, mime.to_string(), width, height))
}

/// Resolves an image if the text is a file:// URL or direct path string.
fn resolve_image_from_uri_or_text(text: &str) -> Option<(Vec<u8>, String, Option<u32>, Option<u32>)> {
    let clean = text.trim().trim_matches('"');
    let path_str = if let Some(stripped) = clean.strip_prefix("file:///") {
        stripped
    } else if let Some(stripped) = clean.strip_prefix("file://") {
        stripped
    } else {
        clean
    };
    let path = Path::new(path_str);
    resolve_image_from_path(path)
}

/// Cross-platform native clipboard backend using `arboard` with native OS file-drop extensions.
pub struct ArboardClipboardBackend {
    clipboard: Mutex<Option<arboard::Clipboard>>,
    last_known_change_count: AtomicI64,
    last_content_hash: Mutex<Option<[u8; 32]>>,
}

impl ArboardClipboardBackend {
    pub fn new() -> Self {
        let cb = arboard::Clipboard::new().ok();
        let initial_count = query_os_change_count().unwrap_or(1);
        Self {
            clipboard: Mutex::new(cb),
            last_known_change_count: AtomicI64::new(initial_count),
            last_content_hash: Mutex::new(None),
        }
    }

    fn compute_hash(bytes: &[u8]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        hasher.finalize().into()
    }
}

impl Default for ArboardClipboardBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl ClipboardBackend for ArboardClipboardBackend {
    fn get_change_count(&self) -> Result<i64, ClipboardError> {
        if let Some(os_count) = query_os_change_count() {
            self.last_known_change_count.store(os_count, Ordering::SeqCst);
            return Ok(os_count);
        }
        Ok(self.last_known_change_count.load(Ordering::SeqCst))
    }

    fn is_concealed(&self) -> Result<bool, ClipboardError> {
        #[cfg(target_os = "windows")]
        {
            return Ok(is_windows_clipboard_concealed());
        }
        #[cfg(not(target_os = "windows"))]
        {
            Ok(false)
        }
    }

    fn read_current_payload(&self) -> Result<Option<RawClipboardPayload>, ClipboardError> {
        let change_count = self.get_change_count().unwrap_or_else(|_| self.last_known_change_count.load(Ordering::SeqCst));

        // Priority 1: Check Windows File Drop List (e.g. image or file copied on Desktop / File Explorer)
        if let Some(files) = get_windows_clipboard_files() {
            if let Some(first_file) = files.first() {
                if let Some((bytes, mime_type, width, height)) = resolve_image_from_path(first_file) {
                    let hash = Self::compute_hash(&bytes);
                    {
                        let mut hash_guard = self.last_content_hash.lock().unwrap();
                        *hash_guard = Some(hash);
                    }
                    let file_name = first_file.file_name().map(|n| n.to_string_lossy().to_string());
                    return Ok(Some(RawClipboardPayload {
                        change_count,
                        data: ClipboardPayloadData::Image {
                            bytes,
                            mime_type,
                            width,
                            height,
                        },
                        source_app_name: Some("File Explorer".to_string()),
                        source_app_bundle: file_name,
                    }));
                } else {
                    let path_str = first_file.to_string_lossy().to_string();
                    let hash = Self::compute_hash(path_str.as_bytes());
                    {
                        let mut hash_guard = self.last_content_hash.lock().unwrap();
                        *hash_guard = Some(hash);
                    }
                    return Ok(Some(RawClipboardPayload {
                        change_count,
                        data: ClipboardPayloadData::FileUri(path_str),
                        source_app_name: Some("File Explorer".to_string()),
                        source_app_bundle: None,
                    }));
                }
            }
        }

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

        // Priority 2: Try reading native bitmap image data (e.g. from browser "Copy Image", Snipping Tool, Paint)
        let mut img_opt = cb.get_image().ok();
        if img_opt.is_none() {
            for _ in 0..2 {
                std::thread::sleep(std::time::Duration::from_millis(25));
                if let Ok(img) = cb.get_image() {
                    img_opt = Some(img);
                    break;
                }
            }
        }

        if let Some(img) = img_opt {
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
                {
                    let mut hash_guard = self.last_content_hash.lock().unwrap();
                    *hash_guard = Some(hash);
                }

                return Ok(Some(RawClipboardPayload {
                    change_count,
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

        // Priority 3: Try reading text (or path pointing to local image)
        let mut text_opt = cb.get_text().ok();
        if text_opt.is_none() {
            for _ in 0..2 {
                std::thread::sleep(std::time::Duration::from_millis(25));
                if let Ok(t) = cb.get_text() {
                    text_opt = Some(t);
                    break;
                }
            }
        }

        if let Some(text) = text_opt {
            if !text.is_empty() {
                // Check if text itself is a file path pointing to an image
                if let Some((bytes, mime_type, width, height)) = resolve_image_from_uri_or_text(&text) {
                    let hash = Self::compute_hash(&bytes);
                    {
                        let mut hash_guard = self.last_content_hash.lock().unwrap();
                        *hash_guard = Some(hash);
                    }
                    return Ok(Some(RawClipboardPayload {
                        change_count,
                        data: ClipboardPayloadData::Image {
                            bytes,
                            mime_type,
                            width,
                            height,
                        },
                        source_app_name: None,
                        source_app_bundle: None,
                    }));
                }

                let bytes = text.as_bytes();
                if bytes.len() > MAX_CLIPBOARD_TEXT_BYTES {
                    return Err(ClipboardError::PayloadTooLarge(bytes.len()));
                }

                let hash = Self::compute_hash(bytes);
                {
                    let mut hash_guard = self.last_content_hash.lock().unwrap();
                    *hash_guard = Some(hash);
                }

                return Ok(Some(RawClipboardPayload {
                    change_count,
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

        Ok(None)
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
        {
            let mut hash_guard = self.last_content_hash.lock().unwrap();
            *hash_guard = Some(hash);
        }

        let count = self.get_change_count().unwrap_or_else(|_| {
            self.last_known_change_count.fetch_add(1, Ordering::SeqCst) + 1
        });
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
        {
            let mut hash_guard = self.last_content_hash.lock().unwrap();
            *hash_guard = Some(hash);
        }

        let count = self.get_change_count().unwrap_or_else(|_| {
            self.last_known_change_count.fetch_add(1, Ordering::SeqCst) + 1
        });
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_arboard_backend_change_count_queries_os() {
        let backend = ArboardClipboardBackend::new();
        let count = backend.get_change_count().unwrap();
        assert!(count > 0, "Change count should be non-zero on system clipboard");
    }

    #[test]
    fn test_arboard_backend_write_and_read_text() {
        let backend = ArboardClipboardBackend::new();
        let test_str = format!("CopyVault test string {}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
        let count_after_write = backend.write_text(&test_str).unwrap();
        assert!(count_after_write > 0);

        let current = backend.read_current_payload().unwrap().expect("payload");
        match current.data {
            ClipboardPayloadData::Text { text, .. } => {
                assert_eq!(text, test_str);
            }
            _ => panic!("Expected text payload"),
        }
    }

    #[test]
    fn test_arboard_backend_reads_file_drop() {
        let backend = ArboardClipboardBackend::new();
        let payload = backend.read_current_payload().unwrap();
        println!("READ CURRENT PAYLOAD WITH NEW FILE DROP SUPPORT: {:?}", payload);
        assert!(payload.is_some(), "Payload should not be None when an image file is on clipboard");
    }
}
