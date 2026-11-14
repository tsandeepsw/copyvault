use std::sync::atomic::{AtomicI64, Ordering};
use objc2_app_kit::{
    NSBitmapImageFileType, NSBitmapImageRep, NSPasteboard, NSPasteboardTypeFileURL,
    NSPasteboardTypeHTML, NSPasteboardTypePNG, NSPasteboardTypeRTF, NSPasteboardTypeString,
    NSPasteboardTypeTIFF,
};
use objc2_foundation::{NSData, NSDictionary, NSString};

use crate::clipboard::detector::is_concealed_type;
use crate::clipboard::error::ClipboardError;

pub const MAX_CLIPBOARD_TEXT_BYTES: usize = 10 * 1024 * 1024; // 10 MB limit per SECURITY.md
pub const MAX_CLIPBOARD_IMAGE_BYTES: usize = 50 * 1024 * 1024; // 50 MB limit per SECURITY.md

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

/// Native macOS clipboard backend using Cocoa NSPasteboard.
pub struct MacOsClipboardBackend {
    last_known_change_count: AtomicI64,
}

impl Default for MacOsClipboardBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl MacOsClipboardBackend {
    pub fn new() -> Self {
        let initial_count = Self::query_os_change_count().unwrap_or(0);
        Self {
            last_known_change_count: AtomicI64::new(initial_count),
        }
    }

    fn query_os_change_count() -> Result<i64, ClipboardError> {
        let pboard = NSPasteboard::generalPasteboard();
        Ok(pboard.changeCount() as i64)
    }
}

impl ClipboardBackend for MacOsClipboardBackend {
    fn get_change_count(&self) -> Result<i64, ClipboardError> {
        let count = Self::query_os_change_count()?;
        self.last_known_change_count.store(count, Ordering::Relaxed);
        Ok(count)
    }

    fn is_concealed(&self) -> Result<bool, ClipboardError> {
        let pboard = NSPasteboard::generalPasteboard();
        let types = match pboard.types() {
            Some(t) => t,
            None => return Ok(false),
        };

        for i in 0..types.count() {
            let item = types.objectAtIndex(i);
            let type_str = item.to_string();
            if is_concealed_type(&type_str) {
                return Ok(true);
            }
        }

        Ok(false)
    }

    fn read_current_payload(&self) -> Result<Option<RawClipboardPayload>, ClipboardError> {
        let pboard = NSPasteboard::generalPasteboard();
        let change_count = pboard.changeCount() as i64;

        if self.is_concealed()? {
            return Err(ClipboardError::ConcealedContent);
        }

        let types = match pboard.types() {
            Some(t) => t,
            None => return Ok(None),
        };

        let mut has_string = false;
        let mut has_html = false;
        let mut has_rtf = false;
        let mut has_png = false;
        let mut has_tiff = false;
        let mut has_gif = false;
        let mut has_file_url = false;

        let gif_type_str = "com.compuserve.gif";
        let mut raw_gif_type: Option<objc2::rc::Retained<NSString>> = None;
        let file_url_type_str = unsafe { NSPasteboardTypeFileURL.to_string() };

        for i in 0..types.count() {
            let t = types.objectAtIndex(i);
            let s = t.to_string();
            if s == unsafe { NSPasteboardTypeString.to_string() } {
                has_string = true;
            } else if s == unsafe { NSPasteboardTypeHTML.to_string() } {
                has_html = true;
            } else if s == unsafe { NSPasteboardTypeRTF.to_string() } {
                has_rtf = true;
            } else if s == unsafe { NSPasteboardTypePNG.to_string() } {
                has_png = true;
            } else if s == unsafe { NSPasteboardTypeTIFF.to_string() } {
                has_tiff = true;
            } else if s.to_lowercase() == gif_type_str {
                has_gif = true;
                raw_gif_type = Some(t);
            } else if s == file_url_type_str || s == "public.file-url" {
                has_file_url = true;
            }
        }

        // Priority 1: Animated GIF if explicitly available
        if has_gif
            && let Some(gif_type) = raw_gif_type
            && let Some(data) = pboard.dataForType(&gif_type)
        {
            let bytes = data.to_vec();
            if bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES {
                return Err(ClipboardError::PayloadTooLarge(bytes.len()));
            }
            if !bytes.is_empty() {
                return Ok(Some(RawClipboardPayload {
                    change_count,
                    data: ClipboardPayloadData::Image {
                        bytes,
                        mime_type: "image/gif".to_string(),
                        width: None,
                        height: None,
                    },
                    source_app_name: None,
                    source_app_bundle: None,
                }));
            }
        }

        // Priority 2: PNG Lossless Image
        if has_png
            && let Some(data) = pboard.dataForType(unsafe { NSPasteboardTypePNG })
        {
            let bytes = data.to_vec();
            if bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES {
                return Err(ClipboardError::PayloadTooLarge(bytes.len()));
            }
            if !bytes.is_empty() {
                return Ok(Some(RawClipboardPayload {
                    change_count,
                    data: ClipboardPayloadData::Image {
                        bytes,
                        mime_type: "image/png".to_string(),
                        width: None,
                        height: None,
                    },
                    source_app_name: None,
                    source_app_bundle: None,
                }));
            }
        }

        // Priority 3: TIFF Image (macOS screenshot native format)
        if has_tiff
            && let Some(data) = pboard.dataForType(unsafe { NSPasteboardTypeTIFF })
        {
            let raw_tiff_bytes = data.to_vec();
            if raw_tiff_bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES {
                return Err(ClipboardError::PayloadTooLarge(raw_tiff_bytes.len()));
            }
            if !raw_tiff_bytes.is_empty() {
                // Convert TIFF to lossless PNG for universal WebView & browser compatibility
                let (bytes, mime_type) = if let Some(rep) = NSBitmapImageRep::imageRepWithData(&data) {
                    let props = NSDictionary::new();
                    if let Some(png_data) = unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &props) } {
                        (png_data.to_vec(), "image/png".to_string())
                    } else {
                        (raw_tiff_bytes, "image/tiff".to_string())
                    }
                } else {
                    (raw_tiff_bytes, "image/tiff".to_string())
                };

                return Ok(Some(RawClipboardPayload {
                    change_count,
                    data: ClipboardPayloadData::Image {
                        bytes,
                        mime_type,
                        width: None,
                        height: None,
                    },
                    source_app_name: None,
                    source_app_bundle: None,
                }));
            }
        }

        // Priority 4: Local Image File URL (e.g. copied from Downloads folder / Finder)
        if has_file_url
            && let Some(ns_str) = pboard.stringForType(unsafe { NSPasteboardTypeFileURL })
        {
            let file_url = ns_str.to_string();
            if let Some((bytes, mime_type)) = resolve_image_from_file_uri(&file_url) {
                return Ok(Some(RawClipboardPayload {
                    change_count,
                    data: ClipboardPayloadData::Image {
                        bytes,
                        mime_type,
                        width: None,
                        height: None,
                    },
                    source_app_name: Some("Finder".to_string()),
                    source_app_bundle: Some("com.apple.finder".to_string()),
                }));
            }
        }

        // Priority 5: Plain Text and Rich Text
        if has_string
            && let Some(ns_str) = pboard.stringForType(unsafe { NSPasteboardTypeString })
        {
            let text = ns_str.to_string();

            // Also check if text itself is a path or file:// pointing to a local image
            if (text.starts_with("file://") || text.starts_with('/'))
                && let Some((bytes, mime_type)) = resolve_image_from_file_uri(&text)
            {
                return Ok(Some(RawClipboardPayload {
                    change_count,
                    data: ClipboardPayloadData::Image {
                        bytes,
                        mime_type,
                        width: None,
                        height: None,
                    },
                    source_app_name: Some("Finder".to_string()),
                    source_app_bundle: Some("com.apple.finder".to_string()),
                }));
            }
            if text.len() > MAX_CLIPBOARD_TEXT_BYTES {
                return Err(ClipboardError::PayloadTooLarge(text.len()));
            }

            let html = if has_html {
                pboard
                    .stringForType(unsafe { NSPasteboardTypeHTML })
                    .map(|s| s.to_string())
            } else {
                None
            };

            let rtf = if has_rtf {
                pboard
                    .dataForType(unsafe { NSPasteboardTypeRTF })
                    .map(|d| d.to_vec())
            } else {
                None
            };

            return Ok(Some(RawClipboardPayload {
                change_count,
                data: ClipboardPayloadData::Text {
                    text,
                    html,
                    rtf,
                },
                source_app_name: None,
                source_app_bundle: None,
            }));
        }

        // Unsupported or unreadable format
        Ok(None)
    }

    fn write_text(&self, text: &str) -> Result<i64, ClipboardError> {
        let pboard = NSPasteboard::generalPasteboard();
        pboard.clearContents();

        let ns_str = NSString::from_str(text);
        let success = pboard.setString_forType(&ns_str, unsafe { NSPasteboardTypeString });

        if !success {
            return Err(ClipboardError::Platform(
                "NSPasteboard setString:forType returned false".to_string(),
            ));
        }

        let new_change_count = pboard.changeCount() as i64;
        self.last_known_change_count
            .store(new_change_count, Ordering::Relaxed);
        Ok(new_change_count)
    }

    fn write_image(&self, bytes: &[u8], mime_type: &str) -> Result<i64, ClipboardError> {
        let pboard = NSPasteboard::generalPasteboard();
        pboard.clearContents();

        let ns_data = NSData::with_bytes(bytes);
        let pboard_type = match mime_type {
            "image/tiff" => unsafe { NSPasteboardTypeTIFF },
            _ => unsafe { NSPasteboardTypePNG },
        };
        let success = pboard.setData_forType(Some(&ns_data), pboard_type);
        if !success {
            return Err(ClipboardError::Platform(
                "NSPasteboard setData:forType returned false".to_string(),
            ));
        }

        let new_change_count = pboard.changeCount() as i64;
        self.last_known_change_count
            .store(new_change_count, Ordering::Relaxed);
        Ok(new_change_count)
    }
}

/// Attempts to resolve and read an image file from a file URI (e.g. `file:///Users/.../image.png`) or local path.
fn resolve_image_from_file_uri(uri_str: &str) -> Option<(Vec<u8>, String)> {
    let clean_str = uri_str.trim();
    let raw_path = if let Some(stripped) = clean_str.strip_prefix("file://") {
        if let Some(without_host) = stripped.strip_prefix("localhost") {
            without_host
        } else {
            stripped
        }
    } else if clean_str.starts_with('/') {
        clean_str
    } else {
        return None;
    };

    let decoded_path = percent_decode_str(raw_path);
    let path = std::path::Path::new(&decoded_path);
    if !path.is_file() {
        return None;
    }

    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        _ => return None,
    };

    let bytes = std::fs::read(path).ok()?;
    if bytes.is_empty() || bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES {
        return None;
    }

    if mime == "image/tiff" {
        let ns_data = NSData::with_bytes(&bytes);
        if let Some(rep) = NSBitmapImageRep::imageRepWithData(&ns_data) {
            let props = NSDictionary::new();
            if let Some(png_data) =
                unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &props) }
            {
                return Some((png_data.to_vec(), "image/png".to_string()));
            }
        }
    }

    Some((bytes, mime.to_string()))
}

fn percent_decode_str(s: &str) -> String {
    let mut result = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let (Some(h1), Some(h2)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2]))
        {
            result.push(h1 << 4 | h2);
            i += 3;
            continue;
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}
