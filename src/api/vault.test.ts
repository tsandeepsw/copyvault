import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSystemStatus,
  getRecentItems,
  searchItems,
  isTauriEnvironment,
  calculateDateRange,
  dtoToClipboardItem,
  bulkDeleteItems,
  runRetentionCleanup,
  updateItemContent,
  togglePinItem,
  toggleFavoriteItem,
  deleteItem,
  clearHistory,
  startMonitoring,
  stopMonitoring,
  listenClipboardCaptured,
  copyImageToClipboard,
  getMediaData,
  BackendItemDto,
} from "./vault.ts";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("Vault IPC Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure window.__TAURI_INTERNALS__ is cleared
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("detects non-Tauri browser environment during unit tests", () => {
    expect(isTauriEnvironment()).toBe(false);
  });

  it("calculates date range bounds accurately", () => {
    const all = calculateDateRange("all");
    expect(all.start).toBeUndefined();
    expect(all.end).toBeUndefined();

    const today = calculateDateRange("today");
    expect(today.start).toBeDefined();
    expect(today.end).toBeDefined();
    expect(today.end!).toBeGreaterThanOrEqual(today.start!);

    const week = calculateDateRange("week");
    expect(week.start).toBeDefined();
    expect(week.end!).toBeGreaterThan(week.start!);
    expect(week.end! - week.start!).toBe(7 * 86_400_000);

    const month = calculateDateRange("month");
    expect(month.start).toBeDefined();
    expect(month.end!).toBeGreaterThan(month.start!);
    expect(month.end! - month.start!).toBe(30 * 86_400_000);
  });

  it("transforms BackendItemDto into typed ClipboardItem correctly", () => {
    const textDto: BackendItemDto = {
      id: 42,
      content_hash: "hash123",
      format_type: "text",
      plain_text: "Line 1\nLine 2",
      html_content: null,
      media_path: null,
      media_mime: null,
      media_width: null,
      media_height: null,
      media_size_bytes: null,
      media_thumbnail: null,
      source_app_bundle: "com.apple.Safari",
      source_app_name: "Safari",
      detected_lang: null,
      is_pinned: true,
      is_favorite: false,
      copy_count: 5,
      created_at: 1000,
      last_copied_at: 2000,
      last_pasted_at: null,
    };

    const item = dtoToClipboardItem(textDto);
    expect(item.id).toBe("42");
    expect(item.contentType).toBe("text");
    expect(item.content).toBe("Line 1\nLine 2");
    expect(item.lineCount).toBe(2);
    expect(item.charCount).toBe(13);
    expect(item.pinned).toBe(true);
    expect(item.copyCount).toBe(5);
    expect(item.sourceApp).toBe("Safari");
    expect(item.thumbnailUrl).toBeUndefined();

    // Image DTO with thumbnail bytes
    const imageDto: BackendItemDto = {
      ...textDto,
      id: 99,
      format_type: "image",
      plain_text: null,
      media_path: "/data/img.png",
      media_mime: "image/png",
      media_width: 800,
      media_height: 600,
      media_size_bytes: 4096,
      media_thumbnail: [65, 66, 67], // 'ABC'
    };

    const imgItem = dtoToClipboardItem(imageDto);
    expect(imgItem.contentType).toBe("image");
    expect(imgItem.mediaPath).toBe("/data/img.png");
    expect(imgItem.dimensions).toEqual({ width: 800, height: 600 });
    expect(imgItem.byteSize).toBe(4096);
    expect(imgItem.thumbnailUrl).toContain("data:image/png;base64,");

    // Large thumbnail buffer exceeding call stack argument limit (70,000 bytes)
    const largeThumbnailBytes = new Array(70000).fill(65);
    const largeImageDto: BackendItemDto = {
      ...imageDto,
      media_thumbnail: largeThumbnailBytes,
    };
    expect(() => dtoToClipboardItem(largeImageDto)).not.toThrow();
    const largeImgItem = dtoToClipboardItem(largeImageDto);
    expect(largeImgItem.thumbnailUrl).toBeDefined();
    expect(largeImgItem.thumbnailUrl).toContain("data:image/png;base64,");
  });

  it("returns fallback status with schema_version 2 when outside desktop webview", async () => {
    const status = await getSystemStatus();
    expect(status.app_name).toContain("CopyVault");
    expect(status.status).toBe("healthy");
    expect(status.schema_version).toBe(2);
  });

  it("returns clean empty list fallback in web environment without crashing", async () => {
    const res = await getRecentItems("all", "newest", 0, 50);
    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.has_more).toBe(false);
  });

  it("handles search queries gracefully in web test environment", async () => {
    const searchRes = await searchItems("test query", "text", 10, 0);
    expect(searchRes.items).toEqual([]);
    expect(searchRes.total).toBe(0);
  });

  it("invokes Tauri backend commands when inside Tauri environment", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const { invoke } = await import("@tauri-apps/api/core");

    const mockItem: BackendItemDto = {
      id: 1,
      content_hash: "hash",
      format_type: "text",
      plain_text: "Hello Tauri",
      html_content: null,
      media_path: null,
      media_mime: null,
      media_width: null,
      media_height: null,
      media_size_bytes: null,
      media_thumbnail: null,
      source_app_bundle: null,
      source_app_name: "Terminal",
      detected_lang: null,
      is_pinned: false,
      is_favorite: false,
      copy_count: 1,
      created_at: 100,
      last_copied_at: 100,
      last_pasted_at: null,
    };

    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_recent_items") {
        return { items: [mockItem], total: 1, offset: 0, limit: 50, has_more: false };
      }
      if (cmd === "search_items") {
        return { items: [mockItem], total: 1, offset: 0, limit: 50, has_more: false };
      }
      if (cmd === "update_item_content") {
        return { ...mockItem, plain_text: "Updated Tauri" };
      }
      if (cmd === "toggle_pin_item") return true;
      if (cmd === "toggle_favorite_item") return true;
      if (cmd === "delete_item") return undefined;
      if (cmd === "bulk_delete_items") return 2;
      if (cmd === "clear_history") return 5;
      if (cmd === "run_retention_cleanup") return { deleted_items: 3, deleted_media: 1 };
      if (cmd === "start_monitoring_command") return undefined;
      if (cmd === "stop_monitoring_command") return undefined;
      return null;
    });

    const recent = await getRecentItems("all", "newest", 0, 50);
    expect(recent.items).toHaveLength(1);
    expect(recent.total).toBe(1);

    const search = await searchItems("Tauri");
    expect(search.items).toHaveLength(1);

    const updated = await updateItemContent(1, "Updated Tauri");
    expect(updated.plain_text).toBe("Updated Tauri");

    const pinRes = await togglePinItem(1);
    expect(pinRes).toBe(true);

    const favRes = await toggleFavoriteItem(1);
    expect(favRes).toBe(true);

    await expect(deleteItem(1)).resolves.toBeUndefined();

    const bulkCount = await bulkDeleteItems([1, 2]);
    expect(bulkCount).toBe(2);

    const clearCount = await clearHistory(true);
    expect(clearCount).toBe(5);

    const retention = await runRetentionCleanup(1000, 30);
    expect(retention.deleted_items).toBe(3);
    expect(retention.deleted_media).toBe(1);

    await expect(startMonitoring()).resolves.toBeUndefined();
    await expect(stopMonitoring()).resolves.toBeUndefined();
  });

  it("subscribes to live clipboard capture events in Tauri environment", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const { listen } = await import("@tauri-apps/api/event");

    const unsubscribeMock = vi.fn();
    vi.mocked(listen).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (event: string, callback: any) => {
        expect(event).toBe("clipboard-item-captured");
        callback({
          event: "clipboard-item-captured",
          id: 1,
          payload: {
            id: 10,
          content_hash: "hash10",
          format_type: "text",
          plain_text: "Live Captured Text",
          html_content: null,
          media_path: null,
          media_mime: null,
          media_width: null,
          media_height: null,
          media_size_bytes: null,
          media_thumbnail: null,
          source_app_bundle: null,
          source_app_name: "Notes",
          detected_lang: null,
          is_pinned: false,
          is_favorite: false,
          copy_count: 1,
          created_at: 200,
          last_copied_at: 200,
          last_pasted_at: null,
        },
      });
      return unsubscribeMock;
    });

    let receivedItem: BackendItemDto | null = null;
    const unlisten = await listenClipboardCaptured((item) => {
      receivedItem = item;
    });

    expect(receivedItem).not.toBeNull();
    expect(receivedItem!.plain_text).toBe("Live Captured Text");

    unlisten();
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it("handles sequential paste workflow in web simulator mode", async () => {
    const items = [
      { id: 1, content_type: "text", text_content: "Seq 1" },
      { id: 2, content_type: "image", text_content: "pic.png", media_path: "/tmp/pic.png" },
    ];

    // Start
    const startStatus = await (await import("./vault.ts")).startSequentialPaste(items, "synthetic");
    expect(startStatus.isActive).toBe(true);
    expect(startStatus.currentIndex).toBe(0);
    expect(startStatus.totalItems).toBe(2);
    expect(startStatus.currentItemId).toBe("1");

    // Next
    const nextStatus = await (await import("./vault.ts")).pasteNextSequential();
    expect(nextStatus.currentIndex).toBe(1);
    expect(nextStatus.currentItemId).toBe("2");
    expect(nextStatus.currentItemType).toBe("image");

    // Next (complete)
    const finalStatus = await (await import("./vault.ts")).pasteNextSequential();
    expect(finalStatus.isCompleted).toBe(true);
    expect(finalStatus.isActive).toBe(false);

    // Cancel
    const cancelStatus = await (await import("./vault.ts")).cancelSequentialPaste();
    expect(cancelStatus.isActive).toBe(false);

    // Status query
    const status = await (await import("./vault.ts")).getSequentialStatus();
    expect(status.isActive).toBe(false);

    // Accessibility check
    const access = await (await import("./vault.ts")).checkPasteAccessibility();
    expect(access.is_trusted).toBe(true);
  });

  it("handles desktop settings, window modes, and quick panel visibility", async () => {
    const {
      getDesktopSettings,
      updateDesktopSettings,
      hideQuickPanel,
      toggleQuickPanel,
      setWindowMode,
    } = await import("./vault.ts");

    const settings = await getDesktopSettings();
    expect(settings.global_shortcut).toBe("Cmd+Shift+V");
    expect(settings.auto_hide_on_blur).toBe(true);

    await updateDesktopSettings({
      ...settings,
      global_shortcut: "Ctrl+Shift+V",
      launch_at_login: true,
    });

    const updated = await getDesktopSettings();
    expect(updated.global_shortcut).toBe("Ctrl+Shift+V");
    expect(updated.launch_at_login).toBe(true);

    // Call hide, toggle, and setWindowMode
    await hideQuickPanel();
    const isVisible = await toggleQuickPanel();
    expect(isVisible).toBe(true);

    await setWindowMode("quick_panel");
    await setWindowMode("workspace");
  });

  it("handles snippet, collection, tag, sequence, and vault archive export/import APIs", async () => {
    const {
      createSavedSnippet,
      updateSavedSnippet,
      deleteSavedSnippet,
      listSavedSnippets,
      createCollection,
      deleteCollection,
      listCollections,
      createTag,
      deleteTag,
      listTags,
      savePasteSequence,
      listPasteSequences,
      deletePasteSequence,
      exportVaultData,
      importVaultData,
    } = await import("./vault.ts");

    // Snippets
    const snip = await createSavedSnippet({
      title: "Test Snippet",
      trigger_prefix: "!test",
      content: "Hello {{name}}",
      syntax: "text",
    });
    expect(snip.title).toBe("Test Snippet");

    const snipList = await listSavedSnippets();
    expect(snipList.some((s) => s.id === snip.id)).toBe(true);

    const updatedSnip = await updateSavedSnippet({
      id: snip.id,
      title: "Updated Snippet",
      content: "Updated content",
    });
    expect(updatedSnip.title).toBe("Updated Snippet");

    await deleteSavedSnippet(snip.id);
    const snipListAfter = await listSavedSnippets();
    expect(snipListAfter.some((s) => s.id === snip.id)).toBe(false);

    // Collections
    const col = await createCollection({
      slug: "marketing",
      name: "Marketing Materials",
      color: "#ec4899",
    });
    expect(col.name).toBe("Marketing Materials");

    const colList = await listCollections();
    expect(colList.some((c) => c.slug === "marketing")).toBe(true);

    await deleteCollection(col.id);

    // Tags
    const tag = await createTag({ name: "TestingTag", color: "#10b981" });
    expect(tag.name).toBe("TestingTag");

    const tagList = await listTags();
    expect(tagList.some((t) => t.id === tag.id)).toBe(true);

    await deleteTag(tag.id);

    // Reusable Sequences
    const seq = await savePasteSequence({
      name: "Test Form Sequence",
      items: [
        { static_text: "Field 1", sequence_order: 1 },
        { static_text: "Field 2", sequence_order: 2 },
      ],
    });
    expect(seq.items.length).toBe(2);

    const seqList = await listPasteSequences();
    expect(seqList.some((s) => s.id === seq.id)).toBe(true);

    await deletePasteSequence(seq.id);

    // Export & Import
    const archive = await exportVaultData();
    expect(archive.version).toBe(1);
    expect(archive.app_version).toBe("0.1.0");

    const importRes = await importVaultData(JSON.stringify(archive), "merge");
    expect(importRes).toBeDefined();
  });

  it("handles image copying and media data retrieval in browser and Tauri environments", async () => {
    // Browser fallback with data URL
    await expect(copyImageToClipboard("10", "data:image/png;base64,QUJD")).resolves.not.toThrow();

    // Mock Tauri environment
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValueOnce(undefined); // copy_item_image_to_clipboard
    await copyImageToClipboard("42");
    expect(invoke).toHaveBeenCalledWith("copy_item_image_to_clipboard", { req: { id: 42 } });

    vi.mocked(invoke).mockResolvedValueOnce({ mime_type: "image/png", bytes: [65, 66, 67] });
    const media = await getMediaData("42");
    expect(invoke).toHaveBeenCalledWith("get_media_data", { req: { id: 42 } });
    expect(media.mime_type).toBe("image/png");
    expect(media.data_url).toContain("data:image/png;base64,");
  });
});
