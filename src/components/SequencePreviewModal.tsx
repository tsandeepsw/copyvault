import React, { useEffect, useRef, useState } from "react";
import { ClipboardItem, PasteMode } from "../types/clipboard.ts";
import { safeConfirm } from "../utils/confirm.ts";

interface SequencePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  queuedItems: ClipboardItem[];
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemoveItem: (id: string) => void;
  onClearQueue: () => void;
  onConfirmStart: (mode: PasteMode) => Promise<void>;
  accessibilityGranted: boolean;
  onRequestAccessibility: () => void;
}

export const SequencePreviewModal: React.FC<SequencePreviewModalProps> = ({
  isOpen,
  onClose,
  queuedItems,
  onMoveUp,
  onMoveDown,
  onRemoveItem,
  onClearQueue,
  onConfirmStart,
  accessibilityGranted,
  onRequestAccessibility,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [selectedMode, setSelectedMode] = useState<PasteMode>(
    accessibilityGranted ? "synthetic" : "stepped_clipboard"
  );
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape" && !isStarting) {
        e.preventDefault();
        onClose();
        return;
      }

      // Keyboard Focus Trap inside modal
      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isStarting, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleClearWithConfirm = () => {
    if (queuedItems.length >= 2) {
      if (
        !safeConfirm(
          `Are you sure you want to clear your sequential queue of ${queuedItems.length} items? This cannot be undone.`
        )
      ) {
        return;
      }
    }
    onClearQueue();
    onClose();
  };

  const handleStart = async () => {
    if (selectedMode === "synthetic" && !accessibilityGranted) {
      onRequestAccessibility();
      return;
    }
    setIsStarting(true);
    try {
      await onConfirmStart(selectedMode);
      onClose();
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="cv-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="cv-modal-card cv-sequence-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sequence-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "680px", width: "95%" }}
      >
        <div className="cv-modal-header">
          <div className="cv-modal-title-group">
            <span aria-hidden="true">🔢</span>
            <h2 id="sequence-dialog-title" className="cv-modal-title">
              Sequential Paste Queue ({queuedItems.length} items)
            </h2>
          </div>
          <button
            type="button"
            className="cv-modal-close-btn"
            onClick={onClose}
            aria-label="Close sequence preview modal"
          >
            ✕
          </button>
        </div>

        <div className="cv-modal-body" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          {/* Explanation Banner */}
          <div
            className="cv-sequence-explanation"
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "var(--cv-bg-surface-elevated)",
              border: "1px solid var(--cv-border-subtle)",
              borderRadius: "var(--cv-radius-md, 8px)",
              fontSize: "13px",
              lineHeight: 1.5,
              marginBottom: "1rem",
            }}
          >
            <p style={{ margin: 0, fontWeight: 500 }}>
              These items will be pasted in the exact chronological sequence shown below (from 1 to{" "}
              {queuedItems.length}).
            </p>
            <p style={{ margin: "0.25rem 0 0 0", color: "var(--cv-text-muted)" }}>
              Each item is loaded to the system clipboard when its turn arrives. In applications that
              accept synthetic input, CopyVault simulates <code>Cmd+V</code> / <code>Ctrl+V</code>. In
              plain-text or protected fields, CopyVault steps the clipboard item by item so you can
              paste manually without losing your place.
            </p>
          </div>

          {/* Warning Banner */}
          {queuedItems.length > 0 && (
            <div
              className="cv-sequence-warning"
              style={{
                padding: "0.6rem 0.9rem",
                backgroundColor: "rgba(234, 88, 12, 0.12)",
                border: "1px solid var(--cv-color-warning, #ea580c)",
                borderRadius: "var(--cv-radius-md, 8px)",
                fontSize: "12px",
                color: "var(--cv-text-primary)",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span aria-hidden="true">⚠️</span>
              <span>
                <strong>Clipboard Replacement Notice:</strong> Starting this session will overwrite
                your current clipboard with Item 1 (
                <em>
                  {queuedItems[0]?.content.slice(0, 32)}
                  {queuedItems[0]?.content.length > 32 ? "…" : ""}
                </em>
                ).
              </span>
            </div>
          )}

          {/* Execution Mode Selector */}
          <section className="cv-settings-section" style={{ marginBottom: "1rem" }}>
            <h3 className="cv-settings-section-title" style={{ fontSize: "13px", marginBottom: "0.5rem" }}>
              Execution Method
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  padding: "0.5rem 0.75rem",
                  backgroundColor:
                    selectedMode === "synthetic"
                      ? "var(--cv-accent-subtle, rgba(99, 102, 241, 0.1))"
                      : "transparent",
                  border: `1px solid ${
                    selectedMode === "synthetic"
                      ? "var(--cv-accent-primary, #6366f1)"
                      : "var(--cv-border-subtle)"
                  }`,
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="paste-mode"
                  value="synthetic"
                  checked={selectedMode === "synthetic"}
                  onChange={() => setSelectedMode("synthetic")}
                  style={{ marginTop: "3px" }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>
                    ⚡ Automated Synthetic Paste (Simulate Cmd+V / Ctrl+V)
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>
                    Automatically switches focus to target application and triggers paste. Requires macOS
                    Accessibility authorization.
                  </div>
                </div>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  padding: "0.5rem 0.75rem",
                  backgroundColor:
                    selectedMode === "stepped_clipboard"
                      ? "var(--cv-accent-subtle, rgba(99, 102, 241, 0.1))"
                      : "transparent",
                  border: `1px solid ${
                    selectedMode === "stepped_clipboard"
                      ? "var(--cv-accent-primary, #6366f1)"
                      : "var(--cv-border-subtle)"
                  }`,
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="paste-mode"
                  value="stepped_clipboard"
                  checked={selectedMode === "stepped_clipboard"}
                  onChange={() => setSelectedMode("stepped_clipboard")}
                  style={{ marginTop: "3px" }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>
                    📋 Stepped Clipboard Mode (Manual Paste Step-By-Step)
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>
                    Advances the system clipboard item by item as you fill fields manually. Works on all
                    applications without accessibility privileges.
                  </div>
                </div>
              </label>
            </div>

            {/* Accessibility Warning when Synthetic selected but not granted */}
            {!accessibilityGranted && selectedMode === "synthetic" && (
              <div
                style={{
                  marginTop: "0.5rem",
                  padding: "0.5rem 0.75rem",
                  backgroundColor: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid var(--cv-color-danger, #ef4444)",
                  borderRadius: "6px",
                  fontSize: "12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>macOS Accessibility permission is required for synthetic keystrokes.</span>
                <button
                  type="button"
                  className="cv-btn cv-btn-secondary"
                  style={{ fontSize: "11px", padding: "0.2rem 0.5rem" }}
                  onClick={onRequestAccessibility}
                >
                  Grant in Settings
                </button>
              </div>
            )}
          </section>

          {/* Ordered Queue Items List */}
          <section>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <h3 style={{ fontSize: "13px", margin: 0, fontWeight: 600 }}>
                Deliberate Paste Order ({queuedItems.length} items)
              </h3>
              <button
                type="button"
                className="cv-queue-action-link"
                onClick={handleClearWithConfirm}
                style={{ fontSize: "12px", color: "var(--cv-status-danger, #ef4444)" }}
                aria-label="Clear all items from sequential queue"
              >
                Clear Entire Queue
              </button>
            </div>

            <ol
              className="cv-sequence-items-list"
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
              aria-label="Sequential queue items in paste order"
            >
              {queuedItems.map((item, index) => (
                <li
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.5rem 0.75rem",
                    backgroundColor: "var(--cv-bg-surface)",
                    border: "1px solid var(--cv-border-subtle)",
                    borderRadius: "6px",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "22px",
                        height: "22px",
                        borderRadius: "11px",
                        backgroundColor: "var(--cv-accent-primary, #6366f1)",
                        color: "#ffffff",
                        fontSize: "11px",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                      aria-label={`Step ${index + 1}`}
                    >
                      {index + 1}
                    </span>
                    <span style={{ fontSize: "13px", flexShrink: 0 }} aria-hidden="true">
                      {item.contentType === "code"
                        ? "💻"
                        : item.contentType === "image"
                        ? "🖼️"
                        : item.contentType === "link"
                        ? "🔗"
                        : "📝"}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={item.content}
                    >
                      {item.contentType === "image"
                        ? `Image: ${item.content}`
                        : item.content.slice(0, 50).trim() + (item.content.length > 50 ? "…" : "")}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                    <button
                      type="button"
                      className="cv-chip-move-btn"
                      onClick={() => onMoveUp(index)}
                      disabled={index === 0}
                      aria-label={`Move item ${index + 1} up to position ${index}`}
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="cv-chip-move-btn"
                      onClick={() => onMoveDown(index)}
                      disabled={index === queuedItems.length - 1}
                      aria-label={`Move item ${index + 1} down to position ${index + 2}`}
                      title="Move down"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="cv-chip-remove-btn"
                      onClick={() => onRemoveItem(item.id)}
                      aria-label={`Remove item ${index + 1} from sequence`}
                      title="Remove from queue"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="cv-modal-footer" style={{ display: "flex", justifyContent: "space-between" }}>
          <button type="button" className="cv-btn cv-btn-secondary" onClick={onClose} disabled={isStarting}>
            Cancel
          </button>
          <button
            type="button"
            className="cv-btn cv-btn-primary"
            onClick={handleStart}
            disabled={isStarting || queuedItems.length === 0}
            aria-label="Start sequential paste session"
          >
            {isStarting ? "Arming Queue..." : `🚀 Start Sequential Paste (${queuedItems.length} items)`}
          </button>
        </div>
      </div>
    </div>
  );
};

