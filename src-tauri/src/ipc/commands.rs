use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};

use crate::db::models::{
    ClipboardItem, Collection, FormatType, ImportResultDto, NewClipboardItem, NewCollection,
    NewImageParams, NewPasteSequence, NewPasteSequenceItem, NewSavedSnippet, NewTag,
    PaginatedResult, PaginationParams, PasteSequence, SavedSnippet, SortOrder, Tag,
    UpdateSavedSnippet, VaultArchiveDto,
};
use crate::db::service::DatabaseService;
use crate::ipc::dto::{
    AddItemRequest, AssignCollectionRequest, ClearHistoryRequest, CreateCollectionRequest,
    CreateSnippetRequest, CreateTagRequest, GetItemsRequest, IdRequest, ImportVaultRequest,
    SavePasteSequenceRequest, SearchItemsRequest, SystemStatus, TagItemRequest,
    UpdateItemRequest, UpdateSnippetRequest,
};
use crate::utils::error::{AppErrorDto, VaultError};

const MAX_SEARCH_QUERY_LEN: usize = 256;
const MAX_ITEM_TEXT_BYTES: usize = 10 * 1024 * 1024; // 10 MB limit per SECURITY.md §7.2

#[tauri::command]
pub fn get_system_status(db: State<'_, DatabaseService>) -> Result<SystemStatus, AppErrorDto> {
    let timestamp_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let schema_version = db.get_schema_version().map_err(AppErrorDto::from)?;

    Ok(SystemStatus {
        app_name: "CopyVault".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        status: "healthy".to_string(),
        timestamp_millis,
        schema_version,
    })
}

#[tauri::command]
pub fn get_recent_items(
    req: GetItemsRequest,
    db: State<'_, DatabaseService>,
) -> Result<PaginatedResult<ClipboardItem>, AppErrorDto> {
    let filter = req.filter.unwrap_or_default();
    let sort = req.sort.unwrap_or(SortOrder::Newest);
    let pagination = PaginationParams::new(req.offset.unwrap_or(0), req.limit.unwrap_or(50));

    db.list_items(&filter, sort, &pagination)
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn search_items(
    req: SearchItemsRequest,
    db: State<'_, DatabaseService>,
) -> Result<PaginatedResult<ClipboardItem>, AppErrorDto> {
    if req.query.len() > MAX_SEARCH_QUERY_LEN {
        return Err(VaultError::InvalidInput(format!(
            "Search query exceeds maximum limit of {} characters",
            MAX_SEARCH_QUERY_LEN
        ))
        .into());
    }

    let filter = req.filter.unwrap_or_default();
    let limit = req.limit.unwrap_or(50);
    let offset = req.offset.unwrap_or(0);

    db.search_items(&req.query, &filter, limit, offset)
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn update_item_content(
    req: UpdateItemRequest,
    db: State<'_, DatabaseService>,
) -> Result<ClipboardItem, AppErrorDto> {
    if req.new_content.len() > MAX_ITEM_TEXT_BYTES {
        return Err(VaultError::InvalidInput(format!(
            "Content length exceeds maximum limit of {} bytes",
            MAX_ITEM_TEXT_BYTES
        ))
        .into());
    }

    db.update_item_text(req.id, &req.new_content)
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn toggle_pin_item(
    req: IdRequest,
    db: State<'_, DatabaseService>,
) -> Result<bool, AppErrorDto> {
    db.toggle_pin(req.id).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn toggle_favorite_item(
    req: IdRequest,
    db: State<'_, DatabaseService>,
) -> Result<bool, AppErrorDto> {
    db.toggle_favorite(req.id).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn delete_item(
    req: IdRequest,
    db: State<'_, DatabaseService>,
    media: State<'_, crate::media::MediaManager>,
) -> Result<(), AppErrorDto> {
    if let Some(media_path) = db.delete_item(req.id).map_err(AppErrorDto::from)? {
        let _ = media.cleanup_media_if_unreferenced(&db, &media_path);
    }
    Ok(())
}

#[tauri::command]
pub fn bulk_delete_items(
    req: crate::ipc::dto::BulkDeleteRequest,
    db: State<'_, DatabaseService>,
    media: State<'_, crate::media::MediaManager>,
) -> Result<u64, AppErrorDto> {
    let count = req.ids.len() as u64;
    let media_paths = db.bulk_delete_items(&req.ids).map_err(AppErrorDto::from)?;
    for path in media_paths {
        let _ = media.cleanup_media_if_unreferenced(&db, &path);
    }
    Ok(count)
}

#[tauri::command]
pub fn run_retention_cleanup(
    req: crate::ipc::dto::RetentionCleanupRequest,
    db: State<'_, DatabaseService>,
    media: State<'_, crate::media::MediaManager>,
) -> Result<crate::ipc::dto::RetentionResultDto, AppErrorDto> {
    let (deleted_items, media_paths) = db
        .cleanup_retention(req.max_items, req.retention_days)
        .map_err(AppErrorDto::from)?;

    let mut deleted_media = 0;
    for path in media_paths {
        if let Ok(true) = media.cleanup_media_if_unreferenced(&db, &path) {
            deleted_media += 1;
        }
    }

    Ok(crate::ipc::dto::RetentionResultDto {
        deleted_items,
        deleted_media,
    })
}

#[tauri::command]
pub fn clear_history(
    req: ClearHistoryRequest,
    db: State<'_, DatabaseService>,
    media: State<'_, crate::media::MediaManager>,
) -> Result<u64, AppErrorDto> {
    let (deleted_count, media_paths) = db.clear_history(req.keep_pinned).map_err(AppErrorDto::from)?;
    for path in media_paths {
        let _ = media.cleanup_media_if_unreferenced(&db, &path);
    }
    Ok(deleted_count)
}

/// Helper: decodes base64 payload supporting data URLs and standard padding.
fn decode_base64_payload(input: &str) -> Option<Vec<u8>> {
    let raw = if let Some(idx) = input.find(";base64,") {
        &input[idx + 8..]
    } else {
        input.trim()
    };
    let mut table = [255u8; 256];
    for (i, &b) in b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".iter().enumerate() {
        table[b as usize] = i as u8;
    }
    let mut out = Vec::with_capacity((raw.len() * 3) / 4);
    let mut buf = 0u32;
    let mut bits = 0;
    for &b in raw.as_bytes() {
        if b == b'=' || b.is_ascii_whitespace() {
            continue;
        }
        let val = table[b as usize];
        if val == 255 {
            return None;
        }
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

#[tauri::command]
pub fn add_item(
    req: AddItemRequest,
    db: State<'_, DatabaseService>,
    media_mgr: State<'_, crate::media::MediaManager>,
) -> Result<ClipboardItem, AppErrorDto> {
    let now_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let format_lower = req.format_type.to_lowercase();
    let is_image = format_lower == "image" || req.media_data_base64.is_some();

    if is_image {
        let (bytes, mime) = if let Some(ref b64) = req.media_data_base64 {
            let decoded = decode_base64_payload(b64).ok_or_else(|| AppErrorDto {
                code: "INVALID_BASE64".to_string(),
                message: "Failed to decode base64 image data".to_string(),
            })?;
            let mime = req.media_mime.unwrap_or_else(|| "image/png".to_string());
            (decoded, mime)
        } else if req.content.starts_with("data:image/") {
            let decoded = decode_base64_payload(&req.content).ok_or_else(|| AppErrorDto {
                code: "INVALID_DATA_URI".to_string(),
                message: "Failed to decode data URI image".to_string(),
            })?;
            let mime = if let Some(end) = req.content.find(";base64") {
                req.content[5..end].to_string()
            } else {
                "image/png".to_string()
            };
            (decoded, mime)
        } else if std::path::Path::new(&req.content).is_file() {
            let path = std::path::Path::new(&req.content);
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("png").to_ascii_lowercase();
            let mime = match ext.as_str() {
                "jpg" | "jpeg" => "image/jpeg",
                "gif" => "image/gif",
                "webp" => "image/webp",
                "svg" => "image/svg+xml",
                _ => "image/png",
            };
            let read_bytes = std::fs::read(path).map_err(|e| AppErrorDto {
                code: "FILE_READ_ERROR".to_string(),
                message: format!("Failed to read image file from disk: {}", e),
            })?;
            (read_bytes, mime.to_string())
        } else {
            // Fallback 1x1 valid transparent PNG
            let fallback_png = vec![
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
                0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
                0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
                0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
                0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
            ];
            (fallback_png, "image/png".to_string())
        };

        let content_hash = NewClipboardItem::compute_binary_hash(&bytes);
        let ext = if mime.contains("gif") {
            "gif"
        } else if mime.contains("jpeg") || mime.contains("jpg") {
            "jpg"
        } else if mime.contains("webp") {
            "webp"
        } else {
            "png"
        };

        let relative_path = media_mgr.store_media(&content_hash, ext, &bytes).map_err(AppErrorDto::from)?;
        let thumbnail_blob = if bytes.len() <= 1024 * 1024 {
            Some(bytes.clone())
        } else {
            Some(bytes[..512 * 1024].to_vec())
        };

        let new_item = NewClipboardItem::new_image(NewImageParams {
            raw_bytes: &bytes,
            media_path: relative_path,
            media_mime: mime,
            width: req.width.unwrap_or(800),
            height: req.height.unwrap_or(600),
            thumbnail_blob,
            source_app_name: req.source_app.or_else(|| Some("Upload".to_string())),
            source_app_bundle: None,
            timestamp_millis: now_millis,
        });

        return db.insert_item(&new_item).map_err(AppErrorDto::from);
    }

    if req.content.len() > MAX_ITEM_TEXT_BYTES {
        return Err(VaultError::InvalidInput(format!(
            "Content length exceeds maximum limit of {} bytes",
            MAX_ITEM_TEXT_BYTES
        ))
        .into());
    }

    let is_link = format_lower == "link" || format_lower == "url" || crate::clipboard::detector::is_url(&req.content);
    let is_code = !is_link && (format_lower == "code" || crate::clipboard::service::detect_is_code(&req.content));
    let detected_lang = if is_code { Some("code".to_string()) } else { None };

    let format_type = if is_link {
        FormatType::Link
    } else if is_code {
        FormatType::Code
    } else {
        FormatType::Text
    };

    let content_hash = NewClipboardItem::compute_text_hash(&req.content);
    let new_item = NewClipboardItem {
        content_hash,
        format_type,
        plain_text: Some(req.content),
        html_content: None,
        rtf_content: None,
        media_path: None,
        media_mime: None,
        media_width: None,
        media_height: None,
        media_size_bytes: None,
        media_thumbnail: None,
        source_app_bundle: None,
        source_app_name: req.source_app,
        detected_lang,
        is_pinned: false,
        is_favorite: false,
        timestamp_millis: now_millis,
    };

    db.insert_item(&new_item).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn capture_clipboard_slice(
    app: tauri::AppHandle,
    clipboard: State<'_, Arc<crate::clipboard::ClipboardService>>,
) -> Result<Option<ClipboardItem>, AppErrorDto> {
    let item_opt = clipboard.capture_slice_once().map_err(|err| AppErrorDto {
        code: "CLIPBOARD_CAPTURE_ERROR".to_string(),
        message: err.to_string(),
    })?;

    if let Some(ref item) = item_opt {
        use tauri::Emitter;
        let _ = app.emit("clipboard-item-captured", item);
    }

    Ok(item_opt)
}

#[tauri::command]
pub fn start_monitoring_command(
    app: tauri::AppHandle,
    clipboard: State<'_, Arc<crate::clipboard::ClipboardService>>,
) -> Result<(), AppErrorDto> {
    let app_handle = app.clone();
    clipboard.set_on_capture(move |item| {
        use tauri::Emitter;
        let _ = app_handle.emit("clipboard-item-captured", &item);
    });
    clipboard.start_monitoring(250);
    Ok(())
}

#[tauri::command]
pub fn stop_monitoring_command(
    clipboard: State<'_, Arc<crate::clipboard::ClipboardService>>,
) -> Result<(), AppErrorDto> {
    clipboard.stop_monitoring();
    Ok(())
}

#[tauri::command]
pub fn set_clipboard_paused(
    req: crate::ipc::dto::SetMonitoringPausedRequest,
    clipboard: State<'_, Arc<crate::clipboard::ClipboardService>>,
) -> Result<(), AppErrorDto> {
    if req.paused {
        clipboard.pause();
    } else {
        clipboard.resume();
    }
    Ok(())
}

#[tauri::command]
pub fn get_clipboard_status(
    clipboard: State<'_, Arc<crate::clipboard::ClipboardService>>,
) -> Result<crate::ipc::dto::ClipboardStatusDto, AppErrorDto> {
    Ok(crate::ipc::dto::ClipboardStatusDto {
        is_running: clipboard.is_running(),
        is_paused: clipboard.is_paused(),
    })
}

#[tauri::command]
pub fn copy_to_clipboard(
    req: crate::ipc::dto::CopyToClipboardRequest,
    clipboard: State<'_, Arc<crate::clipboard::ClipboardService>>,
) -> Result<(), AppErrorDto> {
    clipboard
        .write_to_clipboard(&req.text)
        .map_err(|err| AppErrorDto {
            code: "CLIPBOARD_WRITE_ERROR".to_string(),
            message: err.to_string(),
        })
}

#[tauri::command]
pub fn copy_item_image_to_clipboard(
    req: crate::ipc::dto::CopyItemImageRequest,
    db: State<'_, DatabaseService>,
    clipboard: State<'_, Arc<crate::clipboard::ClipboardService>>,
    media_mgr: State<'_, crate::media::MediaManager>,
) -> Result<(), AppErrorDto> {
    let item = db.get_item(req.id).map_err(AppErrorDto::from)?.ok_or_else(|| AppErrorDto {
        code: "ITEM_NOT_FOUND".to_string(),
        message: format!("Item {} not found", req.id),
    })?;

    let media_path = item.media_path.ok_or_else(|| AppErrorDto {
        code: "NOT_AN_IMAGE".to_string(),
        message: "Item does not have a media path".to_string(),
    })?;

    let bytes = media_mgr.read_media(&media_path).map_err(|e| AppErrorDto {
        code: "MEDIA_READ_ERROR".to_string(),
        message: e.to_string(),
    })?;

    let mime_type = item.media_mime.unwrap_or_else(|| "image/png".to_string());
    clipboard
        .write_image_to_clipboard(&bytes, &mime_type)
        .map_err(|err| AppErrorDto {
            code: "CLIPBOARD_WRITE_ERROR".to_string(),
            message: err.to_string(),
        })
}

#[tauri::command]
pub fn get_media_data(
    req: crate::ipc::dto::IdRequest,
    db: State<'_, DatabaseService>,
    media_mgr: State<'_, crate::media::MediaManager>,
) -> Result<crate::ipc::dto::MediaDataDto, AppErrorDto> {
    let item = db.get_item(req.id).map_err(AppErrorDto::from)?.ok_or_else(|| AppErrorDto {
        code: "ITEM_NOT_FOUND".to_string(),
        message: format!("Item {} not found", req.id),
    })?;

    let media_path = item.media_path.ok_or_else(|| AppErrorDto {
        code: "NOT_AN_IMAGE".to_string(),
        message: "Item does not have a media path".to_string(),
    })?;

    let bytes = media_mgr.read_media(&media_path).map_err(|e| AppErrorDto {
        code: "MEDIA_READ_ERROR".to_string(),
        message: e.to_string(),
    })?;

    let mime_type = item.media_mime.unwrap_or_else(|| "image/png".to_string());
    Ok(crate::ipc::dto::MediaDataDto { mime_type, bytes })
}

#[tauri::command]
pub fn start_sequential_paste(
    req: crate::ipc::dto::StartSequentialRequest,
    session_mgr: State<'_, crate::paste::SequentialSessionManager>,
    simulator: State<'_, Arc<dyn crate::paste::PasteSimulator>>,
    clipboard: State<'_, Arc<crate::clipboard::ClipboardService>>,
) -> Result<crate::paste::SequentialStatusDto, AppErrorDto> {
    session_mgr
        .start_session(req.items, req.mode, simulator.inner().as_ref(), &clipboard)
        .map_err(|err| AppErrorDto {
            code: "SEQUENTIAL_START_ERROR".to_string(),
            message: err.to_string(),
        })
}

#[tauri::command]
pub fn paste_next_sequential(
    session_mgr: State<'_, crate::paste::SequentialSessionManager>,
    simulator: State<'_, Arc<dyn crate::paste::PasteSimulator>>,
    clipboard: State<'_, Arc<crate::clipboard::ClipboardService>>,
) -> Result<crate::paste::SequentialStatusDto, AppErrorDto> {
    session_mgr
        .paste_next(simulator.inner().as_ref(), &clipboard)
        .map_err(|err| AppErrorDto {
            code: "SEQUENTIAL_PASTE_ERROR".to_string(),
            message: err.to_string(),
        })
}

#[tauri::command]
pub fn cancel_sequential_paste(
    session_mgr: State<'_, crate::paste::SequentialSessionManager>,
    simulator: State<'_, Arc<dyn crate::paste::PasteSimulator>>,
) -> Result<crate::paste::SequentialStatusDto, AppErrorDto> {
    Ok(session_mgr.cancel_session(simulator.inner().as_ref()))
}

#[tauri::command]
pub fn get_sequential_status(
    session_mgr: State<'_, crate::paste::SequentialSessionManager>,
    simulator: State<'_, Arc<dyn crate::paste::PasteSimulator>>,
) -> Result<crate::paste::SequentialStatusDto, AppErrorDto> {
    Ok(session_mgr.get_status(simulator.inner().as_ref()))
}

#[tauri::command]
pub fn check_paste_accessibility(
    simulator: State<'_, Arc<dyn crate::paste::PasteSimulator>>,
) -> Result<crate::ipc::dto::AccessibilityStatusDto, AppErrorDto> {
    let is_trusted = simulator.check_accessibility();
    Ok(crate::ipc::dto::AccessibilityStatusDto {
        is_trusted,
        platform: std::env::consts::OS.to_string(),
    })
}

#[tauri::command]
pub fn request_paste_accessibility(
    simulator: State<'_, Arc<dyn crate::paste::PasteSimulator>>,
) -> Result<(), AppErrorDto> {
    simulator.request_accessibility();
    Ok(())
}

#[tauri::command]
pub fn get_desktop_settings(
    window_mgr: State<'_, Arc<crate::window::WindowManager>>,
) -> Result<crate::ipc::dto::DesktopSettingsDto, AppErrorDto> {
    let s = window_mgr.get_settings();
    Ok(crate::ipc::dto::DesktopSettingsDto {
        global_shortcut: s.global_shortcut,
        launch_at_login: s.launch_at_login,
        auto_hide_on_blur: s.auto_hide_on_blur,
        compact_density: s.compact_density,
        theme: s.theme,
    })
}

#[tauri::command]
pub fn update_desktop_settings(
    settings: crate::ipc::dto::DesktopSettingsDto,
    window_mgr: State<'_, Arc<crate::window::WindowManager>>,
) -> Result<(), AppErrorDto> {
    let domain_settings = crate::window::DesktopSettings {
        global_shortcut: settings.global_shortcut,
        launch_at_login: settings.launch_at_login,
        auto_hide_on_blur: settings.auto_hide_on_blur,
        compact_density: settings.compact_density,
        theme: settings.theme,
    };
    window_mgr
        .update_settings(&domain_settings)
        .map_err(|e| VaultError::InvalidInput(e).into())
}

#[tauri::command]
pub fn hide_quick_panel(app: tauri::AppHandle) -> Result<(), AppErrorDto> {
    crate::window::WindowManager::hide_window(&app)
        .map_err(|e| VaultError::InvalidInput(e).into())
}

#[tauri::command]
pub fn toggle_quick_panel(
    app: tauri::AppHandle,
    window_mgr: State<'_, Arc<crate::window::WindowManager>>,
) -> Result<bool, AppErrorDto> {
    window_mgr.record_foreground_target();
    crate::window::WindowManager::toggle_quick_panel(&app)
        .map_err(|e| VaultError::InvalidInput(e).into())
}

#[tauri::command]
pub fn set_window_mode(
    req: crate::ipc::dto::SetWindowModeRequest,
    app: tauri::AppHandle,
    window_mgr: State<'_, Arc<crate::window::WindowManager>>,
) -> Result<(), AppErrorDto> {
    let is_quick = req.mode == "quick_panel";
    window_mgr.set_quick_panel_mode(is_quick);
    if let Some(window) = app.get_webview_window("main") {
        let (w, h) = if is_quick {
            (crate::window::QUICK_PANEL_WIDTH, crate::window::QUICK_PANEL_HEIGHT)
        } else {
            (crate::window::FULL_WORKSPACE_WIDTH, crate::window::FULL_WORKSPACE_HEIGHT)
        };
        let _ = window.set_size(tauri::LogicalSize::new(w, h));
        let _ = window.center();
        Ok(())
    } else {
        Err(VaultError::InvalidInput("Main window not found".into()).into())
    }
}

#[tauri::command]
pub fn get_privacy_settings(
    db: State<'_, DatabaseService>,
    clipboard: State<'_, Arc<crate::clipboard::ClipboardService>>,
) -> Result<crate::ipc::dto::PrivacySettingsDto, AppErrorDto> {
    let pause_monitoring = clipboard.is_paused();
    let skip_confidential_heuristics = clipboard.is_skip_confidential_heuristics_enabled();
    let app_exclusions = clipboard.get_exclusions();

    let max_capacity = db
        .get_setting("max_capacity")
        .ok()
        .flatten()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(1000);

    let retention_days = db
        .get_setting("retention_days")
        .ok()
        .flatten()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(30);

    // On macOS, bundle IDs and app names are reliably exposed via NSPasteboard / NSWorkspace.
    // On Windows, GetClipboardOwner provides process info; on generic Linux, source app is often unknown.
    let platform_supports_app_identification = cfg!(target_os = "macos") || cfg!(target_os = "windows");

    Ok(crate::ipc::dto::PrivacySettingsDto {
        pause_monitoring,
        skip_confidential_heuristics,
        app_exclusions,
        max_capacity,
        retention_days,
        platform_supports_app_identification,
    })
}

#[tauri::command]
pub fn update_privacy_settings(
    req: crate::ipc::dto::UpdatePrivacySettingsRequest,
    db: State<'_, DatabaseService>,
    clipboard: State<'_, Arc<crate::clipboard::ClipboardService>>,
) -> Result<crate::ipc::dto::PrivacySettingsDto, AppErrorDto> {
    if let Some(paused) = req.pause_monitoring {
        if paused {
            clipboard.pause();
        } else {
            clipboard.resume();
        }
        let _ = db.set_setting("pause_monitoring", if paused { "true" } else { "false" });
    }

    if let Some(skip) = req.skip_confidential_heuristics {
        clipboard.set_skip_confidential_heuristics(skip);
        let _ = db.set_setting("skip_confidential_heuristics", if skip { "true" } else { "false" });
    }

    if let Some(ref exclusions) = req.app_exclusions {
        clipboard.set_exclusions(exclusions.clone());
        if let Ok(serialized) = serde_json::to_string(exclusions) {
            let _ = db.set_setting("app_exclusions", &serialized);
        }
    }

    if let Some(capacity) = req.max_capacity {
        let _ = db.set_setting("max_capacity", &capacity.to_string());
    }

    if let Some(days) = req.retention_days {
        let _ = db.set_setting("retention_days", &days.to_string());
    }

    get_privacy_settings(db, clipboard)
}

#[tauri::command]
pub fn get_privacy_diagnostics(
    db: State<'_, DatabaseService>,
    clipboard: State<'_, Arc<crate::clipboard::ClipboardService>>,
    media: State<'_, crate::media::MediaManager>,
) -> Result<crate::ipc::dto::PrivacyDiagnosticsDto, AppErrorDto> {
    let all_items = db
        .list_items(
            &crate::db::models::ItemFilter::default(),
            crate::db::models::SortOrder::Newest,
            &crate::db::models::PaginationParams::new(0, 1),
        )
        .map_err(AppErrorDto::from)?;

    let pinned_filter = crate::db::models::ItemFilter {
        is_pinned: Some(true),
        ..Default::default()
    };
    let pinned_items = db
        .list_items(
            &pinned_filter,
            crate::db::models::SortOrder::Newest,
            &crate::db::models::PaginationParams::new(0, 1),
        )
        .map_err(AppErrorDto::from)?;

    let media_filter = crate::db::models::ItemFilter {
        format_type: Some(crate::db::models::FormatType::Image),
        ..Default::default()
    };
    let media_items = db
        .list_items(
            &media_filter,
            crate::db::models::SortOrder::Newest,
            &crate::db::models::PaginationParams::new(0, 1),
        )
        .map_err(AppErrorDto::from)?;

    let app_paths = crate::utils::paths::AppPaths::from_default().map_err(AppErrorDto::from)?;

    let db_size_bytes = std::fs::metadata(&app_paths.db_path)
        .map(|m| m.len())
        .unwrap_or(0);

    let media_dir_size_bytes = std::fs::read_dir(&app_paths.media_dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter_map(|e| e.metadata().ok())
                .filter(|m| m.is_file())
                .map(|m| m.len())
                .sum::<u64>()
        })
        .unwrap_or(0);

    let _ = media; // Keeps media state in scope

    Ok(crate::ipc::dto::PrivacyDiagnosticsDto {
        total_items_count: all_items.total as u64,
        pinned_items_count: pinned_items.total as u64,
        media_items_count: media_items.total as u64,
        db_size_bytes,
        media_dir_size_bytes,
        app_data_dir: app_paths.app_data_dir.to_string_lossy().to_string(),
        db_path: app_paths.db_path.to_string_lossy().to_string(),
        media_dir: app_paths.media_dir.to_string_lossy().to_string(),
        platform: std::env::consts::OS.to_string(),
        is_monitoring_paused: clipboard.is_paused(),
        is_monitoring_running: clipboard.is_running(),
        exclusions_count: clipboard.get_exclusions().len(),
        confidential_heuristics_active: clipboard.is_skip_confidential_heuristics_enabled(),
        memory_rss_bytes: 0, // Zero privacy-invasive process inspect
    })
}

// ==========================================
// Phase 8: Saved Snippets, Collections & Sequences
// ==========================================

#[tauri::command]
pub fn create_saved_snippet(
    db: State<'_, DatabaseService>,
    req: CreateSnippetRequest,
) -> Result<SavedSnippet, AppErrorDto> {
    let new_snip = NewSavedSnippet {
        title: req.title,
        trigger_prefix: req.trigger_prefix,
        content: req.content,
        syntax: req.syntax,
        description: req.description,
        is_pinned: req.is_pinned.unwrap_or(false),
    };
    db.create_saved_snippet(&new_snip).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn update_saved_snippet(
    db: State<'_, DatabaseService>,
    req: UpdateSnippetRequest,
) -> Result<SavedSnippet, AppErrorDto> {
    let update = UpdateSavedSnippet {
        id: req.id,
        title: req.title,
        trigger_prefix: req.trigger_prefix,
        content: req.content,
        syntax: req.syntax,
        description: req.description,
        is_pinned: req.is_pinned.unwrap_or(false),
    };
    db.update_saved_snippet(&update).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn delete_saved_snippet(
    db: State<'_, DatabaseService>,
    req: IdRequest,
) -> Result<bool, AppErrorDto> {
    db.delete_saved_snippet(req.id).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn list_saved_snippets(
    db: State<'_, DatabaseService>,
) -> Result<Vec<SavedSnippet>, AppErrorDto> {
    db.list_saved_snippets().map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn create_collection(
    db: State<'_, DatabaseService>,
    req: CreateCollectionRequest,
) -> Result<Collection, AppErrorDto> {
    let new_col = NewCollection {
        slug: req.slug,
        name: req.name,
        icon: req.icon,
        color: req.color,
        sort_order: req.sort_order,
    };
    db.create_collection(&new_col).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn delete_collection(
    db: State<'_, DatabaseService>,
    req: IdRequest,
) -> Result<bool, AppErrorDto> {
    db.delete_collection(req.id).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn list_collections(
    db: State<'_, DatabaseService>,
) -> Result<Vec<Collection>, AppErrorDto> {
    db.list_collections().map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn assign_item_collection(
    db: State<'_, DatabaseService>,
    req: AssignCollectionRequest,
) -> Result<(), AppErrorDto> {
    db.assign_item_collection(req.item_id, req.collection_id)
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn remove_item_collection(
    db: State<'_, DatabaseService>,
    req: AssignCollectionRequest,
) -> Result<(), AppErrorDto> {
    db.remove_item_collection(req.item_id, req.collection_id)
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn get_item_collections(
    db: State<'_, DatabaseService>,
    req: IdRequest,
) -> Result<Vec<Collection>, AppErrorDto> {
    db.get_item_collections(req.id).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn create_tag(
    db: State<'_, DatabaseService>,
    req: CreateTagRequest,
) -> Result<Tag, AppErrorDto> {
    let new_tag = NewTag {
        name: req.name,
        color: req.color,
    };
    db.create_tag(&new_tag).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn delete_tag(
    db: State<'_, DatabaseService>,
    req: IdRequest,
) -> Result<bool, AppErrorDto> {
    db.delete_tag(req.id).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn list_tags(
    db: State<'_, DatabaseService>,
) -> Result<Vec<Tag>, AppErrorDto> {
    db.list_tags().map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn tag_item(
    db: State<'_, DatabaseService>,
    req: TagItemRequest,
) -> Result<(), AppErrorDto> {
    db.tag_item(req.item_id, req.tag_id)
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn untag_item(
    db: State<'_, DatabaseService>,
    req: TagItemRequest,
) -> Result<(), AppErrorDto> {
    db.untag_item(req.item_id, req.tag_id)
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn get_item_tags(
    db: State<'_, DatabaseService>,
    req: IdRequest,
) -> Result<Vec<Tag>, AppErrorDto> {
    db.get_item_tags(req.id).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn save_paste_sequence(
    db: State<'_, DatabaseService>,
    req: SavePasteSequenceRequest,
) -> Result<PasteSequence, AppErrorDto> {
    let new_seq = NewPasteSequence {
        name: req.name,
        description: req.description,
        loop_count: req.loop_count,
        items: req
            .items
            .into_iter()
            .map(|i| NewPasteSequenceItem {
                item_id: i.item_id,
                static_text: i.static_text,
                sequence_order: i.sequence_order,
                delay_ms: i.delay_ms,
            })
            .collect(),
    };
    db.create_paste_sequence(&new_seq).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn get_paste_sequence(
    db: State<'_, DatabaseService>,
    req: IdRequest,
) -> Result<Option<PasteSequence>, AppErrorDto> {
    db.get_paste_sequence(req.id).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn list_paste_sequences(
    db: State<'_, DatabaseService>,
) -> Result<Vec<PasteSequence>, AppErrorDto> {
    db.list_paste_sequences().map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn delete_paste_sequence(
    db: State<'_, DatabaseService>,
    req: IdRequest,
) -> Result<bool, AppErrorDto> {
    db.delete_paste_sequence(req.id).map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn export_vault_data(
    db: State<'_, DatabaseService>,
) -> Result<VaultArchiveDto, AppErrorDto> {
    db.export_vault_archive().map_err(AppErrorDto::from)
}

#[tauri::command]
pub fn import_vault_data(
    db: State<'_, DatabaseService>,
    req: ImportVaultRequest,
) -> Result<ImportResultDto, AppErrorDto> {
    // Validate JSON string
    if req.archive_json.trim().is_empty() {
        return Err(AppErrorDto {
            code: "VALIDATION_ERROR".to_string(),
            message: "Import payload cannot be empty".to_string(),
        });
    }

    let archive: VaultArchiveDto = serde_json::from_str(&req.archive_json).map_err(|e| {
        AppErrorDto {
            code: "INVALID_ARCHIVE".to_string(),
            message: format!("Failed to parse vault archive JSON: {}", e),
        }
    })?;

    let mode = req.mode.as_deref().unwrap_or("merge");
    db.import_vault_archive(&archive, mode).map_err(AppErrorDto::from)
}



