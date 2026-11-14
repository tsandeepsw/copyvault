import React, { useState } from "react";
import { ClipboardItem, TextTransformType } from "../types/clipboard.ts";
import { applyTransform } from "../utils/transform";
import { createSavedSnippet } from "../api/vault";

interface DetailPaneProps {
  item: ClipboardItem | null;
  onClose: () => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onCopyContent: (contentOrItem: string | ClipboardItem) => void;
  onSaveEdit?: (id: string, newContent: string) => Promise<void>;
  onPromotedToSnippet?: () => void;
  onOpenPreview?: (item: ClipboardItem) => void;
}

export const DetailPane: React.FC<DetailPaneProps> = ({
  item,
  onClose,
  onTogglePin,
  onDelete,
  onCopyContent,
  onSaveEdit,
  onPromotedToSnippet,
  onOpenPreview,
}) => {
  const [copySuccess, setCopySuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item?.content || "");
  const [isSaving, setIsSaving] = useState(false);
  const [showTransformMenu, setShowTransformMenu] = useState(false);
  const [showSaveSnippetModal, setShowSaveSnippetModal] = useState(false);
  const [snippetTitle, setSnippetTitle] = useState("");
  const [snippetPrefix, setSnippetPrefix] = useState("");
  const [snippetSyntax, setSnippetSyntax] = useState("text");
  const [snippetFeedback, setSnippetFeedback] = useState("");

  // Synchronize edit text if active item changes
  React.useEffect(() => {
    if (item) {
      setEditText(item.content);
      setIsEditing(false);
    }
  }, [item]);

  if (!item) {
    return null;
  }

  const handleCopy = () => {
    onCopyContent(item.contentType === "image" ? item : item.content);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleSave = async () => {
    if (!onSaveEdit) return;
    setIsSaving(true);
    try {
      await onSaveEdit(item.id, editText);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyTransform = async (type: TextTransformType) => {
    if (!item) return;
    const transformed = applyTransform(isEditing ? editText : item.content, type);
    if (isEditing) {
      setEditText(transformed);
    } else if (onSaveEdit) {
      setIsSaving(true);
      try {
        await onSaveEdit(item.id, transformed);
      } finally {
        setIsSaving(false);
      }
    }
    setShowTransformMenu(false);
  };

  const handlePromoteToSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || !snippetTitle.trim()) return;

    try {
      await createSavedSnippet({
        title: snippetTitle.trim(),
        trigger_prefix: snippetPrefix.trim() || undefined,
        syntax: snippetSyntax,
        content: item.content,
        is_pinned: false,
      });
      setSnippetFeedback("✓ Saved to Permanent Snippets!");
      setTimeout(() => {
        setSnippetFeedback("");
        setShowSaveSnippetModal(false);
        if (onPromotedToSnippet) onPromotedToSnippet();
      }, 1200);
    } catch (err: unknown) {
      setSnippetFeedback(err instanceof Error ? err.message : "Failed to save snippet");
    }
  };

  const lineCount = item.content.split("\n").length;
  const wordCount = item.content.trim().split(/\s+/).filter(Boolean).length;

  return (
    <aside className="cv-detail-pane" aria-label="Item inspection panel">
      <div className="cv-detail-header">
        <div className="cv-detail-title-group">
          <span className="cv-detail-badge">{item.contentType.toUpperCase()}</span>
          <h2 className="cv-detail-title">Item Details</h2>
        </div>
        <button
          type="button"
          className="cv-detail-close-btn"
          onClick={onClose}
          aria-label="Close details inspection pane"
        >
          ✕
        </button>
      </div>

      <div className="cv-detail-content-viewer">
        {isEditing ? (
          <div className="cv-detail-editor-box">
            <textarea
              className="cv-detail-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              aria-label="Edit text content"
              rows={8}
            />
            <div className="cv-editor-btn-row">
              <button
                type="button"
                className="cv-btn cv-btn-primary"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "💾 Save Changes"}
              </button>
              <button
                type="button"
                className="cv-btn cv-btn-secondary"
                onClick={() => {
                  setEditText(item.content);
                  setIsEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : item.contentType === "image" ? (
          <div className="cv-detail-image-box">
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt={item.previewText || "Copied media preview"}
                className="cv-detail-img"
              />
            ) : (
              <div className="cv-detail-image-placeholder">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
                <span>Image file stored locally</span>
              </div>
            )}
            <div className="cv-detail-image-name">{item.content}</div>
            <button
              type="button"
              className="cv-btn cv-btn-secondary"
              style={{ marginTop: "0.75rem", fontSize: "12px", width: "100%" }}
              onClick={() => onOpenPreview?.(item)}
              aria-label="Preview full image"
            >
              👁️ Preview Full Image
            </button>
          </div>
        ) : item.contentType === "code" ? (
          <pre
            className="cv-detail-code-block"
            draggable="true"
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", item.content);
              e.dataTransfer.effectAllowed = "copy";
            }}
            title="Drag and drop code into any field"
          >
            <code>{item.content}</code>
          </pre>
        ) : (
          <div
            className="cv-detail-text-block"
            draggable="true"
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", item.content);
              if (item.htmlContent) {
                e.dataTransfer.setData("text/html", item.htmlContent);
              }
              e.dataTransfer.effectAllowed = "copy";
            }}
            title="Drag and drop text into any form field or window"
          >
            {item.content}
          </div>
        )}
      </div>

      <div className="cv-detail-metadata-section">
        <h3 className="cv-detail-meta-heading">Metadata</h3>
        <dl className="cv-detail-meta-grid">
          <div className="cv-meta-row">
            <dt>Captured At</dt>
            <dd>{new Date(item.capturedAt).toLocaleString()}</dd>
          </div>
          {item.sourceApp && (
            <div className="cv-meta-row">
              <dt>Source App</dt>
              <dd>{item.sourceApp}</dd>
            </div>
          )}
          <div className="cv-meta-row">
            <dt>Length</dt>
            <dd>{item.content.length} characters</dd>
          </div>
          {item.contentType !== "image" && (
            <>
              <div className="cv-meta-row">
                <dt>Words</dt>
                <dd>{wordCount} words</dd>
              </div>
              <div className="cv-meta-row">
                <dt>Lines</dt>
                <dd>{lineCount} lines</dd>
              </div>
            </>
          )}
          {item.dimensions && (
            <div className="cv-meta-row">
              <dt>Resolution</dt>
              <dd>{item.dimensions.width} × {item.dimensions.height} px</dd>
            </div>
          )}
          <div className="cv-meta-row">
            <dt>Pinned</dt>
            <dd>{item.pinned ? "Yes (Saved)" : "No"}</dd>
          </div>
          <div className="cv-meta-row">
            <dt>Copied Count</dt>
            <dd>{item.copyCount} times</dd>
          </div>
        </dl>
      </div>

      <div className="cv-detail-actions-bar">
        <button
          type="button"
          className="cv-btn cv-btn-primary"
          onClick={handleCopy}
          aria-label="Copy item text to clipboard"
        >
          {copySuccess ? "✓ Copied!" : "📋 Copy Again"}
        </button>

        {item.contentType !== "image" && (
          <div className="cv-dropdown-wrapper">
            <button
              type="button"
              className="cv-btn cv-btn-secondary"
              onClick={() => setShowTransformMenu(!showTransformMenu)}
              aria-label="Transform text"
            >
              ⚡ Transform ▾
            </button>
            {showTransformMenu && (
              <div className="cv-dropdown-menu" role="menu">
                <button type="button" onClick={() => handleApplyTransform("trim")}>
                  ✂️ Trim Whitespace
                </button>
                <button type="button" onClick={() => handleApplyTransform("uppercase")}>
                  🔠 UPPERCASE
                </button>
                <button type="button" onClick={() => handleApplyTransform("lowercase")}>
                  🔡 lowercase
                </button>
                <button type="button" onClick={() => handleApplyTransform("title_case")}>
                  📝 Title Case
                </button>
                <button type="button" onClick={() => handleApplyTransform("camel_case")}>
                  🐪 camelCase
                </button>
                <button type="button" onClick={() => handleApplyTransform("snake_case")}>
                  🐍 snake_case
                </button>
                <button type="button" onClick={() => handleApplyTransform("remove_duplicate_lines")}>
                  🧹 Remove Duplicate Lines
                </button>
                <button type="button" onClick={() => handleApplyTransform("normalize_line_endings")}>
                  ⏎ Normalize Line Endings (\n)
                </button>
              </div>
            )}
          </div>
        )}

        {item.contentType !== "image" && !isEditing && (
          <button
            type="button"
            className="cv-btn cv-btn-secondary"
            onClick={() => setIsEditing(true)}
            aria-label="Edit text content"
          >
            ✏️ Edit Text
          </button>
        )}

        {item.contentType !== "image" && (
          <button
            type="button"
            className="cv-btn cv-btn-secondary"
            onClick={() => {
              setSnippetTitle(item.content.slice(0, 30));
              setSnippetSyntax(item.contentType === "code" ? "code" : "text");
              setShowSaveSnippetModal(true);
            }}
            title="Promote this history item to permanent Saved Snippet"
            aria-label="Save as Permanent Snippet"
          >
            📑 Save as Snippet
          </button>
        )}

        <button
          type="button"
          className={`cv-btn ${item.pinned ? "cv-btn-warning" : "cv-btn-secondary"}`}
          onClick={() => onTogglePin(item.id)}
          aria-label={item.pinned ? "Unpin item" : "Pin item to top"}
        >
          {item.pinned ? "📌 Unpin" : "⭐ Pin to Top"}
        </button>

        <button
          type="button"
          className="cv-btn cv-btn-danger"
          onClick={() => {
            onDelete(item.id);
            onClose();
          }}
          aria-label="Delete item from history"
        >
          🗑️ Delete
        </button>
      </div>

      {/* Save as Permanent Snippet Modal */}
      {showSaveSnippetModal && (
        <div className="cv-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="save-snip-title">
          <div className="cv-modal-card">
            <h3 id="save-snip-title">Save to Permanent Snippets</h3>
            <p className="cv-modal-subtitle">
              Promote this item into a permanent snippet. It will remain saved even if clipboard history is purged.
            </p>

            {snippetFeedback && (
              <div className="cv-success-banner">{snippetFeedback}</div>
            )}

            <form onSubmit={handlePromoteToSnippet} className="cv-form">
              <div className="cv-form-group">
                <label htmlFor="promote-title">Snippet Title *</label>
                <input
                  id="promote-title"
                  type="text"
                  className="cv-input"
                  value={snippetTitle}
                  onChange={(e) => setSnippetTitle(e.target.value)}
                  placeholder="e.g. Database Connection String"
                  required
                />
              </div>

              <div className="cv-form-row">
                <div className="cv-form-group cv-form-col">
                  <label htmlFor="promote-prefix">Trigger Prefix (optional)</label>
                  <input
                    id="promote-prefix"
                    type="text"
                    className="cv-input"
                    value={snippetPrefix}
                    onChange={(e) => setSnippetPrefix(e.target.value)}
                    placeholder="e.g. !dbconn"
                  />
                </div>

                <div className="cv-form-group cv-form-col">
                  <label htmlFor="promote-syntax">Syntax</label>
                  <select
                    id="promote-syntax"
                    className="cv-select"
                    value={snippetSyntax}
                    onChange={(e) => setSnippetSyntax(e.target.value)}
                  >
                    <option value="text">Plain Text</option>
                    <option value="markdown">Markdown</option>
                    <option value="sql">SQL</option>
                    <option value="json">JSON</option>
                    <option value="typescript">TypeScript</option>
                    <option value="shell">Shell / Bash</option>
                  </select>
                </div>
              </div>

              <div className="cv-modal-btn-row">
                <button type="submit" className="cv-btn cv-btn-primary">
                  💾 Save Permanent Snippet
                </button>
                <button
                  type="button"
                  className="cv-btn cv-btn-secondary"
                  onClick={() => setShowSaveSnippetModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
};
