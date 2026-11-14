import React, { useEffect, useRef, useState } from "react";
import { ClipboardItem } from "../types/clipboard.ts";
import { getMediaData } from "../api/vault.ts";

interface ImagePreviewModalProps {
  item: ClipboardItem | null;
  onClose: () => void;
  onCopyImage: (item: ClipboardItem) => Promise<void>;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  item,
  onClose,
  onCopyImage,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [highResUrl, setHighResUrl] = useState<string | null>(null);
  const [isLoadingHighRes, setIsLoadingHighRes] = useState(false);

  // Focus trap & Escape key listener
  useEffect(() => {
    if (!item) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

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
  }, [item, onClose]);

  // Load high-resolution media data on mount if available
  useEffect(() => {
    if (!item) {
      setHighResUrl(null);
      return;
    }

    if (item.thumbnailUrl) {
      setHighResUrl(item.thumbnailUrl);
    }

    let isCancelled = false;
    if (item.mediaPath) {
      setIsLoadingHighRes(true);
      getMediaData(item.id)
        .then((res) => {
          if (!isCancelled && res.data_url) {
            setHighResUrl(res.data_url);
          }
        })
        .catch(() => {
          // Graceful fallback to thumbnail
        })
        .finally(() => {
          if (!isCancelled) setIsLoadingHighRes(false);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [item]);

  if (!item) return null;

  const handleCopy = async () => {
    try {
      await onCopyImage(item);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch {
      // Handled by parent status message
    }
  };

  const imageSrc = highResUrl || item.thumbnailUrl;

  return (
    <div
      className="cv-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-preview-modal-title"
    >
      <div
        className="cv-modal cv-image-preview-modal"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="cv-modal-header">
          <div className="cv-modal-title-group">
            <span className="cv-badge cv-badge-image">🖼️ IMAGE PREVIEW</span>
            <h2 id="image-preview-modal-title" className="cv-modal-title">
              Image Preview: {item.content || "Copied Media"}
            </h2>
          </div>
          <button
            type="button"
            className="cv-modal-close-btn"
            onClick={onClose}
            aria-label="Close image preview"
          >
            ✕
          </button>
        </div>

        {/* Image Display Surface */}
        <div className="cv-image-preview-canvas" aria-label="Full-size image view">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={item.previewText || "Copied media full preview"}
              className="cv-image-preview-full"
            />
          ) : (
            <div className="cv-image-preview-empty">
              <svg
                width="64"
                height="64"
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
              <span>Image preview not available</span>
            </div>
          )}
          {isLoadingHighRes && (
            <div className="cv-image-preview-loading" aria-live="polite">
              Loading high-resolution media…
            </div>
          )}
        </div>

        {/* Image Metadata Strip */}
        <div className="cv-image-preview-meta-bar">
          <div className="cv-image-preview-stats">
            {item.dimensions && (
              <span className="cv-meta-pill">
                📐 {item.dimensions.width} × {item.dimensions.height} px
              </span>
            )}
            {item.byteSize ? (
              <span className="cv-meta-pill">
                💾 {Math.round(item.byteSize / 1024)} KB
              </span>
            ) : null}
            {item.sourceApp && (
              <span className="cv-meta-pill">
                📱 {item.sourceApp}
              </span>
            )}
            <span className="cv-meta-pill">
              🕒 {new Date(item.capturedAt).toLocaleTimeString()}
            </span>
          </div>

          <div className="cv-image-preview-actions">
            <button
              type="button"
              className="cv-btn cv-btn-primary"
              onClick={handleCopy}
              aria-label="Copy image back to clipboard"
            >
              {copySuccess ? "✓ Copied Image!" : "📋 Copy Image"}
            </button>
            <button
              type="button"
              className="cv-btn cv-btn-secondary"
              onClick={onClose}
              aria-label="Close modal"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
