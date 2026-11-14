import React, { useState } from "react";
import { ClipboardItem } from "../types/clipboard.ts";
import { savePasteSequence } from "../api/vault";
import { safeConfirm } from "../utils/confirm.ts";

interface SelectionQueueBarProps {
  selectedItems: ClipboardItem[];
  onCopyInOrder?: (separator: string) => void;
  onClearQueue: () => void;
  onStartSequentialPaste?: () => void;
  onBulkDelete?: () => void;
  onOpenPreview?: () => void;
  onSequenceSaved?: () => void;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  onRemoveItem?: (id: string) => void;
}

export const SelectionQueueBar: React.FC<SelectionQueueBarProps> = ({
  selectedItems,
  onCopyInOrder,
  onClearQueue,
  onStartSequentialPaste,
  onBulkDelete,
  onOpenPreview,
  onSequenceSaved,
  onMoveUp,
  onMoveDown,
  onRemoveItem,
}) => {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [sequenceName, setSequenceName] = useState("");
  const [sequenceDescription, setSequenceDescription] = useState("");
  const [saveFeedback, setSaveFeedback] = useState("");
  const [separator, setSeparator] = useState<string>("\n");

  if (selectedItems.length === 0) {
    return null;
  }

  const handleClear = () => {
    if (selectedItems.length >= 2) {
      if (
        !safeConfirm(
          `Clear all ${selectedItems.length} items from sequential paste queue?`
        )
      ) {
        return;
      }
    }
    onClearQueue();
  };

  const handleSaveSequence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sequenceName.trim()) return;

    try {
      await savePasteSequence({
        name: sequenceName.trim(),
        description: sequenceDescription.trim() || undefined,
        items: selectedItems.map((item, idx) => ({
          item_id: Number.isInteger(Number(item.id)) ? Number(item.id) : undefined,
          static_text: item.content,
          sequence_order: idx + 1,
          delay_ms: 50,
        })),
      });

      setSaveFeedback("✓ Sequence Saved Successfully!");
      setTimeout(() => {
        setSaveFeedback("");
        setShowSaveModal(false);
        setSequenceName("");
        setSequenceDescription("");
        if (onSequenceSaved) onSequenceSaved();
      }, 1200);
    } catch (err: unknown) {
      setSaveFeedback(err instanceof Error ? err.message : "Failed to save sequence");
    }
  };

  return (
    <section className="cv-queue-bar" aria-labelledby="queue-bar-heading">
      <div className="cv-queue-header">
        <div className="cv-queue-title-group">
          <span className="cv-queue-badge" aria-hidden="true">
            {selectedItems.length}
          </span>
          <h2 id="queue-bar-heading" className="cv-queue-title">
            {selectedItems.length} items in paste order
          </h2>
          <div className="cv-separator-group" style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "8px" }}>
            <label htmlFor="cv-separator-select" style={{ fontSize: "11px", color: "var(--cv-text-muted)" }}>
              Join with:
            </label>
            <select
              id="cv-separator-select"
              className="cv-separator-select"
              value={separator}
              onChange={(e) => setSeparator(e.target.value)}
              aria-label="Clipboard join separator"
              style={{
                fontSize: "11px",
                padding: "2px 6px",
                borderRadius: "4px",
                background: "var(--cv-bg-primary)",
                color: "var(--cv-text-primary)",
                border: "1px solid var(--cv-border-default)",
              }}
            >
              <option value="\n">↵ Newline</option>
              <option value="\n\n">↵↵ Double line</option>
              <option value=" ">␣ Space</option>
              <option value=", ">, Comma</option>
              <option value="">None</option>
            </select>
          </div>
        </div>
        <div className="cv-queue-header-actions">
          {onBulkDelete && (
            <button
              type="button"
              className="cv-queue-action-link"
              onClick={onBulkDelete}
              aria-label={`Delete ${selectedItems.length} selected items`}
              style={{ color: "var(--cv-status-danger, #ef4444)" }}
            >
              🗑️ Delete ({selectedItems.length})
            </button>
          )}
          <button
            type="button"
            className="cv-queue-action-link"
            onClick={handleClear}
            aria-label="Clear all items from sequential paste queue"
          >
            Clear Selection
          </button>
          {onOpenPreview && (
            <button
              type="button"
              className="cv-queue-action-link"
              onClick={onOpenPreview}
              aria-label="Preview full sequence and execution options"
              style={{ fontSize: "11px" }}
            >
              Review
            </button>
          )}
          <button
            type="button"
            className="cv-queue-action-link"
            onClick={() => setShowSaveModal(true)}
            aria-label="Save current queue as a permanent reusable sequence"
            style={{ fontSize: "11px" }}
          >
            💾 Save
          </button>
          {onStartSequentialPaste && (
            <button
              type="button"
              className="cv-queue-paste-btn"
              onClick={onStartSequentialPaste}
              aria-label={`Start sequential paste with ${selectedItems.length} items`}
              title="Step-by-step paste"
              style={{ padding: "4px 8px", fontSize: "11px", opacity: 0.9 }}
            >
              <span>Step Paste</span>
            </button>
          )}
          {onCopyInOrder && (
            <button
              type="button"
              className="cv-queue-copy-btn"
              onClick={() => onCopyInOrder(separator)}
              aria-label={`Copy in order`}
              title="Copy selected items in sequence order to clipboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                backgroundColor: "var(--cv-accent-primary, #6366f1)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--cv-radius-md, 6px)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <span aria-hidden="true">📋</span>
              <span>Copy in Order</span>
            </button>
          )}
        </div>
      </div>

      {/* Accessible item sequence list (screen-reader accessible, visually hidden to keep bottom clean) */}
      <ol className="cv-sr-only" aria-label="Sequential paste order">
        {selectedItems.map((item, index) => (
          <li key={item.id} className="cv-queue-chip">
            <span className="cv-chip-seq-num" aria-label={`Position ${index + 1}`}>
              {index + 1}
            </span>
            <span className="cv-chip-preview" title={item.content}>
              {item.contentType === "image"
                ? `🖼️ ${item.content}`
                : item.content.slice(0, 32).trim() + (item.content.length > 32 ? "…" : "")}
            </span>

            <div className="cv-chip-controls">
              {onMoveUp && (
                <button
                  type="button"
                  className="cv-chip-move-btn"
                  onClick={() => onMoveUp(index)}
                  disabled={index === 0}
                  aria-label={`Move item ${index + 1} earlier in paste order`}
                >
                  ◀
                </button>
              )}
              {onMoveDown && (
                <button
                  type="button"
                  className="cv-chip-move-btn"
                  onClick={() => onMoveDown(index)}
                  disabled={index === selectedItems.length - 1}
                  aria-label={`Move item ${index + 1} later in paste order`}
                >
                  ▶
                </button>
              )}
              {onRemoveItem && (
                <button
                  type="button"
                  className="cv-chip-remove-btn"
                  onClick={() => onRemoveItem(item.id)}
                  aria-label={`Remove item ${index + 1} from queue`}
                >
                  ✕
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* Save Sequence Modal */}
      {showSaveModal && (
        <div className="cv-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="save-seq-title">
          <div className="cv-modal-card">
            <h3 id="save-seq-title">Save as Reusable Sequence</h3>
            <p className="cv-modal-subtitle">
              Saves the current {selectedItems.length} items in their exact order as a reusable workflow.
            </p>

            {saveFeedback && <div className="cv-success-banner">{saveFeedback}</div>}

            <form onSubmit={handleSaveSequence} className="cv-form">
              <div className="cv-form-group">
                <label htmlFor="seq-name">Sequence Name *</label>
                <input
                  id="seq-name"
                  type="text"
                  className="cv-input"
                  placeholder="e.g., New Employee Onboarding Sequence"
                  value={sequenceName}
                  onChange={(e) => setSequenceName(e.target.value)}
                  required
                />
              </div>

              <div className="cv-form-group">
                <label htmlFor="seq-desc">Description (optional)</label>
                <input
                  id="seq-desc"
                  type="text"
                  className="cv-input"
                  placeholder="e.g., Fills name, email, department, and initial password"
                  value={sequenceDescription}
                  onChange={(e) => setSequenceDescription(e.target.value)}
                />
              </div>

              <div className="cv-sequence-preview-mini">
                <label className="cv-label-bold">Steps Preview ({selectedItems.length}):</label>
                <ol className="cv-steps-mini-list">
                  {selectedItems.map((item, idx) => (
                    <li key={item.id}>
                      <span className="cv-step-badge">[{idx + 1}]</span>
                      <span>
                        {item.contentType === "image"
                          ? `🖼️ ${item.content}`
                          : item.content.slice(0, 30) + (item.content.length > 30 ? "…" : "")}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="cv-modal-btn-row">
                <button type="submit" className="cv-btn cv-btn-primary">
                  💾 Save Sequence
                </button>
                <button
                  type="button"
                  className="cv-btn cv-btn-secondary"
                  onClick={() => setShowSaveModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
