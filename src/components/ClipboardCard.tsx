import React, { useState } from "react";
import { ClipboardItem } from "../types/clipboard.ts";

interface ClipboardCardProps {
  item: ClipboardItem;
  isSelected: boolean;
  selectionOrder: number | null; // e.g. 1, 2, 3 if selected
  isFocused: boolean;
  onSelect: (e: React.MouseEvent | React.KeyboardEvent) => void;
  onCardClick: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onOpenPreview?: (item: ClipboardItem) => void;
}

const ClipboardCardComponent: React.FC<ClipboardCardProps> = ({
  item,
  isSelected,
  selectionOrder,
  isFocused,
  onSelect,
  onCardClick,
  onTogglePin,
  onDelete,
  onOpenPreview,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    e.dataTransfer.setData("text/plain", item.content);
    if (item.contentType === "link") {
      e.dataTransfer.setData("text/uri-list", item.content);
    }
    if (item.htmlContent) {
      e.dataTransfer.setData("text/html", item.htmlContent);
    }
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(false);
  };

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getFormatBadge = () => {
    switch (item.contentType) {
      case "code":
        return <span className="cv-badge cv-badge-code">💻 Code</span>;
      case "image":
        return <span className="cv-badge cv-badge-image">🖼️ Image</span>;
      case "link":
        return <span className="cv-badge cv-badge-link">🔗 Link</span>;
      case "text":
      default:
        return <span className="cv-badge cv-badge-text">📝 Text</span>;
    }
  };

  return (
    <article
      tabIndex={0}
      className={`cv-clipboard-card ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
      onClick={onCardClick}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          onSelect(e);
        } else if (e.key === "Enter") {
          e.preventDefault();
          onCardClick();
        }
      }}
      aria-label={`${item.contentType} item: ${item.content.slice(0, 40)}. ${isSelected ? `Selected item ${selectionOrder}` : "Not selected"}`}
    >
      {/* Selection Checkbox & Sequential Order Badge */}
      <div
        className="cv-card-selection"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(e);
        }}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={isSelected ? `Deselect item #${selectionOrder}` : "Select for sequential paste"}
          className={`cv-checkbox ${isSelected ? "checked" : ""}`}
        >
          {isSelected && (
            <span className="cv-seq-number" aria-hidden="true">
              {selectionOrder}
            </span>
          )}
        </button>
      </div>

      {/* Main Content Preview */}
      <div className="cv-card-body">
        <div className="cv-card-header-meta">
          <div className="cv-badge-group">
            {getFormatBadge()}
            {item.sourceApp && (
              <span className="cv-source-tag" title={`Copied from ${item.sourceApp}`}>
                {item.sourceApp}
              </span>
            )}
            {item.pinned && (
              <span className="cv-pinned-badge" title="Pinned item">
                📌
              </span>
            )}
          </div>
          <time dateTime={new Date(item.capturedAt).toISOString()} className="cv-timestamp">
            {formatTimeAgo(item.capturedAt)}
          </time>
        </div>

        {/* Content Rendering based on type */}
        {item.contentType === "image" ? (
          <div className="cv-image-card-layout">
            <div
              className="cv-image-thumbnail-container"
              aria-label="Image thumbnail preview"
              role="button"
              tabIndex={0}
              draggable="true"
              onDragStart={(e) => {
                e.stopPropagation();
                if (item.content) {
                  e.dataTransfer.setData("text/plain", item.content);
                }
                if (item.thumbnailUrl) {
                  e.dataTransfer.setData("text/uri-list", item.thumbnailUrl);
                }
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenPreview?.(item);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenPreview?.(item);
                }
              }}
              title="Click to preview, or drag and drop image"
            >
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt={item.previewText || "Copied media thumbnail"}
                  className="cv-thumbnail-img"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                /* Safe SVG placeholder thumbnail when media file is not on disk */
                <div className="cv-thumbnail-placeholder" title="Local media preview placeholder">
                  <svg
                    width="28"
                    height="28"
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
                </div>
              )}
            </div>
            <div className="cv-image-metadata">
              <span className="cv-image-filename">{item.content}</span>
              <span className="cv-image-specs">
                {item.dimensions ? `${item.dimensions.width}×${item.dimensions.height} px` : "Image"}
                {item.byteSize ? ` • ${Math.round(item.byteSize / 1024)} KB` : ""}
              </span>
              <button
                type="button"
                className="cv-btn cv-btn-secondary cv-preview-thumb-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPreview?.(item);
                }}
                aria-label="Open image preview"
                title="Preview full image"
              >
                👁️ Preview
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`cv-card-scroll-box ${isDragging ? "dragging" : ""}`}
            tabIndex={0}
            role="region"
            aria-label="Scrollable text content (draggable to external fields)"
            draggable="true"
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={(e) => {
              // Allow user to select/scroll text inside the box without toggling card selection
              e.stopPropagation();
            }}
            title="Drag and drop into form fields, inputs, or other windows"
          >
            {item.contentType === "code" ? (
              <pre
                className="cv-code-preview"
                draggable="true"
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                title="Drag and drop code into any field"
              >
                <code>{item.content}</code>
              </pre>
            ) : item.contentType === "link" ? (
              <div
                className="cv-link-preview"
                draggable="true"
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                title="Drag and drop link into any field"
              >
                <a
                  href={item.content.startsWith("http://") || item.content.startsWith("https://") ? item.content : `https://${item.content}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cv-link-anchor"
                  onClick={(e) => e.stopPropagation()}
                >
                  🔗 {item.content}
                </a>
              </div>
            ) : (
              <div
                className="cv-text-preview"
                draggable="true"
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                title="Drag and drop text into any form field or window"
              >
                {item.content}
              </div>
            )}
          </div>
        )}

        {/* Card Footer Metadata */}
        <div className="cv-card-footer">
          <span className="cv-meta-metric">
            {item.charCount ? `${item.charCount} chars` : `${item.content.length} chars`}
          </span>
          {item.copyCount > 1 && (
            <span className="cv-meta-copies" title={`Copied ${item.copyCount} times`}>
              Used {item.copyCount}×
            </span>
          )}
        </div>
      </div>

      {/* Card Action Buttons (Hover / Focus visible) */}
      <div className="cv-card-actions">
        {item.contentType === "image" && (
          <button
            type="button"
            className="cv-card-action-btn preview"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPreview?.(item);
            }}
            aria-label="Preview image"
            title="Preview"
          >
            👁️
          </button>
        )}
        <button
          type="button"
          className={`cv-card-action-btn ${item.pinned ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(e);
          }}
          aria-label={item.pinned ? "Unpin item" : "Pin item to top"}
          title={item.pinned ? "Unpin" : "Pin"}
        >
          📌
        </button>
        <button
          type="button"
          className="cv-card-action-btn delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(e);
          }}
          aria-label="Delete item from history"
          title="Delete"
        >
          🗑️
        </button>
      </div>
    </article>
  );
};

const areClipboardCardPropsEqual = (
  prevProps: ClipboardCardProps,
  nextProps: ClipboardCardProps
): boolean => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.content === nextProps.item.content &&
    prevProps.item.pinned === nextProps.item.pinned &&
    prevProps.item.copyCount === nextProps.item.copyCount &&
    prevProps.item.capturedAt === nextProps.item.capturedAt &&
    prevProps.item.thumbnailUrl === nextProps.item.thumbnailUrl &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.selectionOrder === nextProps.selectionOrder &&
    prevProps.isFocused === nextProps.isFocused &&
    prevProps.onOpenPreview === nextProps.onOpenPreview
  );
};

export const ClipboardCard = React.memo(ClipboardCardComponent, areClipboardCardPropsEqual);
