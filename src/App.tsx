import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ClipboardItem,
  DateRangeFilter,
  DesktopSettings,
  FilterCategory,
  PasteMode,
  PrivacyDiagnostics,
  PrivacySettings,
  SequentialItemPayload,
  SequentialStatus,
  SortOrder,
  SidebarView,
  UIStateMode,
  WindowMode,
} from "./types/clipboard.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { SearchBar } from "./components/SearchBar.tsx";
import { FilterBar } from "./components/FilterBar.tsx";
import { ClipboardCard } from "./components/ClipboardCard.tsx";
import { DetailPane } from "./components/DetailPane.tsx";
import { SelectionQueueBar } from "./components/SelectionQueueBar.tsx";
import { SequencePreviewModal } from "./components/SequencePreviewModal.tsx";
import { ImagePreviewModal } from "./components/ImagePreviewModal.tsx";
import { ActiveSessionBar } from "./components/ActiveSessionBar.tsx";
import { EmptyState } from "./components/EmptyState.tsx";
import { SettingsModal } from "./components/SettingsModal.tsx";
import { AddTestItemModal } from "./components/AddTestItemModal.tsx";
import { SnippetsView } from "./components/SnippetsView.tsx";
import { SequencesView } from "./components/SequencesView.tsx";
import { AboutView } from "./components/AboutView.tsx";
import { PrivacyView } from "./components/PrivacyView.tsx";
import { PasteSequence } from "./types/clipboard.ts";
import { safeConfirm } from "./utils/confirm.ts";
import {
  isTauriEnvironment,
  getRecentItems,
  searchItems,
  dtoToClipboardItem,
  updateItemContent,
  togglePinItem,
  deleteItem as apiDeleteItem,
  bulkDeleteItems,
  runRetentionCleanup,
  addItem,
  copyToClipboard,
  copyImageToClipboard,
  startMonitoring,
  listenClipboardCaptured,
  checkPasteAccessibility,
  requestPasteAccessibility,
  startSequentialPaste,
  pasteNextSequential,
  cancelSequentialPaste,
  getSequentialStatus,
  getDesktopSettings,
  updateDesktopSettings,
  hideQuickPanel,
  setWindowMode,
  getPrivacySettings,
  updatePrivacySettings,
  getPrivacyDiagnostics,
  clearHistory as apiClearHistory,
} from "./api/vault.ts";

export function App() {
  // Theme state
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Core Data State
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  // Sequential Selection Queue: stores item IDs in the exact chronological order selected
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([]);
  // Cache of selected items so they persist even when search/filter/pagination changes
  const [selectedItemsCache, setSelectedItemsCache] = useState<Map<string, ClipboardItem>>(new Map());

  // Sequential Paste Session State
  const [isSequenceModalOpen, setIsSequenceModalOpen] = useState(false);
  const [previewImageItem, setPreviewImageItem] = useState<ClipboardItem | null>(null);
  const [isAdvancingSequential, setIsAdvancingSequential] = useState(false);
  const [accessibilityGranted, setAccessibilityGranted] = useState(true);
  const [sequentialStatus, setSequentialStatus] = useState<SequentialStatus>({
    isActive: false,
    currentIndex: 0,
    totalItems: 0,
    remainingItems: 0,
    pasteMode: "none",
    isCompleted: false,
    message: "No active sequential paste queue.",
    accessibilityGranted: true,
  });

  // Filter & Navigation State
  const [activeView, setActiveView] = useState<SidebarView>("history");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("all");
  const [dateRange, setDateRange] = useState<DateRangeFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  // Keyboard navigation & inspection
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [inspectingItemId, setInspectingItemId] = useState<string | null>(null);

  // Modals & State Simulator
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [uiStateMode, setUiStateMode] = useState<UIStateMode>("normal");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Settings preferences & Desktop Integration
  const [retentionDays, setRetentionDays] = useState(30);
  const [maxCapacity, setMaxCapacity] = useState(1000);
  const [privacyConcealmentEnabled, setPrivacyConcealmentEnabled] = useState(true);
  const [windowMode, setWindowModeState] = useState<WindowMode>("workspace");
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({
    pause_monitoring: false,
    skip_confidential_heuristics: true,
    app_exclusions: ["1Password", "Bitwarden", "KeePassXC"],
    max_capacity: 1000,
    retention_days: 30,
    platform_supports_app_identification: true,
  });
  const [privacyDiagnostics, setPrivacyDiagnostics] = useState<PrivacyDiagnostics | null>(null);
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings>({
    global_shortcut: "Cmd+Shift+V",
    launch_at_login: false,
    auto_hide_on_blur: true,
    compact_density: false,
    theme: "dark",
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const internalCopiesRef = useRef<Map<string, number>>(new Map());

  // Record an internal write to the clipboard to prevent re-recording selections made on the app
  const recordInternalCopy = useCallback((text: string) => {
    const now = Date.now();
    internalCopiesRef.current.set(text, now);
    for (const [key, timestamp] of internalCopiesRef.current.entries()) {
      if (now - timestamp > 30000) {
        internalCopiesRef.current.delete(key);
      }
    }
  }, []);

  const isInternalCopy = useCallback((text: string): boolean => {
    const now = Date.now();
    const timestamp = internalCopiesRef.current.get(text);
    if (timestamp && now - timestamp < 30000) {
      return true;
    }
    return false;
  }, []);

  // Load desktop and privacy settings on startup
  useEffect(() => {
    getDesktopSettings()
      .then((settings) => {
        setDesktopSettings(settings);
        if (settings.theme === "light" || settings.theme === "dark") {
          setTheme(settings.theme);
        }
      })
      .catch(() => {});

    getPrivacySettings()
      .then((settings) => {
        setPrivacySettings(settings);
        setMaxCapacity(settings.max_capacity);
        setRetentionDays(settings.retention_days);
      })
      .catch(() => {});

    getPrivacyDiagnostics()
      .then((diag) => setPrivacyDiagnostics(diag))
      .catch(() => {});
  }, []);

  // Theme synchronization
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  // Check accessibility permissions and query any active sequential session on mount
  useEffect(() => {
    checkPasteAccessibility()
      .then((res) => {
        setAccessibilityGranted(res.is_trusted);
      })
      .catch(() => {});

    getSequentialStatus()
      .then((status) => {
        if (status.isActive) {
          setSequentialStatus(status);
        }
      })
      .catch(() => {});
  }, []);

  const handleRequestAccessibility = useCallback(async () => {
    try {
      await requestPasteAccessibility();
      setTimeout(async () => {
        try {
          const res = await checkPasteAccessibility();
          setAccessibilityGranted(res.is_trusted);
        } catch {
          // Ignore accessibility check error during polling
        }
      }, 1000);
    } catch (err) {
      console.error("Failed to request accessibility:", err);
    }
  }, []);

  // Search debounce (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load items from backend SQLite repository (or localStorage in browser preview)
  const loadItems = useCallback(
    async (targetOffset = 0, append = false) => {
      if (!isTauriEnvironment()) {
        try {
          const stored = localStorage.getItem("copyvault_browser_items");
          if (stored) {
            const parsed = JSON.parse(stored) as ClipboardItem[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              setItems(parsed);
              setTotalCount(parsed.length);
            }
          }
        } catch {
          // Ignore localStorage errors
        }
        return;
      }

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const isPinned = activeView === "pinned" ? true : undefined;
        const res = debouncedQuery.trim()
          ? await searchItems(
              debouncedQuery.trim(),
              activeCategory,
              50,
              targetOffset,
              dateRange,
              isPinned
            )
          : await getRecentItems(
              activeCategory,
              sortOrder,
              targetOffset,
              50,
              dateRange,
              isPinned
            );

        const mapped = res.items.map(dtoToClipboardItem);
        if (append) {
          setItems((prev) => [...prev, ...mapped]);
        } else {
          setItems(mapped);
        }
        setTotalCount(res.total);
        setHasMore(res.has_more);
      } catch (err: unknown) {
        console.error("Failed to query clipboard vault:", err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [debouncedQuery, activeCategory, sortOrder, dateRange, activeView]
  );

  // Trigger query reload whenever filters, search, or view change
  useEffect(() => {
    loadItems(0, false);
  }, [loadItems]);

  // Start background monitoring and subscribe to live clipboard capture events
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    startMonitoring().catch((err) => {
      console.warn("Could not start clipboard monitoring:", err);
    });

    let unlisten: (() => void) | undefined;
    listenClipboardCaptured((dto) => {
      // Do not record internal copies made from within CopyVault
      if (dto.plain_text && isInternalCopy(dto.plain_text)) {
        return;
      }
      const newItem = dtoToClipboardItem(dto);
      setItems((prev) => {
        const exists = prev.some((i) => i.id === newItem.id);
        if (exists) {
          return [newItem, ...prev.filter((i) => i.id !== newItem.id)];
        }
        return [newItem, ...prev];
      });
      setTotalCount((prev) => prev + 1);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.warn("Failed to subscribe to clipboard events:", err);
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [isInternalCopy]);

  // Web preview mode: persist items to localStorage
  useEffect(() => {
    if (isTauriEnvironment()) return;
    try {
      localStorage.setItem("copyvault_browser_items", JSON.stringify(items));
    } catch {
      // Ignore quota errors
    }
  }, [items]);

  // Web preview mode: listen to manual paste events (Cmd+V)
  useEffect(() => {
    if (isTauriEnvironment()) return;

    const handleWindowPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      // If user is actively typing in the search input or textarea, let normal paste occur
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
        const input = activeEl as HTMLInputElement;
        if (input.value.length > 0) return;
      }

      if (!e.clipboardData) return;

      // Check for image in clipboard
      const clipItems = Array.from(e.clipboardData.items || []);
      const imgItem = clipItems.find((item) => item.type.startsWith("image/"));
      if (imgItem) {
        const blob = imgItem.getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const dataUrl = evt.target?.result as string;
            const newItem: ClipboardItem = {
              id: `browser_img_${Date.now()}`,
              contentType: "image",
              content: `[Captured Image: ${blob.name || "clipboard.png"}]`,
              previewText: `Image (${Math.round(blob.size / 1024)} KB)`,
              thumbnailUrl: dataUrl,
              capturedAt: Date.now(),
              pinned: false,
              copyCount: 1,
              charCount: 0,
              lineCount: 0,
              sourceApp: "Browser Paste",
            };
            setItems((prev) => [newItem, ...prev]);
            setTotalCount((prev) => prev + 1);
            setStatusMessage("Captured image from clipboard!");
            setTimeout(() => setStatusMessage(null), 3000);
          };
          reader.readAsDataURL(blob);
          return;
        }
      }

      // Check for plain text
      const pastedText = e.clipboardData.getData("text/plain");
      if (pastedText && pastedText.trim()) {
        // Do not record copies made inside the app
        if (isInternalCopy(pastedText)) {
          return;
        }
        const isUrl = pastedText.startsWith("http://") || pastedText.startsWith("https://");
        const isCode = !isUrl && (pastedText.includes("function") || pastedText.includes("=>") || pastedText.includes("{") || pastedText.includes("class ") || pastedText.includes("const "));
        const newItem: ClipboardItem = {
          id: `browser_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          contentType: isUrl ? "link" : isCode ? "code" : "text",
          content: pastedText,
          previewText: pastedText.slice(0, 150),
          capturedAt: Date.now(),
          pinned: false,
          copyCount: 1,
          charCount: pastedText.length,
          lineCount: pastedText.split("\n").length,
          sourceApp: "Browser Paste",
        };
        setItems((prev) => {
          const filtered = prev.filter((i) => i.content !== newItem.content);
          return [newItem, ...filtered];
        });
        setTotalCount((prev) => prev + 1);
        setStatusMessage(`Captured "${pastedText.slice(0, 24)}…" from clipboard!`);
        setTimeout(() => setStatusMessage(null), 3000);
      }
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [isInternalCopy]);

  // Filtered & Sorted items calculation
  // In Tauri: SQLite has already applied filtering, sorting and pagination
  // In non-Tauri / test environments: we apply client-side filtering on items
  const displayedItems = useMemo(() => {
    if (isTauriEnvironment()) {
      return items;
    }

    let result = [...items];

    // Sidebar view filter (All vs Pinned)
    if (activeView === "pinned") {
      result = result.filter((item) => item.pinned);
    }

    // Category filter
    if (activeCategory !== "all") {
      result = result.filter((item) => item.contentType === activeCategory);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.content.toLowerCase().includes(q) ||
          item.previewText?.toLowerCase().includes(q) ||
          item.sourceApp?.toLowerCase().includes(q)
      );
    }

    // Sort order
    result.sort((a, b) => {
      if (sortOrder === "newest") return b.capturedAt - a.capturedAt;
      if (sortOrder === "oldest") return a.capturedAt - b.capturedAt;
      if (sortOrder === "most_used") return b.copyCount - a.copyCount;
      return 0;
    });

    return result;
  }, [items, activeView, activeCategory, searchQuery, sortOrder]);

  // Cache updates: keep selectedItemsCache synchronized when items list updates
  useEffect(() => {
    if (items.length > 0) {
      setSelectedItemsCache((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const item of items) {
          if (selectedQueueIds.includes(item.id)) {
            if (!next.has(item.id) || next.get(item.id)?.content !== item.content) {
              next.set(item.id, item);
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    }
  }, [items, selectedQueueIds]);

  // Category counts for badges
  const categoryCounts = useMemo(() => {
    const baseItems = activeView === "pinned" ? items.filter((i) => i.pinned) : items;
    return {
      all: totalCount > 0 ? totalCount : baseItems.length,
      text: baseItems.filter((i) => i.contentType === "text").length,
      code: baseItems.filter((i) => i.contentType === "code").length,
      image: baseItems.filter((i) => i.contentType === "image").length,
      link: baseItems.filter((i) => i.contentType === "link").length,
    };
  }, [items, activeView, totalCount]);

  // Selected items resolved in ordered queue sequence from cache or items
  const orderedSelectedItems = useMemo(() => {
    return selectedQueueIds
      .map((id) => selectedItemsCache.get(id) || items.find((item) => item.id === id))
      .filter((item): item is ClipboardItem => item !== undefined);
  }, [selectedQueueIds, selectedItemsCache, items]);

  // Sequential Selection toggle: adds to queue or removes and renumbers consistently
  const toggleItemSelection = useCallback(
    (id: string) => {
      setSelectedQueueIds((prev) => {
        if (prev.includes(id)) {
          return prev.filter((itemId) => itemId !== id);
        } else {
          return [...prev, id];
        }
      });

      // Cache selected item immediately
      const found = items.find((i) => i.id === id);
      if (found) {
        setSelectedItemsCache((prev) => {
          const next = new Map(prev);
          next.set(id, found);
          return next;
        });
      }
    },
    [items]
  );

  // Remove individual item from queue
  const handleRemoveQueueItem = useCallback((id: string) => {
    setSelectedQueueIds((prev) => prev.filter((itemId) => itemId !== id));
    setSelectedItemsCache((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Clear all selection from queue with confirmation guard
  const handleClearQueue = useCallback(() => {
    setSelectedQueueIds([]);
    setSelectedItemsCache(new Map());
  }, []);

  // Reorder items in sequential paste queue
  const moveQueueItem = useCallback((index: number, direction: "up" | "down") => {
    setSelectedQueueIds((prev) => {
      const newQueue = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newQueue.length) return prev;
      const temp = newQueue[index];
      newQueue[index] = newQueue[targetIndex];
      newQueue[targetIndex] = temp;
      return newQueue;
    });
  }, []);

  // Start sequential paste session
  const handleConfirmStartSequential = useCallback(
    async (mode: PasteMode) => {
      const payloads: SequentialItemPayload[] = orderedSelectedItems.map((item) => ({
        id: Number(item.id),
        content_type: item.contentType,
        text_content: item.content,
        media_path: item.mediaPath,
      }));

      if (payloads.length === 0) return;

      try {
        const status = await startSequentialPaste(payloads, mode);
        setSequentialStatus(status);
        setStatusMessage(
          `Sequential paste armed (${status.pasteMode === "synthetic" ? "⚡ Automated" : "📋 Stepped"}). 1 of ${status.totalItems} ready on clipboard.`
        );
        setTimeout(() => setStatusMessage(null), 4000);
      } catch (err: unknown) {
        console.error("Failed to start sequential paste session:", err);
        setStatusMessage("Failed to start sequential paste session");
        setTimeout(() => setStatusMessage(null), 3000);
      }
    },
    [orderedSelectedItems]
  );

  // Paste / advance next in sequential queue
  const handlePasteNextSequential = useCallback(async () => {
    if (isAdvancingSequential || !sequentialStatus.isActive) return;
    setIsAdvancingSequential(true);
    try {
      const status = await pasteNextSequential();
      setSequentialStatus(status);
      if (status.isCompleted) {
        setStatusMessage("✓ All items in sequential paste queue completed!");
      } else {
        setStatusMessage(
          `Step ${status.currentIndex + 1} of ${status.totalItems} ready on clipboard.`
        );
      }
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: unknown) {
      console.error("Failed to advance sequential paste:", err);
      setStatusMessage("Paste advance failed. Item remains on clipboard for manual Cmd+V.");
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsAdvancingSequential(false);
    }
  }, [isAdvancingSequential, sequentialStatus.isActive]);

  // Cancel sequential paste session
  const handleCancelSequential = useCallback(async () => {
    try {
      const status = await cancelSequentialPaste();
      setSequentialStatus(status);
      setStatusMessage("Sequential paste session canceled.");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error("Failed to cancel sequential paste:", err);
    }
  }, []);

  // Pin toggle with backend synchronization
  const togglePin = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item))
    );

    if (isTauriEnvironment()) {
      try {
        await togglePinItem(Number(id));
      } catch (err) {
        console.error("Failed to toggle pin on backend:", err);
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item))
        );
      }
    }
  }, []);

  // Delete single item with backend synchronization and media cleanup
  const handleDeleteItem = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSelectedQueueIds((prev) => prev.filter((itemId) => itemId !== id));
      setSelectedItemsCache((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setTotalCount((prev) => Math.max(0, prev - 1));
      if (inspectingItemId === id) {
        setInspectingItemId(null);
      }

      if (isTauriEnvironment()) {
        try {
          await apiDeleteItem(Number(id));
        } catch (err) {
          console.error("Failed to delete item from SQLite:", err);
        }
      }
    },
    [inspectingItemId]
  );

  // Bulk delete selected items with user confirmation and transactional media cleanup
  const handleBulkDelete = useCallback(async () => {
    if (selectedQueueIds.length === 0) return;

    const confirmMessage = `Permanently delete ${selectedQueueIds.length} selected items?`;
    if (!safeConfirm(confirmMessage)) return;

    const idsToDelete = [...selectedQueueIds];
    const idSet = new Set(idsToDelete);

    setItems((prev) => prev.filter((item) => !idSet.has(item.id)));
    setSelectedQueueIds([]);
    setSelectedItemsCache(new Map());
    setTotalCount((prev) => Math.max(0, prev - idsToDelete.length));
    if (inspectingItemId && idSet.has(inspectingItemId)) {
      setInspectingItemId(null);
    }

    if (isTauriEnvironment()) {
      try {
        const numericIds = idsToDelete
          .map(Number)
          .filter((n) => !isNaN(n) && Number.isInteger(n));
        if (numericIds.length > 0) {
          const deletedCount = await bulkDeleteItems(numericIds);
          setStatusMessage(`Permanently deleted ${deletedCount} items.`);
        } else {
          setStatusMessage(`Deleted ${idsToDelete.length} items.`);
        }
        setTimeout(() => setStatusMessage(null), 3000);
      } catch (err) {
        console.error("Bulk delete failed:", err);
      }
    } else {
      setStatusMessage(`Deleted ${idsToDelete.length} items.`);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  }, [selectedQueueIds, inspectingItemId]);

  // In-place text editing with SQLite FTS5 re-indexing
  const handleSaveEdit = useCallback(async (id: string, newContent: string) => {
    if (isTauriEnvironment()) {
      try {
        const updatedDto = await updateItemContent(Number(id), newContent);
        const mapped = dtoToClipboardItem(updatedDto);
        setItems((prev) => prev.map((item) => (item.id === id ? mapped : item)));
        setSelectedItemsCache((prev) => {
          if (prev.has(id)) {
            const next = new Map(prev);
            next.set(id, mapped);
            return next;
          }
          return prev;
        });
      } catch (err) {
        console.error("Failed to update item text in SQLite:", err);
        throw err;
      }
    } else {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            const updated = {
              ...item,
              content: newContent,
              previewText: newContent,
              charCount: newContent.length,
              lineCount: newContent.split("\n").length,
            };
            setSelectedItemsCache((cache) => {
              if (cache.has(id)) {
                const next = new Map(cache);
                next.set(id, updated);
                return next;
              }
              return cache;
            });
            return updated;
          }
          return item;
        })
      );
    }
    setStatusMessage("Clipboard item updated.");
    setTimeout(() => setStatusMessage(null), 3000);
  }, []);

  // Retention cleanup trigger
  const handleRunRetentionCleanup = useCallback(async () => {
    if (isTauriEnvironment()) {
      try {
        const res = await runRetentionCleanup(maxCapacity, retentionDays);
        setStatusMessage(
          `Retention cleanup: pruned ${res.deleted_items} items and ${res.deleted_media} media files.`
        );
        setTimeout(() => setStatusMessage(null), 4000);
        await loadItems(0, false);
      } catch (err) {
        console.error("Retention cleanup failed:", err);
      }
    } else {
      setStatusMessage("Retention cleanup complete.");
      setTimeout(() => setStatusMessage(null), 3000);
    }
  }, [maxCapacity, retentionDays, loadItems]);

  // Load more items (pagination)
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    await loadItems(items.length, true);
  }, [isLoadingMore, hasMore, loadItems, items.length]);

  // Desktop settings update handler
  const handleUpdateDesktopSettings = useCallback(async (newSettings: DesktopSettings) => {
    try {
      await updateDesktopSettings(newSettings);
      setDesktopSettings(newSettings);
      setStatusMessage("Settings updated.");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save desktop settings:", err);
      throw err;
    }
  }, []);

  // Privacy settings update handler
  const handleUpdatePrivacySettings = useCallback(async (updates: Partial<PrivacySettings>) => {
    try {
      const saved = await updatePrivacySettings(updates);
      setPrivacySettings(saved);
      if (updates.max_capacity !== undefined) setMaxCapacity(updates.max_capacity);
      if (updates.retention_days !== undefined) setRetentionDays(updates.retention_days);
      const diag = await getPrivacyDiagnostics();
      setPrivacyDiagnostics(diag);
      setStatusMessage("Privacy settings updated.");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error("Failed to update privacy settings:", err);
      throw err;
    }
  }, []);

  // Clear history action (wipe database items & associated media)
  const handleClearHistory = useCallback(async (keepPinned: boolean) => {
    if (isTauriEnvironment()) {
      try {
        const deletedCount = await apiClearHistory(keepPinned);
        await loadItems(0, false);
        const diag = await getPrivacyDiagnostics();
        setPrivacyDiagnostics(diag);
        setStatusMessage(
          keepPinned
            ? `Cleared ${deletedCount} unpinned items. Pinned items preserved.`
            : `Cleared all ${deletedCount} items and media files.`
        );
        setTimeout(() => setStatusMessage(null), 4000);
      } catch (err) {
        console.error("Failed to clear history:", err);
      }
    } else {
      setItems((prev) => (keepPinned ? prev.filter((i) => i.pinned) : []));
      setTotalCount((prev) => (keepPinned ? prev : 0));
      setSelectedQueueIds([]);
      setSelectedItemsCache(new Map());
      setStatusMessage(keepPinned ? "Cleared unpinned history." : "Cleared all history.");
      setTimeout(() => setStatusMessage(null), 3000);
    }
  }, [loadItems]);

  // Toggle between Compact Quick Panel mode and Full Workspace mode
  const handleToggleWindowMode = useCallback(async (mode: WindowMode) => {
    setWindowModeState(mode);
    try {
      await setWindowMode(mode);
    } catch (err) {
      console.error("Failed to switch window mode:", err);
    }
  }, []);

  // Browser preview helper: read from navigator.clipboard manually
  const handleBrowserPasteCapture = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        // Try reading items (images or rich formats) first
        if (navigator.clipboard.read) {
          try {
            const clipItems = await navigator.clipboard.read();
            for (const clipItem of clipItems) {
              const imageType = clipItem.types.find((t) => t.startsWith("image/"));
              if (imageType) {
                const blob = await clipItem.getType(imageType);
                const reader = new FileReader();
                reader.onload = (evt) => {
                  const dataUrl = evt.target?.result as string;
                  const newItem: ClipboardItem = {
                    id: `browser_img_${Date.now()}`,
                    contentType: "image",
                    content: `[Captured Image: clipboard.${imageType.split("/")[1] || "png"}]`,
                    previewText: `Image (${Math.round(blob.size / 1024)} KB)`,
                    thumbnailUrl: dataUrl,
                    capturedAt: Date.now(),
                    pinned: false,
                    copyCount: 1,
                    charCount: 0,
                    lineCount: 0,
                    sourceApp: "Browser Paste Button",
                  };
                  setItems((prev) => [newItem, ...prev]);
                  setTotalCount((prev) => prev + 1);
                  setStatusMessage("✓ Captured image to history!");
                  setTimeout(() => setStatusMessage(null), 3000);
                };
                reader.readAsDataURL(blob);
                return;
              }
            }
          } catch {
            // Fall back to readText if read() is blocked or unsupported
          }
        }

        if (navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (!text || !text.trim()) {
            setStatusMessage("Clipboard is empty or contains non-text content.");
            setTimeout(() => setStatusMessage(null), 3000);
            return;
          }
          const isUrl = text.startsWith("http://") || text.startsWith("https://");
          const isCode = !isUrl && (text.includes("function") || text.includes("=>") || text.includes("{") || text.includes("class "));
          const newItem: ClipboardItem = {
            id: `browser_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            contentType: isUrl ? "link" : isCode ? "code" : "text",
            content: text,
            previewText: text.slice(0, 150),
            capturedAt: Date.now(),
            pinned: false,
            copyCount: 1,
            charCount: text.length,
            lineCount: text.split("\n").length,
            sourceApp: "Browser Paste Button",
          };
          setItems((prev) => {
            const filtered = prev.filter((i) => i.content !== text);
            return [newItem, ...filtered];
          });
          setTotalCount((prev) => prev + 1);
          setStatusMessage(`Captured "${text.slice(0, 24)}…" to history!`);
          setTimeout(() => setStatusMessage(null), 3000);
        }
      } catch (err) {
        console.warn("Clipboard access error:", err);
        setStatusMessage("Clipboard permission denied. Please press Cmd+V / Ctrl+V to paste into CopyVault.");
        setTimeout(() => setStatusMessage(null), 4000);
      }
    }
  }, []);

  const handleAddItem = useCallback(async (newItem: ClipboardItem) => {
    if (isTauriEnvironment()) {
      try {
        const createdDto = await addItem(
          newItem.contentType,
          newItem.content,
          newItem.sourceApp,
          newItem.thumbnailUrl,
          newItem.contentType === "image" ? "image/png" : undefined,
          newItem.dimensions?.width,
          newItem.dimensions?.height
        );
        setItems((prev) => [dtoToClipboardItem(createdDto), ...prev]);
        setTotalCount((prev) => prev + 1);
      } catch (err) {
        console.error("Failed to insert item into SQLite:", err);
      }
    } else {
      setItems((prev) => [newItem, ...prev]);
      setTotalCount((prev) => prev + 1);
    }
    setStatusMessage(`Added "${newItem.content.slice(0, 24)}…"`);
    setTimeout(() => setStatusMessage(null), 3000);
  }, []);

  // Copy content action with suppression of internal echo recording
  const handleCopyContent = useCallback(
    async (itemOrContent: ClipboardItem | string) => {
      if (typeof itemOrContent === "object" && itemOrContent.contentType === "image") {
        try {
          await copyImageToClipboard(itemOrContent.id, itemOrContent.thumbnailUrl);
          setStatusMessage("✓ Copied image to clipboard! Ready to paste.");
          setTimeout(() => setStatusMessage(null), 3000);
          return;
        } catch (err) {
          console.error("Failed to copy image to clipboard:", err);
          setStatusMessage("Failed to copy image to clipboard");
          setTimeout(() => setStatusMessage(null), 3000);
          return;
        }
      }

      const content = typeof itemOrContent === "object" ? itemOrContent.content : itemOrContent;
      recordInternalCopy(content);
      try {
        await copyToClipboard(content);
        setStatusMessage("Copied to local clipboard");
      } catch {
        setStatusMessage("Failed to write to clipboard");
      }
      setTimeout(() => setStatusMessage(null), 3000);
    },
    [recordInternalCopy]
  );

  // Copy selected items combined in sequential order to the clipboard
  const handleCopyInOrder = useCallback(
    async (separator = "\n") => {
      if (orderedSelectedItems.length === 0) return;

      // Special case: Single selected image should be copied as an image bitmap
      if (orderedSelectedItems.length === 1 && orderedSelectedItems[0].contentType === "image") {
        const singleImage = orderedSelectedItems[0];
        try {
          await copyImageToClipboard(singleImage.id, singleImage.thumbnailUrl);
          setSelectedQueueIds([]);
          setSelectedItemsCache(new Map());
          setStatusMessage("✓ Copied image to clipboard! Ready to paste.");
          setTimeout(() => setStatusMessage(null), 3500);
          return;
        } catch (err) {
          console.error("Failed to copy image to clipboard in queue:", err);
          setStatusMessage("Failed to copy image to clipboard");
          setTimeout(() => setStatusMessage(null), 3000);
          return;
        }
      }

      // If multiple items contain images alongside text, or multiple images
      // For images among text, if there's only 1 item total or user wants to copy
      const orderedText = orderedSelectedItems
        .map((item) => {
          if (item.contentType === "image") {
            return `[Image: ${item.content || "Image"}]`;
          }
          return item.content;
        })
        .filter((text) => Boolean(text && text.trim()))
        .join(separator);

      if (!orderedText) return;

      recordInternalCopy(orderedText);

      try {
        await copyToClipboard(orderedText);
        // Clear selection after copying
        setSelectedQueueIds([]);
        setSelectedItemsCache(new Map());
        setStatusMessage(
          `✓ Copied ${orderedSelectedItems.length} items in order to clipboard! Ready to paste anywhere.`
        );
        setTimeout(() => setStatusMessage(null), 3500);
      } catch (err) {
        console.error("Failed to copy in order to clipboard:", err);
        setStatusMessage("Failed to copy in order to clipboard");
        setTimeout(() => setStatusMessage(null), 3000);
      }
    },
    [orderedSelectedItems, recordInternalCopy]
  );

  // Load a saved sequence into the active paste queue
  const handleLoadSequenceToQueue = useCallback((seq: PasteSequence) => {
    const newItems: ClipboardItem[] = [];
    const newQueueIds: string[] = [];

    for (const step of seq.items) {
      const stepId = step.item_id ? String(step.item_id) : `seq_${seq.id}_${step.sequence_order}`;
      newQueueIds.push(stepId);

      const existing = items.find((it) => it.id === stepId);
      if (!existing) {
        newItems.push({
          id: stepId,
          contentType: "text",
          content: step.static_text || "",
          previewText: step.static_text || "",
          capturedAt: Date.now(),
          copyCount: 1,
          pinned: false,
        });
      }
    }

    if (newItems.length > 0) {
      setItems((prev) => [...newItems, ...prev]);
    }
    setSelectedQueueIds(newQueueIds);
    setActiveView("history");
    setStatusMessage(`Loaded sequence "${seq.name}" with ${seq.items.length} items into paste queue.`);
    setTimeout(() => setStatusMessage(null), 3000);
  }, [items]);

  // Open sequence preview modal
  const handleStartSequentialPaste = useCallback(() => {
    setIsSequenceModalOpen(true);
  }, []);

  // Keyboard navigation & sequential paste shortcuts
  useEffect(() => {
    const handleListKeyDown = (e: KeyboardEvent) => {
      if (
        isSettingsOpen ||
        isAddModalOpen ||
        isSequenceModalOpen ||
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.altKey && e.key === "ArrowUp") {
        // Alt + ArrowUp: Move focused item earlier in queue
        e.preventDefault();
        const currentItem = displayedItems[focusedIndex];
        if (currentItem) {
          const idx = selectedQueueIds.indexOf(currentItem.id);
          if (idx > 0) {
            moveQueueItem(idx, "up");
          }
        }
      } else if (e.altKey && e.key === "ArrowDown") {
        // Alt + ArrowDown: Move focused item later in queue
        e.preventDefault();
        const currentItem = displayedItems[focusedIndex];
        if (currentItem) {
          const idx = selectedQueueIds.indexOf(currentItem.id);
          if (idx !== -1 && idx < selectedQueueIds.length - 1) {
            moveQueueItem(idx, "down");
          }
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, displayedItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Home") {
        e.preventDefault();
        setFocusedIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setFocusedIndex(Math.max(0, displayedItems.length - 1));
      } else if (e.shiftKey && e.key === " ") {
        // Shift + Space: Toggle sequential selection of current card
        e.preventDefault();
        const currentItem = displayedItems[focusedIndex];
        if (currentItem) {
          toggleItemSelection(currentItem.id);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "P" || e.key === "p")) {
        // Cmd/Ctrl + Shift + P: Open sequence preview modal
        e.preventDefault();
        if (selectedQueueIds.length > 0) {
          setIsSequenceModalOpen(true);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "V" || e.key === "v")) {
        // Cmd/Ctrl + Alt + V: Advance active sequential paste
        e.preventDefault();
        if (sequentialStatus.isActive) {
          handlePasteNextSequential();
        }
      } else if (e.key === "Enter") {
        // Enter: If multiple items selected, copy in order! Otherwise copy single card
        if (selectedQueueIds.length > 0) {
          e.preventDefault();
          handleCopyInOrder();
          if (windowMode === "quick_panel") {
            hideQuickPanel().catch(() => {});
          }
        } else {
          const currentItem = displayedItems[focusedIndex];
          if (currentItem) {
            e.preventDefault();
            handleCopyContent(currentItem.content);
            if (windowMode === "quick_panel") {
              hideQuickPanel().catch(() => {});
            }
          }
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "c" || e.key === "C")) {
        // Cmd/Ctrl + C: Copy selected items in order if selection exists
        if (selectedQueueIds.length > 0) {
          e.preventDefault();
          handleCopyInOrder();
        }
      } else if (e.key >= "1" && e.key <= "9" && !searchQuery) {
        // Number keys 1..9: Instant paste top item index
        const targetIndex = Number(e.key) - 1;
        if (targetIndex < displayedItems.length) {
          e.preventDefault();
          const targetItem = displayedItems[targetIndex];
          handleCopyContent(targetItem.content);
          if (windowMode === "quick_panel") {
            hideQuickPanel().catch(() => {});
          }
        }
      } else if (e.key === "Escape") {
        if (sequentialStatus.isActive) {
          e.preventDefault();
          handleCancelSequential();
        } else if (inspectingItemId) {
          e.preventDefault();
          setInspectingItemId(null);
        } else if (selectedQueueIds.length > 0) {
          e.preventDefault();
          handleClearQueue();
        } else if (windowMode === "quick_panel") {
          e.preventDefault();
          hideQuickPanel().catch(() => {});
        }
      }
    };

    window.addEventListener("keydown", handleListKeyDown);
    return () => window.removeEventListener("keydown", handleListKeyDown);
  }, [
    displayedItems,
    focusedIndex,
    isSettingsOpen,
    isAddModalOpen,
    isSequenceModalOpen,
    inspectingItemId,
    selectedQueueIds,
    sequentialStatus.isActive,
    toggleItemSelection,
    moveQueueItem,
    handlePasteNextSequential,
    handleCancelSequential,
    handleClearQueue,
    handleCopyContent,
    handleCopyInOrder,
    searchQuery,
    windowMode,
  ]);

  // Active item for inspection pane
  const inspectingItem = useMemo(() => {
    return items.find((i) => i.id === inspectingItemId) ?? null;
  }, [items, inspectingItemId]);

  return (
    <div
      className={`cv-desktop-app ${
        windowMode === "quick_panel" ? "cv-quick-panel-mode" : ""
      } ${desktopSettings.compact_density ? "cv-compact-density" : ""}`}
      data-testid="copyvault-desktop-app"
    >
      {/* Sidebar Navigation */}
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        totalCount={totalCount > 0 ? totalCount : items.length}
        pinnedCount={items.filter((i) => i.pinned).length}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Workspace Area */}
      <main className="cv-main-view" role="main" aria-label="Clipboard history workspace">
        {/* Top Search Toolbar */}
        <div className="cv-top-toolbar" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <SearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onOpenAddModal={import.meta.env.DEV ? () => setIsAddModalOpen(true) : undefined}
              inputRef={searchInputRef}
              autoFocus
            />
          </div>
          <button
            type="button"
            className="cv-btn cv-btn-secondary"
            style={{
              fontSize: "11px",
              padding: "4px 8px",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
            onClick={() =>
              handleUpdatePrivacySettings({
                pause_monitoring: !privacySettings.pause_monitoring,
              })
            }
            aria-label={privacySettings.pause_monitoring ? "Resume clipboard capture" : "Pause clipboard capture"}
            title={privacySettings.pause_monitoring ? "Capture is paused. Click to resume." : "Capture is active. Click to pause."}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: privacySettings.pause_monitoring
                  ? "var(--cv-color-warning)"
                  : "var(--cv-color-success)",
              }}
              aria-hidden="true"
            />
            {privacySettings.pause_monitoring ? "Paused" : "Active"}
          </button>
          <button
            type="button"
            className="cv-btn cv-btn-secondary"
            style={{ fontSize: "11px", padding: "4px 8px", whiteSpace: "nowrap" }}
            onClick={() =>
              handleToggleWindowMode(
                windowMode === "quick_panel" ? "workspace" : "quick_panel"
              )
            }
            aria-label={
              windowMode === "quick_panel"
                ? "Switch to Full Workspace"
                : "Switch to Compact Quick Panel"
            }
          >
            {windowMode === "quick_panel" ? "🖥 Full View" : "⚡ Quick Panel"}
          </button>
          {!isTauriEnvironment() && (
            <button
              type="button"
              className="cv-btn cv-btn-primary"
              style={{
                fontSize: "11px",
                padding: "4px 10px",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
              onClick={handleBrowserPasteCapture}
              title="Read clipboard text and add to CopyVault history"
              aria-label="Paste from clipboard"
            >
              📋 Paste from Clipboard
            </button>
          )}
        </div>

        {/* Browser Preview Info Notice */}
        {!isTauriEnvironment() && (
          <div
            style={{
              padding: "6px 12px",
              backgroundColor: "rgba(99, 102, 241, 0.08)",
              borderBottom: "1px solid var(--cv-border-subtle, #334155)",
              fontSize: "11px",
              color: "var(--cv-text-secondary, #94a3b8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
            }}
          >
            <span>
              💡 <strong>Browser Preview Mode:</strong> Automatic background monitoring of other desktop apps runs when launched natively via <code>npm run tauri dev</code> or by opening <code>CopyVault.app</code>. In browser preview, use <strong>📋 Paste from Clipboard</strong> or press <strong>Cmd+V / Ctrl+V</strong> to capture items.
            </span>
          </div>
        )}

        {/* Filters, Categories & Sorting */}
        {activeView !== "snippets" && activeView !== "sequences" && activeView !== "about" && activeView !== "privacy" && (
          <FilterBar
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            sortOrder={sortOrder}
            onSortChange={setSortOrder}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            categoryCounts={categoryCounts}
            uiStateMode={uiStateMode}
            onStateModeChange={setUiStateMode}
          />
        )}

        {/* Status Toast */}
        {statusMessage && (
          <div
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "var(--cv-accent-primary)",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            role="status"
            aria-live="polite"
          >
            <span>{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              style={{ color: "#ffffff", fontSize: "14px", marginLeft: "1rem" }}
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content Area: List of Cards OR State View */}
        {activeView === "snippets" ? (
          <SnippetsView onCopyContent={handleCopyContent} />
        ) : activeView === "sequences" ? (
          <SequencesView onLoadSequenceToQueue={handleLoadSequenceToQueue} />
        ) : activeView === "about" ? (
          <AboutView />
        ) : activeView === "privacy" ? (
          <PrivacyView
            privacySettings={privacySettings}
            diagnostics={privacyDiagnostics}
            onUpdatePrivacySettings={handleUpdatePrivacySettings}
            onClearHistory={handleClearHistory}
          />
        ) : uiStateMode === "loading" || isLoading ? (
          <EmptyState type="loading" />
        ) : uiStateMode === "error" ? (
          <EmptyState
            type="error"
            onRetry={() => {
              setUiStateMode("normal");
              loadItems(0, false);
            }}
            errorMessage="Background clipboard service disconnected."
          />
        ) : uiStateMode === "empty" ||
          (items.length === 0 && !searchQuery.trim() && activeCategory === "all") ? (
          <EmptyState
            type="empty"
            onAddTestItem={import.meta.env.DEV ? () => setIsAddModalOpen(true) : undefined}
          />
        ) : displayedItems.length === 0 ? (
          <EmptyState
            type="no-results"
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery("")}
          />
        ) : (
          <div className="cv-card-list-container" role="feed" aria-label="Clipboard history cards">
            {displayedItems.map((item, index) => {
              const queuePosition = selectedQueueIds.indexOf(item.id);
              const isSelected = queuePosition !== -1;
              const selectionOrder = isSelected ? queuePosition + 1 : null;

              return (
                <ClipboardCard
                  key={item.id}
                  item={item}
                  isSelected={isSelected}
                  selectionOrder={selectionOrder}
                  isFocused={focusedIndex === index}
                  onSelect={() => toggleItemSelection(item.id)}
                  onCardClick={() => setInspectingItemId(item.id)}
                  onTogglePin={() => togglePin(item.id)}
                  onDelete={() => handleDeleteItem(item.id)}
                  onOpenPreview={(it) => setPreviewImageItem(it)}
                />
              );
            })}

            {/* Pagination Load More Control */}
            {hasMore && (
              <div
                className="cv-load-more-container"
                style={{ textAlign: "center", padding: "1.5rem" }}
              >
                <button
                  type="button"
                  className="cv-btn cv-btn-secondary"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  aria-label={`Load more clipboard items. Currently showing ${items.length} of ${totalCount}`}
                >
                  {isLoadingMore
                    ? "Loading more entries…"
                    : `Load More (${items.length} of ${totalCount})`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Bottom Selection Action Bar */}
        <SelectionQueueBar
          selectedItems={orderedSelectedItems}
          onCopyInOrder={handleCopyInOrder}
          onMoveUp={(idx) => moveQueueItem(idx, "up")}
          onMoveDown={(idx) => moveQueueItem(idx, "down")}
          onRemoveItem={handleRemoveQueueItem}
          onClearQueue={handleClearQueue}
          onStartSequentialPaste={handleStartSequentialPaste}
          onBulkDelete={handleBulkDelete}
          onOpenPreview={() => setIsSequenceModalOpen(true)}
          onSequenceSaved={() => {
            setStatusMessage("Queue saved as permanent reusable sequence.");
            setTimeout(() => setStatusMessage(null), 3000);
          }}
        />

        {/* Active Sequential Paste Floating Mini-Bar */}
        <ActiveSessionBar
          status={sequentialStatus}
          onPasteNext={handlePasteNextSequential}
          onCancel={handleCancelSequential}
          isAdvancing={isAdvancingSequential}
        />
      </main>

      {/* Detail Inspection Pane (Right Side) */}
      <DetailPane
        item={inspectingItem}
        onClose={() => setInspectingItemId(null)}
        onTogglePin={togglePin}
        onDelete={handleDeleteItem}
        onCopyContent={handleCopyContent}
        onSaveEdit={handleSaveEdit}
        onOpenPreview={(it) => setPreviewImageItem(it)}
        onPromotedToSnippet={() => {
          setStatusMessage("Item promoted to permanent Saved Snippet.");
          setTimeout(() => setStatusMessage(null), 3000);
        }}
      />

      {/* Full Resolution Image Preview Modal */}
      <ImagePreviewModal
        item={previewImageItem}
        onClose={() => setPreviewImageItem(null)}
        onCopyImage={async (it) => {
          await handleCopyContent(it);
        }}
      />

      {/* Sequence Preview & Arming Dialog */}
      <SequencePreviewModal
        isOpen={isSequenceModalOpen}
        onClose={() => setIsSequenceModalOpen(false)}
        queuedItems={orderedSelectedItems}
        onMoveUp={(idx) => moveQueueItem(idx, "up")}
        onMoveDown={(idx) => moveQueueItem(idx, "down")}
        onRemoveItem={handleRemoveQueueItem}
        onClearQueue={handleClearQueue}
        onConfirmStart={handleConfirmStartSequential}
        accessibilityGranted={accessibilityGranted}
        onRequestAccessibility={handleRequestAccessibility}
      />

      {/* Settings Modal Dialog */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        retentionDays={retentionDays}
        onRetentionChange={setRetentionDays}
        maxCapacity={maxCapacity}
        onCapacityChange={setMaxCapacity}
        privacyConcealmentEnabled={privacyConcealmentEnabled}
        onTogglePrivacyConcealment={() =>
          setPrivacyConcealmentEnabled((prev) => !prev)
        }
        desktopSettings={desktopSettings}
        onUpdateDesktopSettings={handleUpdateDesktopSettings}
        privacySettings={privacySettings}
        onUpdatePrivacySettings={handleUpdatePrivacySettings}
        diagnostics={privacyDiagnostics}
        onClearHistory={handleClearHistory}
        onRunRetentionCleanup={handleRunRetentionCleanup}
      />

      {/* Add Test Item Dialog */}
      <AddTestItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddItem={handleAddItem}
      />
    </div>
  );
}

export default App;
