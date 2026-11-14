export type ClipboardContentType = "text" | "code" | "image" | "link";

export type SortOrder = "newest" | "oldest" | "most_used";

export type FilterCategory = "all" | "text" | "code" | "image" | "link";

export type SidebarView = "history" | "pinned" | "snippets" | "sequences" | "about" | "privacy";

export type DateRangeFilter = "all" | "today" | "week" | "month";

export type UIStateMode = "normal" | "loading" | "error" | "empty";

export type PasteMode = "synthetic" | "stepped_clipboard";

export interface SequentialStatus {
  isActive: boolean;
  currentIndex: number;
  totalItems: number;
  remainingItems: number;
  currentItemId?: string;
  currentItemPreview?: string;
  currentItemType?: string;
  pasteMode: "synthetic" | "stepped_clipboard" | "none";
  isCompleted: boolean;
  message: string;
  accessibilityGranted: boolean;
}

export interface SequentialItemPayload {
  id: number;
  content_type: string;
  text_content: string;
  media_path?: string;
}

export interface DesktopSettings {
  global_shortcut: string;
  launch_at_login: boolean;
  auto_hide_on_blur: boolean;
  compact_density: boolean;
  theme: string;
}

export type WindowMode = "quick_panel" | "workspace";

export interface PrivacySettings {
  pause_monitoring: boolean;
  skip_confidential_heuristics: boolean;
  app_exclusions: string[];
  max_capacity: number;
  retention_days: number;
  platform_supports_app_identification: boolean;
}

export interface PrivacyDiagnostics {
  total_items_count: number;
  pinned_items_count: number;
  media_items_count: number;
  db_size_bytes: number;
  media_dir_size_bytes: number;
  app_data_dir: string;
  db_path: string;
  media_dir: string;
  platform: string;
  is_monitoring_paused: boolean;
  is_monitoring_running: boolean;
  exclusions_count: number;
  confidential_heuristics_active: boolean;
  memory_rss_bytes: number;
}

export interface ClipboardItem {
  id: string;
  contentType: ClipboardContentType;
  content: string;
  htmlContent?: string;
  previewText?: string;
  mediaPath?: string;
  thumbnailUrl?: string;
  dimensions?: { width: number; height: number };
  byteSize?: number;
  sourceApp?: string;
  capturedAt: number; // Unix timestamp in ms
  copyCount: number;
  pinned: boolean;
  charCount?: number;
  lineCount?: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  created_at: number;
}

export interface Collection {
  id: number;
  slug: string;
  name: string;
  icon?: string;
  color?: string;
  sort_order: number;
  created_at: number;
}

export interface SavedSnippet {
  id: number;
  title: string;
  trigger_prefix?: string;
  content: string;
  syntax: string;
  description?: string;
  is_pinned: boolean;
  created_at: number;
  updated_at: number;
}

export interface PasteSequence {
  id: number;
  name: string;
  description?: string;
  loop_count: number;
  created_at: number;
  updated_at: number;
  items: PasteSequenceItem[];
}

export interface PasteSequenceItem {
  id: number;
  sequence_id: number;
  item_id?: number;
  static_text?: string;
  sequence_order: number;
  delay_ms: number;
}

export interface VaultArchive {
  version: number;
  app_version: string;
  exported_at: number;
  items: Array<{
    content_hash: string;
    format_type: string;
    plain_text?: string;
    html_content?: string;
    detected_lang?: string;
    is_pinned: boolean;
    is_favorite: boolean;
    created_at: number;
  }>;
  snippets: SavedSnippet[];
  collections: Collection[];
  tags: Tag[];
  sequences: PasteSequence[];
}

export interface ImportResult {
  items_imported: number;
  snippets_imported: number;
  collections_imported: number;
  tags_imported: number;
  sequences_imported: number;
}

export type TextTransformType =
  | "trim"
  | "uppercase"
  | "lowercase"
  | "title_case"
  | "camel_case"
  | "snake_case"
  | "remove_duplicate_lines"
  | "normalize_line_endings";
