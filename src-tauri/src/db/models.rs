use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;

/// Supported clipboard content format categories.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FormatType {
    Text,
    Code,
    RichText,
    Image,
    Link,
    FileUri,
}

impl FormatType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Code => "code",
            Self::RichText => "rich_text",
            Self::Image => "image",
            Self::Link => "link",
            Self::FileUri => "file_uri",
        }
    }

    pub fn from_str_lossy(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "code" => Self::Code,
            "rich_text" | "richtext" => Self::RichText,
            "image" => Self::Image,
            "link" | "url" => Self::Link,
            "file_uri" | "file" => Self::FileUri,
            _ => Self::Text,
        }
    }
}

impl fmt::Display for FormatType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Typed representation of a persisted clipboard item row.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub content_hash: String,
    pub format_type: FormatType,
    pub plain_text: Option<String>,
    pub html_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtf_content: Option<Vec<u8>>,
    pub media_path: Option<String>,
    pub media_mime: Option<String>,
    pub media_width: Option<u32>,
    pub media_height: Option<u32>,
    pub media_size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_thumbnail: Option<Vec<u8>>,
    pub source_app_bundle: Option<String>,
    pub source_app_name: Option<String>,
    pub detected_lang: Option<String>,
    pub is_pinned: bool,
    pub is_favorite: bool,
    pub copy_count: u32,
    pub created_at: i64,
    pub last_copied_at: i64,
    pub last_pasted_at: Option<i64>,
}

/// Payload input struct for inserting or recording a clipboard entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewClipboardItem {
    pub content_hash: String,
    pub format_type: FormatType,
    pub plain_text: Option<String>,
    pub html_content: Option<String>,
    pub rtf_content: Option<Vec<u8>>,
    pub media_path: Option<String>,
    pub media_mime: Option<String>,
    pub media_width: Option<u32>,
    pub media_height: Option<u32>,
    pub media_size_bytes: Option<u64>,
    pub media_thumbnail: Option<Vec<u8>>,
    pub source_app_bundle: Option<String>,
    pub source_app_name: Option<String>,
    pub detected_lang: Option<String>,
    pub is_pinned: bool,
    pub is_favorite: bool,
    pub timestamp_millis: i64,
}

impl NewClipboardItem {
    /// Computes SHA-256 for plain text or code payload per DATABASE.md §4.1.
    pub fn compute_text_hash(text: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(text.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Computes SHA-256 for rich text payload per DATABASE.md §4.1.
    pub fn compute_rich_text_hash(plain_text: &str, html_content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(plain_text.as_bytes());
        hasher.update(b":::");
        hasher.update(html_content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Computes SHA-256 for binary image payload per DATABASE.md §4.1.
    pub fn compute_binary_hash(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    }

    /// Helper to construct a new plain text or code clipboard entry.
    pub fn new_text(
        text: String,
        is_code: bool,
        detected_lang: Option<String>,
        source_app_name: Option<String>,
        source_app_bundle: Option<String>,
        timestamp_millis: i64,
    ) -> Self {
        let content_hash = Self::compute_text_hash(&text);
        Self {
            content_hash,
            format_type: if is_code { FormatType::Code } else { FormatType::Text },
            plain_text: Some(text),
            html_content: None,
            rtf_content: None,
            media_path: None,
            media_mime: None,
            media_width: None,
            media_height: None,
            media_size_bytes: None,
            media_thumbnail: None,
            source_app_bundle,
            source_app_name,
            detected_lang,
            is_pinned: false,
            is_favorite: false,
            timestamp_millis,
        }
    }

    /// Helper to construct a new image clipboard entry.
    pub fn new_image(params: NewImageParams<'_>) -> Self {
        let content_hash = Self::compute_binary_hash(params.raw_bytes);
        Self {
            content_hash,
            format_type: FormatType::Image,
            plain_text: None,
            html_content: None,
            rtf_content: None,
            media_path: Some(params.media_path),
            media_mime: Some(params.media_mime),
            media_width: Some(params.width),
            media_height: Some(params.height),
            media_size_bytes: Some(params.raw_bytes.len() as u64),
            media_thumbnail: params.thumbnail_blob,
            source_app_bundle: params.source_app_bundle,
            source_app_name: params.source_app_name,
            detected_lang: None,
            is_pinned: false,
            is_favorite: false,
            timestamp_millis: params.timestamp_millis,
        }
    }
}

/// Parameter carrier struct for constructing new image clipboard entries.
#[derive(Debug, Clone)]
pub struct NewImageParams<'a> {
    pub raw_bytes: &'a [u8],
    pub media_path: String,
    pub media_mime: String,
    pub width: u32,
    pub height: u32,
    pub thumbnail_blob: Option<Vec<u8>>,
    pub source_app_name: Option<String>,
    pub source_app_bundle: Option<String>,
    pub timestamp_millis: i64,
}

/// Filter criteria for querying clipboard history.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ItemFilter {
    pub format_type: Option<FormatType>,
    pub is_pinned: Option<bool>,
    pub is_favorite: Option<bool>,
    pub start_timestamp_millis: Option<i64>,
    pub end_timestamp_millis: Option<i64>,
    pub collection_id: Option<i64>,
    pub tag_id: Option<i64>,
}

/// Result summary of retention auto-pruning.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RetentionResult {
    pub deleted_items: u64,
    pub deleted_media: u64,
}

/// Sorting order for clipboard items.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    #[default]
    Newest,
    Oldest,
    MostUsed,
}

/// Pagination parameter with safe bounds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaginationParams {
    pub offset: u32,
    pub limit: u32,
}

impl Default for PaginationParams {
    fn default() -> Self {
        Self {
            offset: 0,
            limit: 50,
        }
    }
}

impl PaginationParams {
    pub fn new(offset: u32, limit: u32) -> Self {
        let safe_limit = limit.clamp(1, 200);
        Self {
            offset,
            limit: safe_limit,
        }
    }
}

/// Generic paginated envelope.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaginatedResult<T> {
    pub items: Vec<T>,
    pub total: u32,
    pub offset: u32,
    pub limit: u32,
    pub has_more: bool,
}

/// Key-value setting record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SettingRecord {
    pub key: String,
    pub value: String,
    pub updated_at: i64,
}

/// Custom tag record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub created_at: i64,
}

/// Input payload to create a new tag.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewTag {
    pub name: String,
    pub color: Option<String>,
}

/// Organizational collection (folder).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Collection {
    pub id: i64,
    pub slug: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: i32,
    pub created_at: i64,
}

/// Input payload to create a new collection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewCollection {
    pub slug: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<i32>,
}

/// Saved permanent snippet or text template.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SavedSnippet {
    pub id: i64,
    pub title: String,
    pub trigger_prefix: Option<String>,
    pub content: String,
    pub syntax: String,
    pub description: Option<String>,
    pub is_pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Input payload to create a saved snippet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewSavedSnippet {
    pub title: String,
    pub trigger_prefix: Option<String>,
    pub content: String,
    pub syntax: Option<String>,
    pub description: Option<String>,
    pub is_pinned: bool,
}

/// Input payload to update an existing saved snippet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateSavedSnippet {
    pub id: i64,
    pub title: String,
    pub trigger_prefix: Option<String>,
    pub content: String,
    pub syntax: Option<String>,
    pub description: Option<String>,
    pub is_pinned: bool,
}

/// Reusable ordered paste sequence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PasteSequence {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub loop_count: i32,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub items: Vec<PasteSequenceItem>,
}

/// Item within an ordered paste sequence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PasteSequenceItem {
    pub id: i64,
    pub sequence_id: i64,
    pub item_id: Option<i64>,
    pub static_text: Option<String>,
    pub sequence_order: i32,
    pub delay_ms: i32,
}

/// Input payload to create a new paste sequence with items.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewPasteSequence {
    pub name: String,
    pub description: Option<String>,
    pub loop_count: Option<i32>,
    pub items: Vec<NewPasteSequenceItem>,
}

/// Input payload for an item within a new paste sequence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewPasteSequenceItem {
    pub item_id: Option<i64>,
    pub static_text: Option<String>,
    pub sequence_order: i32,
    pub delay_ms: Option<i32>,
}

/// Schema-versioned archive container for vault export and import.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VaultArchiveDto {
    pub version: u32,
    pub app_version: String,
    pub exported_at: i64,
    pub items: Vec<ClipboardItemExportDto>,
    pub snippets: Vec<SavedSnippet>,
    pub collections: Vec<Collection>,
    pub tags: Vec<Tag>,
    pub sequences: Vec<PasteSequence>,
}

/// Export DTO for a clipboard item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClipboardItemExportDto {
    pub content_hash: String,
    pub format_type: FormatType,
    pub plain_text: Option<String>,
    pub html_content: Option<String>,
    pub detected_lang: Option<String>,
    pub is_pinned: bool,
    pub is_favorite: bool,
    pub created_at: i64,
}

/// Options when importing a vault archive.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImportOptionsDto {
    /// "merge" or "replace"
    pub mode: String,
}

/// Result summary of an archive import.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImportResultDto {
    pub items_imported: u32,
    pub snippets_imported: u32,
    pub collections_imported: u32,
    pub tags_imported: u32,
    pub sequences_imported: u32,
}
