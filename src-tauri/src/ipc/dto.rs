use serde::{Deserialize, Serialize};
use crate::db::models::{ItemFilter, SortOrder};

#[derive(Debug, Clone, Deserialize)]
pub struct GetItemsRequest {
    pub filter: Option<ItemFilter>,
    pub sort: Option<SortOrder>,
    pub offset: Option<u32>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchItemsRequest {
    pub query: String,
    pub filter: Option<ItemFilter>,
    pub offset: Option<u32>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateItemRequest {
    pub id: i64,
    pub new_content: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IdRequest {
    pub id: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClearHistoryRequest {
    pub keep_pinned: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BulkDeleteRequest {
    pub ids: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RetentionCleanupRequest {
    pub max_items: Option<u64>,
    pub retention_days: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RetentionResultDto {
    pub deleted_items: u64,
    pub deleted_media: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AddItemRequest {
    pub format_type: String,
    pub content: String,
    pub source_app: Option<String>,
    pub media_data_base64: Option<String>,
    pub media_mime: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SystemStatus {
    pub app_name: String,
    pub version: String,
    pub status: String,
    pub timestamp_millis: u64,
    pub schema_version: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetMonitoringPausedRequest {
    pub paused: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CopyToClipboardRequest {
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CopyItemImageRequest {
    pub id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MediaDataDto {
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClipboardStatusDto {
    pub is_running: bool,
    pub is_paused: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StartSequentialRequest {
    pub items: Vec<crate::paste::SequentialItemPayload>,
    pub mode: Option<crate::paste::PasteMode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccessibilityStatusDto {
    pub is_trusted: bool,
    pub platform: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DesktopSettingsDto {
    pub global_shortcut: String,
    pub launch_at_login: bool,
    pub auto_hide_on_blur: bool,
    pub compact_density: bool,
    pub theme: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetWindowModeRequest {
    pub mode: String, // "quick_panel" | "workspace"
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PrivacySettingsDto {
    pub pause_monitoring: bool,
    pub skip_confidential_heuristics: bool,
    pub app_exclusions: Vec<String>,
    pub max_capacity: u64,
    pub retention_days: u64,
    pub platform_supports_app_identification: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePrivacySettingsRequest {
    pub pause_monitoring: Option<bool>,
    pub skip_confidential_heuristics: Option<bool>,
    pub app_exclusions: Option<Vec<String>>,
    pub max_capacity: Option<u64>,
    pub retention_days: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PrivacyDiagnosticsDto {
    pub total_items_count: u64,
    pub pinned_items_count: u64,
    pub media_items_count: u64,
    pub db_size_bytes: u64,
    pub media_dir_size_bytes: u64,
    pub app_data_dir: String,
    pub db_path: String,
    pub media_dir: String,
    pub platform: String,
    pub is_monitoring_paused: bool,
    pub is_monitoring_running: bool,
    pub exclusions_count: usize,
    pub confidential_heuristics_active: bool,
    pub memory_rss_bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSnippetRequest {
    pub title: String,
    pub trigger_prefix: Option<String>,
    pub content: String,
    pub syntax: Option<String>,
    pub description: Option<String>,
    pub is_pinned: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSnippetRequest {
    pub id: i64,
    pub title: String,
    pub trigger_prefix: Option<String>,
    pub content: String,
    pub syntax: Option<String>,
    pub description: Option<String>,
    pub is_pinned: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCollectionRequest {
    pub slug: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTagRequest {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TagItemRequest {
    pub item_id: i64,
    pub tag_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssignCollectionRequest {
    pub item_id: i64,
    pub collection_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SavePasteSequenceRequest {
    pub name: String,
    pub description: Option<String>,
    pub loop_count: Option<i32>,
    pub items: Vec<SavePasteSequenceItemDto>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SavePasteSequenceItemDto {
    pub item_id: Option<i64>,
    pub static_text: Option<String>,
    pub sequence_order: i32,
    pub delay_ms: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportVaultRequest {
    pub archive_json: String,
    pub mode: Option<String>, // "merge" | "replace"
}




