import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "./EmptyState";
import { ClipboardCard } from "./ClipboardCard";
import { SettingsModal } from "./SettingsModal";
import { SequencePreviewModal } from "./SequencePreviewModal";
import { ClipboardItem } from "../types/clipboard";

describe("Performance & Accessibility Audit Regression Tests", () => {
  it("renders actionable recovery instructions in EmptyState error mode", () => {
    const handleRetry = vi.fn();
    render(
      <EmptyState
        type="error"
        errorMessage="SQLite connection refused"
        onRetry={handleRetry}
      />
    );

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText(/Recovery steps:/i)).toBeDefined();
    expect(screen.getByText(/Ensure CopyVault background process is running/i)).toBeDefined();

    const retryBtn = screen.getByRole("button", { name: /try reconnecting/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("ensures image thumbnails utilize decoding='async' and loading='lazy'", () => {
    const mockImageItem: ClipboardItem = {
      id: "media-card-1",
      content: "chart_preview.png",
      contentType: "image",
      capturedAt: Date.now() - 60000,
      charCount: 0,
      copyCount: 1,
      pinned: false,
      thumbnailUrl: "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAD8D+JaQAA3AA/ua1AAA=",
      previewText: "chart_preview.png",
      dimensions: { width: 1920, height: 1080 },
      byteSize: 45000,
    };

    render(
      <ClipboardCard
        item={mockImageItem}
        isSelected={false}
        selectionOrder={null}
        isFocused={false}
        onSelect={vi.fn()}
        onCardClick={vi.fn()}
        onTogglePin={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const img = screen.getByRole("img");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("alt")).toBe("chart_preview.png");
  });

  it("traps keyboard focus within SettingsModal on Tab and Shift+Tab navigation", () => {
    const handleClose = vi.fn();
    render(
      <SettingsModal
        isOpen={true}
        onClose={handleClose}
        retentionDays={30}
        onRetentionChange={vi.fn()}
        maxCapacity={1000}
        onCapacityChange={vi.fn()}
        privacyConcealmentEnabled={true}
        onTogglePrivacyConcealment={vi.fn()}
      />
    );

    const modalDialog = screen.getByRole("dialog");
    expect(modalDialog).toBeDefined();

    const focusable = modalDialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    expect(focusable.length).toBeGreaterThan(1);

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];

    // Focus last element and press Tab -> should wrap to first element
    lastElement.focus();
    expect(document.activeElement).toBe(lastElement);

    fireEvent.keyDown(window, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(firstElement);

    // Focus first element and press Shift+Tab -> should wrap to last element
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastElement);
  });

  it("traps keyboard focus within SequencePreviewModal on Tab navigation", () => {
    const handleClose = vi.fn();
    const mockItems: ClipboardItem[] = [
      {
        id: "seq-1",
        content: "API_HOST=127.0.0.1",
        contentType: "text",
        capturedAt: Date.now(),
        charCount: 18,
        copyCount: 1,
        pinned: false,
      },
      {
        id: "seq-2",
        content: "PORT=5432",
        contentType: "text",
        capturedAt: Date.now(),
        charCount: 9,
        copyCount: 1,
        pinned: false,
      },
    ];

    render(
      <SequencePreviewModal
        isOpen={true}
        onClose={handleClose}
        queuedItems={mockItems}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemoveItem={vi.fn()}
        onClearQueue={vi.fn()}
        onConfirmStart={vi.fn().mockResolvedValue(undefined)}
        accessibilityGranted={true}
        onRequestAccessibility={vi.fn()}
      />
    );

    const modalDialog = screen.getByRole("dialog");
    expect(modalDialog).toBeDefined();

    const focusable = modalDialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    expect(focusable.length).toBeGreaterThan(1);

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];

    lastElement.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(firstElement);
  });

  it("validates WCAG 2.1 AA text contrast compliance for all color system tokens", () => {
    function relativeLuminance(hex: string): number {
      const num = parseInt(hex.replace("#", ""), 16);
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      const a = [r, g, b].map((v) => {
        const val = v / 255;
        return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }

    function contrastRatio(hex1: string, hex2: string): number {
      const l1 = relativeLuminance(hex1);
      const l2 = relativeLuminance(hex2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    // Dark Mode tokens
    const darkSurface = "#111827";
    const darkElevated = "#1f2937";
    const darkTextPrimary = "#f9fafb";
    const darkTextSecondary = "#9ca3af";
    const darkTextMuted = "#94a3b8";

    expect(contrastRatio(darkTextPrimary, darkSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkTextSecondary, darkSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkTextMuted, darkSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkTextMuted, darkElevated)).toBeGreaterThanOrEqual(4.5);

    // Light Mode tokens
    const lightSurface = "#ffffff";
    const lightElevated = "#f1f5f9";
    const lightTextPrimary = "#0f172a";
    const lightTextSecondary = "#475569";
    const lightTextMuted = "#475569";

    expect(contrastRatio(lightTextPrimary, lightSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightTextSecondary, lightSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightTextMuted, lightSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightTextMuted, lightElevated)).toBeGreaterThanOrEqual(4.5);
  });
});

