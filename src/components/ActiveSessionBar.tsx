import React from "react";
import { SequentialStatus } from "../types/clipboard.ts";

interface ActiveSessionBarProps {
  status: SequentialStatus;
  onPasteNext: () => Promise<void>;
  onCancel: () => Promise<void>;
  isAdvancing: boolean;
}

export const ActiveSessionBar: React.FC<ActiveSessionBarProps> = ({
  status,
  onPasteNext,
  onCancel,
  isAdvancing,
}) => {
  if (!status.isActive && !status.isCompleted) {
    return null;
  }

  return (
    <aside
      className="cv-active-session-bar"
      role="region"
      aria-label="Active sequential paste session"
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 50,
        backgroundColor: "var(--cv-bg-surface-elevated, #1f2937)",
        borderTop: "2px solid var(--cv-accent-primary, #6366f1)",
        boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.25)",
        padding: "0.75rem 1.25rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
      }}
    >
      {/* Left: Step counter & current preview */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0.25rem 0.6rem",
            borderRadius: "6px",
            backgroundColor: "var(--cv-accent-primary, #6366f1)",
            color: "#ffffff",
            fontSize: "12px",
            fontWeight: 700,
            flexShrink: 0,
          }}
          aria-live="polite"
        >
          {status.isCompleted
            ? "Completed"
            : `Step ${status.currentIndex + 1} of ${status.totalItems}`}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "11px", color: "var(--cv-text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
            {status.pasteMode === "synthetic" ? "⚡ Automated Synthetic Mode" : "📋 Stepped Clipboard Mode"}
          </div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--cv-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {status.isCompleted ? (
              <span style={{ color: "var(--cv-color-success, #10b981)" }}>
                ✓ All {status.totalItems} items successfully pasted!
              </span>
            ) : (
              <span>
                Current: <strong>{status.currentItemPreview || "Payload ready on clipboard"}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
        {!status.isCompleted ? (
          <>
            <button
              type="button"
              className="cv-btn cv-btn-primary"
              onClick={onPasteNext}
              disabled={isAdvancing}
              style={{ padding: "0.4rem 0.9rem", fontSize: "13px" }}
              aria-label={`Advance to next item, ${status.remainingItems} remaining`}
            >
              {isAdvancing ? "Pasting..." : `Advance Next (${status.remainingItems} left)`}
            </button>
            <button
              type="button"
              className="cv-btn cv-btn-secondary"
              onClick={onCancel}
              style={{ padding: "0.4rem 0.75rem", fontSize: "13px" }}
              aria-label="Cancel active sequential paste session"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="cv-btn cv-btn-secondary"
            onClick={onCancel}
            style={{ padding: "0.4rem 0.9rem", fontSize: "13px" }}
            aria-label="Dismiss completed sequential session"
          >
            Dismiss
          </button>
        )}
      </div>
    </aside>
  );
};

