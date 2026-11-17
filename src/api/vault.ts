import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ClipboardContentType,
  ClipboardItem,
  Collection,
  DateRangeFilter,
  DesktopSettings,
  FilterCategory,
  ImportResult,
  PasteMode,
  PasteSequence,
  PrivacyDiagnostics,
  PrivacySettings,
  SavedSnippet,
  SequentialItemPayload,
  SequentialStatus,
  SortOrder,
  Tag,
  VaultArchive,
  WindowMode,
} from "../types/clipboard.ts";

export interface SystemStatusDto {
  app_name: string;
  version: string;
  status: string;
  timestamp_millis: number;
  schema_version: number;
}

export interface BackendItemDto {
  id: number;
  content_hash: string;
  format_type: string;
  plain_text: string | null;
  html_content: string | null;
  media_path: string | null;
  media_mime: string | null;
  media_width: number | null;
  media_height: number | null;
  media_size_bytes: number | null;
  media_thumbnail: number[] | null;
  source_app_bundle: string | null;
  source_app_name: string | null;
  detected_lang: string | null;
  is_pinned: boolean;
  is_favorite: boolean;
  copy_count: number;
  created_at: number;
  last_copied_at: number;
  last_pasted_at: number | null;
}

export interface PaginatedResultDto<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface AppErrorDto {
  code: string;
  message: string;
}

export interface RetentionResultDto {
  deleted_items: number;
  deleted_media: number;
}

export interface ItemFilterDto {
  format_type?: string;
  is_pinned?: boolean;
  is_favorite?: boolean;
  start_timestamp_millis?: number;
  end_timestamp_millis?: number;
}

/** Check if running inside genuine Tauri desktop webview runtime */
export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Calculates timestamp bounds for date-range filtering */
export function calculateDateRange(range: DateRangeFilter): {
  start?: number;
  end?: number;
} {
  const now = Date.now();
  if (range === "today") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return { start: todayStart.getTime(), end: now };
  }
  if (range === "week") {
    return { start: now - 7 * 86_400_000, end: now };
  }
  if (range === "month") {
    return { start: now - 30 * 86_400_000, end: now };
  }
  return {};
}

/** Converts a byte array to base64 string safely without call stack overflow on large buffers */
export function bytesToBase64(bytes: number[]): string {
  const CHUNK_SIZE = 0x8000; // 32768
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function isUrlText(text?: string | null): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("ftp://") ||
    lower.startsWith("mailto:")
  ) {
    return true;
  }
  if (lower.startsWith("www.") && lower.length > 4 && lower.slice(4).includes(".")) {
    return true;
  }
  return false;
}

/** Converts backend DTO into typed frontend ClipboardItem */
export function dtoToClipboardItem(dto: BackendItemDto): ClipboardItem {
  let contentType: ClipboardContentType = "text";
  if (dto.format_type === "code") contentType = "code";
  else if (dto.format_type === "image") contentType = "image";
  else if (dto.format_type === "link" || isUrlText(dto.plain_text)) contentType = "link";

  let thumbnailUrl: string | undefined;
  if (dto.media_thumbnail && dto.media_thumbnail.length > 0) {
    const mime = dto.media_mime || "image/png";
    thumbnailUrl = `data:${mime};base64,${bytesToBase64(dto.media_thumbnail)}`;
  }

  const defaultImageName = dto.media_path ? dto.media_path.split("/").pop() || "image.png" : "Copied Image";
  const content = dto.plain_text || dto.html_content || (dto.format_type === "image" ? defaultImageName : "");
  const lines = content ? content.split("\n").length : undefined;

  return {
    id: String(dto.id),
    contentType,
    content,
    htmlContent: dto.html_content || undefined,
    previewText: dto.plain_text || (dto.format_type === "image" ? `Image (${dto.media_mime || "PNG"})` : ""),
    mediaPath: dto.media_path || undefined,
    thumbnailUrl,
    dimensions:
      dto.media_width && dto.media_height
        ? { width: dto.media_width, height: dto.media_height }
        : undefined,
    byteSize: dto.media_size_bytes || (dto.plain_text ? dto.plain_text.length : undefined),
    sourceApp: dto.source_app_name || undefined,
    capturedAt: dto.last_copied_at,
    copyCount: dto.copy_count,
    pinned: dto.is_pinned,
    charCount: dto.plain_text?.length,
    lineCount: lines,
  };
}

/** Fetches backend health status and active SQLite schema version */
export async function getSystemStatus(): Promise<SystemStatusDto> {
  if (!isTauriEnvironment()) {
    return {
      app_name: "CopyVault (Web Simulator)",
      version: "0.1.0",
      status: "healthy",
      timestamp_millis: Date.now(),
      schema_version: 2,
    };
  }
  return await invoke<SystemStatusDto>("get_system_status");
}

/** Queries paginated clipboard items from SQLite database with filters and sorting */
export async function getRecentItems(
  category?: FilterCategory,
  sort: SortOrder = "newest",
  offset = 0,
  limit = 50,
  dateRange?: DateRangeFilter,
  isPinned?: boolean
): Promise<PaginatedResultDto<BackendItemDto>> {
  if (!isTauriEnvironment()) {
    return { items: [], total: 0, offset, limit, has_more: false };
  }

  const { start, end } = dateRange ? calculateDateRange(dateRange) : {};
  const filter: ItemFilterDto = {
    format_type: category && category !== "all" ? category : undefined,
    is_pinned: isPinned,
    start_timestamp_millis: start,
    end_timestamp_millis: end,
  };

  return await invoke<PaginatedResultDto<BackendItemDto>>("get_recent_items", {
    req: { filter, sort, offset, limit },
  });
}

/** Executes BM25-ranked full-text search against SQLite FTS5 table with filters */
export async function searchItems(
  query: string,
  category?: FilterCategory,
  limit = 50,
  offset = 0,
  dateRange?: DateRangeFilter,
  isPinned?: boolean
): Promise<PaginatedResultDto<BackendItemDto>> {
  if (!isTauriEnvironment()) {
    return { items: [], total: 0, offset, limit, has_more: false };
  }

  const { start, end } = dateRange ? calculateDateRange(dateRange) : {};
  const filter: ItemFilterDto = {
    format_type: category && category !== "all" ? category : undefined,
    is_pinned: isPinned,
    start_timestamp_millis: start,
    end_timestamp_millis: end,
  };

  return await invoke<PaginatedResultDto<BackendItemDto>>("search_items", {
    req: { query, filter, limit, offset },
  });
}

/** Updates text content in SQLite and synchronizes FTS5 index */
export async function updateItemContent(
  id: number,
  newContent: string
): Promise<BackendItemDto> {
  return await invoke<BackendItemDto>("update_item_content", {
    req: { id, new_content: newContent },
  });
}

/** Toggles pinned status */
export async function togglePinItem(id: number): Promise<boolean> {
  return await invoke<boolean>("toggle_pin_item", { req: { id } });
}

/** Toggles favorite status */
export async function toggleFavoriteItem(id: number): Promise<boolean> {
  return await invoke<boolean>("toggle_favorite_item", { req: { id } });
}

/** Permanently deletes a single item from SQLite database */
export async function deleteItem(id: number): Promise<void> {
  return await invoke<void>("delete_item", { req: { id } });
}

/** Bulk deletes items by IDs with transactional media cleanup */
export async function bulkDeleteItems(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  return await invoke<number>("bulk_delete_items", { req: { ids } });
}

/** Clears clipboard history */
export async function clearHistory(keepPinned: boolean): Promise<number> {
  return await invoke<number>("clear_history", { req: { keep_pinned: keepPinned } });
}

/** Triggers retention cleanup pruning unpinned items beyond age and capacity */
export async function runRetentionCleanup(
  maxItems?: number,
  retentionDays?: number
): Promise<RetentionResultDto> {
  return await invoke<RetentionResultDto>("run_retention_cleanup", {
    req: { max_items: maxItems, retention_days: retentionDays },
  });
}

/** Manually adds a clipboard item for test verification or user creation */
export async function addItem(
  formatType: string,
  content: string,
  sourceApp?: string,
  mediaDataBase64?: string,
  mediaMime?: string,
  width?: number,
  height?: number
): Promise<BackendItemDto> {
  return await invoke<BackendItemDto>("add_item", {
    req: {
      format_type: formatType,
      content,
      source_app: sourceApp,
      media_data_base64: mediaDataBase64,
      media_mime: mediaMime,
      width,
      height,
    },
  });
}

export interface ClipboardStatusDto {
  is_running: boolean;
  is_paused: boolean;
}

/** Triggers a single synchronous capture slice from the OS pasteboard */
export async function captureClipboardSlice(): Promise<BackendItemDto | null> {
  if (!isTauriEnvironment()) {
    return null;
  }
  return await invoke<BackendItemDto | null>("capture_clipboard_slice");
}

/** Toggles or sets clipboard monitoring pause state */
export async function setClipboardPaused(paused: boolean): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }
  await invoke<void>("set_clipboard_paused", { req: { paused } });
}

/** Queries current clipboard monitoring status */
export async function getClipboardStatus(): Promise<ClipboardStatusDto> {
  if (!isTauriEnvironment()) {
    return { is_running: false, is_paused: false };
  }
  return await invoke<ClipboardStatusDto>("get_clipboard_status");
}

/** Writes text to the OS clipboard via the service with echo loop suppression */
export async function copyToClipboard(text: string): Promise<void> {
  if (!isTauriEnvironment()) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    return;
  }
  await invoke<void>("copy_to_clipboard", { req: { text } });
}

/** Writes an image item directly to the OS clipboard */
export async function copyImageToClipboard(id: string, fallbackDataUrl?: string): Promise<void> {
  const numericId = parseInt(id, 10);
  if (isTauriEnvironment() && !Number.isNaN(numericId)) {
    await invoke<void>("copy_item_image_to_clipboard", { req: { id: numericId } });
    return;
  }

  // Browser preview mode fallback: write Blob to navigator.clipboard
  if (fallbackDataUrl && typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.write) {
    try {
      const res = await fetch(fallbackDataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new window.ClipboardItem({ [blob.type]: blob }),
      ]);
      return;
    } catch (err) {
      console.warn("Could not write image blob to browser clipboard:", err);
    }
  }
}

/** Fetches full media bytes for high-resolution preview modal */
export async function getMediaData(id: string): Promise<{ mime_type: string; data_url: string }> {
  const numericId = parseInt(id, 10);
  if (isTauriEnvironment() && !Number.isNaN(numericId)) {
    const res = await invoke<{ mime_type: string; bytes: number[] }>("get_media_data", {
      req: { id: numericId },
    });
    const mime = res.mime_type || "image/png";
    return {
      mime_type: mime,
      data_url: `data:${mime};base64,${bytesToBase64(res.bytes)}`,
    };
  }

  return { mime_type: "image/png", data_url: "" };
}

/** Starts background clipboard monitoring */
export async function startMonitoring(): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke<void>("start_monitoring_command");
}

/** Stops background clipboard monitoring */
export async function stopMonitoring(): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke<void>("stop_monitoring_command");
}

/** Subscribes to live clipboard capture events emitted by the backend */
export async function listenClipboardCaptured(
  callback: (item: BackendItemDto) => void
): Promise<() => void> {
  if (!isTauriEnvironment()) {
    return () => {};
  }
  const unlisten = await listen<BackendItemDto>("clipboard-item-captured", (event) => {
    callback(event.payload);
  });
  return unlisten;
}

export interface BackendSequentialStatusDto {
  is_active: boolean;
  current_index: number;
  total_items: number;
  remaining_items: number;
  current_item_id: number | null;
  current_item_preview: string | null;
  current_item_type: string | null;
  paste_mode: string;
  is_completed: boolean;
  message: string;
  accessibility_granted: boolean;
}

export function dtoToSequentialStatus(dto: BackendSequentialStatusDto): SequentialStatus {
  return {
    isActive: dto.is_active,
    currentIndex: dto.current_index,
    totalItems: dto.total_items,
    remainingItems: dto.remaining_items,
    currentItemId: dto.current_item_id ? String(dto.current_item_id) : undefined,
    currentItemPreview: dto.current_item_preview || undefined,
    currentItemType: dto.current_item_type || undefined,
    pasteMode: (dto.paste_mode as "synthetic" | "stepped_clipboard" | "none") || "none",
    isCompleted: dto.is_completed,
    message: dto.message,
    accessibilityGranted: dto.accessibility_granted,
  };
}

let simulatedQueue: SequentialItemPayload[] = [];
let simulatedIndex = 0;
let simulatedCompleted = false;

/** Checks OS accessibility permissions for synthetic keystrokes */
export async function checkPasteAccessibility(): Promise<{ is_trusted: boolean; platform: string }> {
  if (!isTauriEnvironment()) {
    return { is_trusted: true, platform: "web_simulator" };
  }
  return await invoke<{ is_trusted: boolean; platform: string }>("check_paste_accessibility");
}

/** Requests OS accessibility authorization via native prompt or settings deep link */
export async function requestPasteAccessibility(): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke<void>("request_paste_accessibility");
}

/** Initializes a sequential paste session with ordered items and selected mode */
export async function startSequentialPaste(
  items: SequentialItemPayload[],
  mode: PasteMode = "synthetic"
): Promise<SequentialStatus> {
  if (!isTauriEnvironment()) {
    simulatedQueue = [...items];
    simulatedIndex = 0;
    simulatedCompleted = false;
    const first = items[0];
    return {
      isActive: true,
      currentIndex: 0,
      totalItems: items.length,
      remainingItems: items.length,
      currentItemId: first ? String(first.id) : undefined,
      currentItemPreview: first?.text_content.slice(0, 48),
      currentItemType: first?.content_type,
      pasteMode: mode,
      isCompleted: false,
      message: `Queue item 1 of ${items.length} loaded.`,
      accessibilityGranted: true,
    };
  }

  const res = await invoke<BackendSequentialStatusDto>("start_sequential_paste", {
    req: { items, mode },
  });
  return dtoToSequentialStatus(res);
}

/** Pastes or advances to the next item in the sequential queue */
export async function pasteNextSequential(): Promise<SequentialStatus> {
  if (!isTauriEnvironment()) {
    if (simulatedCompleted || simulatedIndex >= simulatedQueue.length) {
      return {
        isActive: false,
        currentIndex: simulatedIndex,
        totalItems: simulatedQueue.length,
        remainingItems: 0,
        pasteMode: "none",
        isCompleted: true,
        message: "Sequential paste queue completed.",
        accessibilityGranted: true,
      };
    }

    simulatedIndex += 1;
    const isCompleted = simulatedIndex >= simulatedQueue.length;
    const current = simulatedQueue[simulatedIndex];

    return {
      isActive: !isCompleted,
      currentIndex: simulatedIndex,
      totalItems: simulatedQueue.length,
      remainingItems: Math.max(0, simulatedQueue.length - simulatedIndex),
      currentItemId: current ? String(current.id) : undefined,
      currentItemPreview: current?.text_content.slice(0, 48),
      currentItemType: current?.content_type,
      pasteMode: "synthetic",
      isCompleted,
      message: isCompleted
        ? "Sequential paste queue completed."
        : `Queue item ${simulatedIndex + 1} of ${simulatedQueue.length} ready.`,
      accessibilityGranted: true,
    };
  }

  const res = await invoke<BackendSequentialStatusDto>("paste_next_sequential");
  return dtoToSequentialStatus(res);
}

/** Cancels any active sequential paste session */
export async function cancelSequentialPaste(): Promise<SequentialStatus> {
  if (!isTauriEnvironment()) {
    simulatedQueue = [];
    simulatedIndex = 0;
    simulatedCompleted = false;
    return {
      isActive: false,
      currentIndex: 0,
      totalItems: 0,
      remainingItems: 0,
      pasteMode: "none",
      isCompleted: false,
      message: "Sequential paste session canceled.",
      accessibilityGranted: true,
    };
  }

  const res = await invoke<BackendSequentialStatusDto>("cancel_sequential_paste");
  return dtoToSequentialStatus(res);
}

/** Queries current status of any active sequential paste session */
export async function getSequentialStatus(): Promise<SequentialStatus> {
  if (!isTauriEnvironment()) {
    const isCompleted = simulatedCompleted || simulatedIndex >= simulatedQueue.length;
    return {
      isActive: simulatedQueue.length > 0 && !isCompleted,
      currentIndex: simulatedIndex,
      totalItems: simulatedQueue.length,
      remainingItems: Math.max(0, simulatedQueue.length - simulatedIndex),
      currentItemId: simulatedQueue[simulatedIndex] ? String(simulatedQueue[simulatedIndex].id) : undefined,
      currentItemPreview: simulatedQueue[simulatedIndex]?.text_content.slice(0, 48),
      currentItemType: simulatedQueue[simulatedIndex]?.content_type,
      pasteMode: simulatedQueue.length > 0 ? "synthetic" : "none",
      isCompleted,
      message: simulatedQueue.length > 0
        ? `Queue item ${simulatedIndex + 1} of ${simulatedQueue.length}`
        : "No active sequential paste queue.",
      accessibilityGranted: true,
    };
  }

  const res = await invoke<BackendSequentialStatusDto>("get_sequential_status");
  return dtoToSequentialStatus(res);
}

let simulatedDesktopSettings: DesktopSettings = {
  global_shortcut: "Cmd+Shift+V",
  launch_at_login: false,
  auto_hide_on_blur: true,
  compact_density: false,
  theme: "dark",
};

/** Fetches desktop integration settings (global hotkey, autostart, auto-hide) */
export async function getDesktopSettings(): Promise<DesktopSettings> {
  if (!isTauriEnvironment()) {
    return { ...simulatedDesktopSettings };
  }
  return await invoke<DesktopSettings>("get_desktop_settings");
}

/** Updates desktop integration settings */
export async function updateDesktopSettings(
  settings: DesktopSettings
): Promise<void> {
  if (!isTauriEnvironment()) {
    simulatedDesktopSettings = { ...settings };
    return;
  }
  await invoke("update_desktop_settings", { settings });
}

/** Hides the CopyVault quick panel window smoothly */
export async function hideQuickPanel(): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }
  await invoke("hide_quick_panel");
}

/** Toggles visibility of the quick panel window */
export async function toggleQuickPanel(): Promise<boolean> {
  if (!isTauriEnvironment()) {
    return true;
  }
  return await invoke<boolean>("toggle_quick_panel");
}

/** Adjusts window dimensions between quick panel (720x460) and full workspace (960x680) */
export async function setWindowMode(mode: WindowMode): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }
  await invoke("set_window_mode", { req: { mode } });
}

let simulatedPrivacySettings: PrivacySettings = {
  pause_monitoring: false,
  skip_confidential_heuristics: true,
  app_exclusions: ["1Password", "Bitwarden", "KeePassXC"],
  max_capacity: 1000,
  retention_days: 30,
  platform_supports_app_identification: true,
};

/** Fetches backend privacy and retention settings */
export async function getPrivacySettings(): Promise<PrivacySettings> {
  if (!isTauriEnvironment()) {
    return { ...simulatedPrivacySettings };
  }
  return await invoke<PrivacySettings>("get_privacy_settings");
}

/** Updates backend privacy and retention settings */
export async function updatePrivacySettings(
  req: Partial<PrivacySettings>
): Promise<PrivacySettings> {
  if (!isTauriEnvironment()) {
    simulatedPrivacySettings = {
      ...simulatedPrivacySettings,
      ...req,
    };
    return { ...simulatedPrivacySettings };
  }
  return await invoke<PrivacySettings>("update_privacy_settings", { req });
}

/** Fetches privacy-safe system diagnostics (never exposes copied text or image bytes) */
export async function getPrivacyDiagnostics(): Promise<PrivacyDiagnostics> {
  if (!isTauriEnvironment()) {
    return {
      total_items_count: 5,
      pinned_items_count: 1,
      media_items_count: 1,
      db_size_bytes: 49152,
      media_dir_size_bytes: 1048576,
      app_data_dir: "/Users/user/Library/Application Support/com.copyvault.app",
      db_path: "/Users/user/Library/Application Support/com.copyvault.app/copyvault.db",
      media_dir: "/Users/user/Library/Application Support/com.copyvault.app/media",
      platform: "darwin",
      is_monitoring_paused: simulatedPrivacySettings.pause_monitoring,
      is_monitoring_running: true,
      exclusions_count: simulatedPrivacySettings.app_exclusions.length,
      confidential_heuristics_active: simulatedPrivacySettings.skip_confidential_heuristics,
      memory_rss_bytes: 0,
    };
  }
  return await invoke<PrivacyDiagnostics>("get_privacy_diagnostics");
}

// ==========================================
// Phase 8: Saved Snippets, Collections & Sequences API
// ==========================================

let simulatedSnippets: SavedSnippet[] = [
  {
    id: 1,
    title: "Email Introduction",
    trigger_prefix: "!intro",
    content: "Hi {{name}},\n\nI hope this email finds you well. Reaching out regarding {{project}}.\n\nBest regards,\n{{sender}}",
    syntax: "text",
    description: "Standard client introduction email",
    is_pinned: true,
    created_at: Date.now() - 3600000,
    updated_at: Date.now() - 3600000,
  },
  {
    id: 2,
    title: "SQL Schema Template",
    trigger_prefix: "!table",
    content: "CREATE TABLE IF NOT EXISTS {{table_name}} (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    created_at INTEGER NOT NULL\n);",
    syntax: "sql",
    description: "Boilerplate table structure",
    is_pinned: false,
    created_at: Date.now() - 7200000,
    updated_at: Date.now() - 7200000,
  },
];

let simulatedCollections: Collection[] = [
  {
    id: 1,
    slug: "work",
    name: "Work & Projects",
    icon: "briefcase",
    color: "#6366f1",
    sort_order: 1,
    created_at: Date.now() - 86400000,
  },
  {
    id: 2,
    slug: "code",
    name: "Code Snippets",
    icon: "code",
    color: "#10b981",
    sort_order: 2,
    created_at: Date.now() - 86400000,
  },
];

let simulatedTags: Tag[] = [
  { id: 1, name: "Urgent", color: "#ef4444", created_at: Date.now() },
  { id: 2, name: "Reference", color: "#3b82f6", created_at: Date.now() },
];

let simulatedSequences: PasteSequence[] = [
  {
    id: 1,
    name: "Customer Onboarding Sequence",
    description: "Fills customer form: name, email, role",
    loop_count: 1,
    created_at: Date.now() - 100000,
    updated_at: Date.now() - 100000,
    items: [
      { id: 1, sequence_id: 1, static_text: "Alice Smith", sequence_order: 1, delay_ms: 100 },
      { id: 2, sequence_id: 1, static_text: "alice@example.com", sequence_order: 2, delay_ms: 50 },
    ],
  },
];

const simulatedItemCollections: Record<string, number[]> = {};
const simulatedItemTags: Record<string, number[]> = {};

/** Creates a permanent saved snippet */
export async function createSavedSnippet(req: {
  title: string;
  trigger_prefix?: string;
  content: string;
  syntax?: string;
  description?: string;
  is_pinned?: boolean;
}): Promise<SavedSnippet> {
  if (!isTauriEnvironment()) {
    const newSnip: SavedSnippet = {
      id: Date.now(),
      title: req.title,
      trigger_prefix: req.trigger_prefix,
      content: req.content,
      syntax: req.syntax || "text",
      description: req.description,
      is_pinned: req.is_pinned ?? false,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    simulatedSnippets.unshift(newSnip);
    return newSnip;
  }
  return await invoke<SavedSnippet>("create_saved_snippet", { req });
}

/** Updates an existing saved snippet */
export async function updateSavedSnippet(req: {
  id: number;
  title: string;
  trigger_prefix?: string;
  content: string;
  syntax?: string;
  description?: string;
  is_pinned?: boolean;
}): Promise<SavedSnippet> {
  if (!isTauriEnvironment()) {
    const idx = simulatedSnippets.findIndex((s) => s.id === req.id);
    if (idx !== -1) {
      simulatedSnippets[idx] = {
        ...simulatedSnippets[idx],
        ...req,
        syntax: req.syntax || simulatedSnippets[idx].syntax,
        is_pinned: req.is_pinned ?? simulatedSnippets[idx].is_pinned,
        updated_at: Date.now(),
      };
      return simulatedSnippets[idx];
    }
    throw new Error(`Snippet not found: ${req.id}`);
  }
  return await invoke<SavedSnippet>("update_saved_snippet", { req });
}

/** Deletes a saved snippet by ID */
export async function deleteSavedSnippet(id: number): Promise<boolean> {
  if (!isTauriEnvironment()) {
    simulatedSnippets = simulatedSnippets.filter((s) => s.id !== id);
    return true;
  }
  return await invoke<boolean>("delete_saved_snippet", { req: { id } });
}

/** Lists all saved permanent snippets */
export async function listSavedSnippets(): Promise<SavedSnippet[]> {
  if (!isTauriEnvironment()) {
    return [...simulatedSnippets];
  }
  return await invoke<SavedSnippet[]>("list_saved_snippets");
}

/** Creates or updates a collection folder */
export async function createCollection(req: {
  slug: string;
  name: string;
  icon?: string;
  color?: string;
  sort_order?: number;
}): Promise<Collection> {
  if (!isTauriEnvironment()) {
    const newCol: Collection = {
      id: Date.now(),
      slug: req.slug,
      name: req.name,
      icon: req.icon,
      color: req.color,
      sort_order: req.sort_order ?? 0,
      created_at: Date.now(),
    };
    simulatedCollections.push(newCol);
    return newCol;
  }
  return await invoke<Collection>("create_collection", { req });
}

/** Deletes a collection */
export async function deleteCollection(id: number): Promise<boolean> {
  if (!isTauriEnvironment()) {
    simulatedCollections = simulatedCollections.filter((c) => c.id !== id);
    return true;
  }
  return await invoke<boolean>("delete_collection", { req: { id } });
}

/** Lists all collections */
export async function listCollections(): Promise<Collection[]> {
  if (!isTauriEnvironment()) {
    return [...simulatedCollections];
  }
  return await invoke<Collection[]>("list_collections");
}

/** Assigns a clipboard item to a collection */
export async function assignItemCollection(itemId: number, collectionId: number): Promise<void> {
  if (!isTauriEnvironment()) {
    const key = String(itemId);
    simulatedItemCollections[key] = simulatedItemCollections[key] || [];
    if (!simulatedItemCollections[key].includes(collectionId)) {
      simulatedItemCollections[key].push(collectionId);
    }
    return;
  }
  await invoke("assign_item_collection", { req: { item_id: itemId, collection_id: collectionId } });
}

/** Removes a clipboard item from a collection */
export async function removeItemCollection(itemId: number, collectionId: number): Promise<void> {
  if (!isTauriEnvironment()) {
    const key = String(itemId);
    if (simulatedItemCollections[key]) {
      simulatedItemCollections[key] = simulatedItemCollections[key].filter((id) => id !== collectionId);
    }
    return;
  }
  await invoke("remove_item_collection", { req: { item_id: itemId, collection_id: collectionId } });
}

/** Retrieves collections assigned to an item */
export async function getItemCollections(itemId: number): Promise<Collection[]> {
  if (!isTauriEnvironment()) {
    const assignedIds = simulatedItemCollections[String(itemId)] || [];
    return simulatedCollections.filter((c) => assignedIds.includes(c.id));
  }
  return await invoke<Collection[]>("get_item_collections", { req: { id: itemId } });
}

/** Creates a tag */
export async function createTag(req: { name: string; color?: string }): Promise<Tag> {
  if (!isTauriEnvironment()) {
    const existing = simulatedTags.find((t) => t.name.toLowerCase() === req.name.toLowerCase());
    if (existing) return existing;
    const newTag: Tag = {
      id: Date.now(),
      name: req.name,
      color: req.color || "#6366f1",
      created_at: Date.now(),
    };
    simulatedTags.push(newTag);
    return newTag;
  }
  return await invoke<Tag>("create_tag", { req });
}

/** Deletes a tag */
export async function deleteTag(id: number): Promise<boolean> {
  if (!isTauriEnvironment()) {
    simulatedTags = simulatedTags.filter((t) => t.id !== id);
    return true;
  }
  return await invoke<boolean>("delete_tag", { req: { id } });
}

/** Lists all tags */
export async function listTags(): Promise<Tag[]> {
  if (!isTauriEnvironment()) {
    return [...simulatedTags];
  }
  return await invoke<Tag[]>("list_tags");
}

/** Tags an item */
export async function tagItem(itemId: number, tagId: number): Promise<void> {
  if (!isTauriEnvironment()) {
    const key = String(itemId);
    simulatedItemTags[key] = simulatedItemTags[key] || [];
    if (!simulatedItemTags[key].includes(tagId)) {
      simulatedItemTags[key].push(tagId);
    }
    return;
  }
  await invoke("tag_item", { req: { item_id: itemId, tag_id: tagId } });
}

/** Untags an item */
export async function untagItem(itemId: number, tagId: number): Promise<void> {
  if (!isTauriEnvironment()) {
    const key = String(itemId);
    if (simulatedItemTags[key]) {
      simulatedItemTags[key] = simulatedItemTags[key].filter((id) => id !== tagId);
    }
    return;
  }
  await invoke("untag_item", { req: { item_id: itemId, tag_id: tagId } });
}

/** Retrieves tags for an item */
export async function getItemTags(itemId: number): Promise<Tag[]> {
  if (!isTauriEnvironment()) {
    const assignedIds = simulatedItemTags[String(itemId)] || [];
    return simulatedTags.filter((t) => assignedIds.includes(t.id));
  }
  return await invoke<Tag[]>("get_item_tags", { req: { id: itemId } });
}

/** Saves an ordered selection queue as a named reusable paste sequence */
export async function savePasteSequence(req: {
  name: string;
  description?: string;
  loop_count?: number;
  items: Array<{
    item_id?: number;
    static_text?: string;
    sequence_order: number;
    delay_ms?: number;
  }>;
}): Promise<PasteSequence> {
  if (!isTauriEnvironment()) {
    const newSeq: PasteSequence = {
      id: Date.now(),
      name: req.name,
      description: req.description,
      loop_count: req.loop_count ?? 1,
      created_at: Date.now(),
      updated_at: Date.now(),
      items: req.items.map((it, idx) => ({
        id: Date.now() + idx,
        sequence_id: Date.now(),
        item_id: it.item_id,
        static_text: it.static_text,
        sequence_order: it.sequence_order,
        delay_ms: it.delay_ms ?? 50,
      })),
    };
    simulatedSequences.unshift(newSeq);
    return newSeq;
  }
  return await invoke<PasteSequence>("save_paste_sequence", { req });
}

/** Lists all saved paste sequences */
export async function listPasteSequences(): Promise<PasteSequence[]> {
  if (!isTauriEnvironment()) {
    return [...simulatedSequences];
  }
  return await invoke<PasteSequence[]>("list_paste_sequences");
}

/** Deletes a paste sequence by ID */
export async function deletePasteSequence(id: number): Promise<boolean> {
  if (!isTauriEnvironment()) {
    simulatedSequences = simulatedSequences.filter((s) => s.id !== id);
    return true;
  }
  return await invoke<boolean>("delete_paste_sequence", { req: { id } });
}

/** Exports vault data as schema-versioned archive container */
export async function exportVaultData(): Promise<VaultArchive> {
  if (!isTauriEnvironment()) {
    return {
      version: 1,
      app_version: "0.1.0",
      exported_at: Date.now(),
      items: [
        {
          content_hash: "hash_sim_1",
          format_type: "text",
          plain_text: "Simulated exported item",
          is_pinned: false,
          is_favorite: false,
          created_at: Date.now(),
        },
      ],
      snippets: [...simulatedSnippets],
      collections: [...simulatedCollections],
      tags: [...simulatedTags],
      sequences: [...simulatedSequences],
    };
  }
  return await invoke<VaultArchive>("export_vault_data");
}

/** Imports vault data with format validation and merge/replace */
export async function importVaultData(
  archiveJson: string,
  mode: "merge" | "replace" = "merge"
): Promise<ImportResult> {
  if (!isTauriEnvironment()) {
    const parsed = JSON.parse(archiveJson) as VaultArchive;
    if (parsed.version !== 1) {
      throw new Error("Unsupported archive version");
    }
    if (mode === "replace") {
      simulatedSnippets = [...(parsed.snippets || [])];
      simulatedCollections = [...(parsed.collections || [])];
      simulatedTags = [...(parsed.tags || [])];
      simulatedSequences = [...(parsed.sequences || [])];
    } else {
      simulatedSnippets.push(...(parsed.snippets || []));
      simulatedCollections.push(...(parsed.collections || []));
      simulatedTags.push(...(parsed.tags || []));
      simulatedSequences.push(...(parsed.sequences || []));
    }
    return {
      items_imported: parsed.items?.length || 0,
      snippets_imported: parsed.snippets?.length || 0,
      collections_imported: parsed.collections?.length || 0,
      tags_imported: parsed.tags?.length || 0,
      sequences_imported: parsed.sequences?.length || 0,
    };
  }
  return await invoke<ImportResult>("import_vault_data", {
    req: { archive_json: archiveJson, mode },
  });
}

/** Opens an external URL safely in the user's default desktop web browser */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await invoke("open_external_url", { url });
      return;
    } catch (err) {
      console.warn("Failed to open via Tauri IPC open_external_url, falling back to window.open:", err);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}





