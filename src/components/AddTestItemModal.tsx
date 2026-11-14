import React, { useState, useEffect, useRef } from "react";
import { ClipboardContentType, ClipboardItem } from "../types/clipboard.ts";

interface AddTestItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: (item: ClipboardItem) => void;
}

export const AddTestItemModal: React.FC<AddTestItemModalProps> = ({
  isOpen,
  onClose,
  onAddItem,
}) => {
  const [contentType, setContentType] = useState<ClipboardContentType>("text");
  const [content, setContent] = useState("");
  const [sourceApp, setSourceApp] = useState("VSCode");
  const [pinned, setPinned] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setContent("");
      setContentType("text");
      setSelectedFile(null);
      setImagePreviewUrl(null);
      setImageDimensions(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/") && !file.name.match(/\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i)) {
      return;
    }
    setSelectedFile(file);
    setContent(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreviewUrl(dataUrl);
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalContent = content.trim() || (selectedFile?.name ?? "");
    if (!finalContent && !imagePreviewUrl) return;

    const isImg = contentType === "image";
    const newItem: ClipboardItem = {
      id: "item-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      contentType,
      content: finalContent || (isImg ? "Copied Image.png" : "Untitled"),
      thumbnailUrl: imagePreviewUrl || undefined,
      sourceApp: sourceApp || undefined,
      capturedAt: Date.now(),
      copyCount: 1,
      pinned,
      charCount: finalContent.length,
      lineCount: isImg ? 1 : finalContent.split("\n").length,
      dimensions: imageDimensions || (isImg ? { width: 1440, height: 900 } : undefined),
      byteSize: selectedFile?.size || (isImg ? 320 * 1024 : finalContent.length),
    };

    onAddItem(newItem);
    onClose();
  };

  const isSubmitDisabled = contentType === "image" 
    ? !content.trim() && !imagePreviewUrl
    : !content.trim();

  return (
    <div className="cv-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="cv-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-item-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cv-modal-header">
          <div className="cv-modal-title-group">
            <span aria-hidden="true">➕</span>
            <h2 id="add-item-dialog-title" className="cv-modal-title">
              Add Clipboard Item
            </h2>
          </div>
          <button
            type="button"
            className="cv-modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="cv-modal-body">
            <div className="cv-form-group">
              <label htmlFor="content-type-select" className="cv-form-label">
                Content Format
              </label>
              <select
                id="content-type-select"
                className="cv-select-field"
                value={contentType}
                onChange={(e) => {
                  const newType = e.target.value as ClipboardContentType;
                  setContentType(newType);
                  if (newType !== "image") {
                    setSelectedFile(null);
                    setImagePreviewUrl(null);
                    setImageDimensions(null);
                  }
                }}
              >
                <option value="text">📝 Plain Text / Note</option>
                <option value="code">💻 Code Snippet</option>
                <option value="link">🔗 Web URL Link</option>
                <option value="image">🖼️ Image / Screenshot</option>
              </select>
            </div>

            {contentType === "image" ? (
              <div className="cv-form-group">
                <label className="cv-form-label">Choose Image File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp,image/svg+xml"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />

                {imagePreviewUrl ? (
                  <div className="cv-upload-preview-container">
                    <img
                      src={imagePreviewUrl}
                      alt="Selected preview"
                      className="cv-upload-preview-thumb"
                    />
                    <div className="cv-upload-preview-meta">
                      <div className="cv-upload-preview-title">
                        {content || selectedFile?.name || "image.png"}
                      </div>
                      <div className="cv-upload-preview-sub">
                        {imageDimensions ? `${imageDimensions.width} × ${imageDimensions.height} px` : "Image"}
                        {selectedFile ? ` • ${Math.round(selectedFile.size / 1024)} KB` : ""}
                      </div>
                      <button
                        type="button"
                        className="cv-btn cv-btn-secondary cv-upload-reselect-btn"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        📁 Choose Different Image...
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="cv-image-upload-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleFile(e.dataTransfer.files[0]);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                  >
                    <div className="cv-upload-dropzone-icon">🖼️</div>
                    <div className="cv-upload-dropzone-text">
                      Click to browse image or drag and drop here
                    </div>
                    <div className="cv-upload-dropzone-sub">
                      Supports PNG, JPEG, WebP, GIF, SVG, BMP
                    </div>
                  </div>
                )}

                <div style={{ marginTop: "10px" }}>
                  <label htmlFor="content-textarea" className="cv-form-label">
                    Image Filename / Description
                  </label>
                  <input
                    id="content-textarea"
                    type="text"
                    className="cv-input-field"
                    placeholder="screenshot_2026-10-29.png"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="cv-form-group">
                <label htmlFor="content-textarea" className="cv-form-label">
                  {contentType === "code"
                    ? "Code Block"
                    : contentType === "link"
                    ? "Web URL Link"
                    : "Content Text"}
                </label>
                <textarea
                  id="content-textarea"
                  className="cv-textarea-field"
                  rows={4}
                  placeholder={
                    contentType === "code"
                      ? 'git commit -m "feat: initial release"'
                      : contentType === "link"
                      ? "https://copyvault.app/docs"
                      : "Enter sample clipboard text..."
                  }
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="cv-form-group">
              <label htmlFor="source-app-input" className="cv-form-label">
                Source Application (Optional)
              </label>
              <input
                id="source-app-input"
                type="text"
                className="cv-input-field"
                placeholder="e.g. VSCode, Slack, Safari, Terminal"
                value={sourceApp}
                onChange={(e) => setSourceApp(e.target.value)}
              />
            </div>

            <div className="cv-form-checkbox-row">
              <label className="cv-checkbox-label">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                />
                <span>Pin to top immediately</span>
              </label>
            </div>
          </div>

          <div className="cv-modal-footer">
            <button type="button" className="cv-btn cv-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="cv-btn cv-btn-primary"
              disabled={isSubmitDisabled}
            >
              Add to History
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
