import React from "react";

interface EmptyStateProps {
  type: "empty" | "loading" | "no-results" | "error";
  searchQuery?: string;
  onClearSearch?: () => void;
  onRetry?: () => void;
  onAddTestItem?: () => void;
  errorMessage?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  type,
  searchQuery,
  onClearSearch,
  onRetry,
  onAddTestItem,
  errorMessage,
}) => {
  if (type === "loading") {
    return (
      <div className="cv-state-container loading" role="status" aria-live="polite">
        <div className="cv-spinner" aria-hidden="true" />
        <h3 className="cv-state-title">Loading clipboard vault...</h3>
        <p className="cv-state-desc">Scanning local SQLite indices and cache.</p>
      </div>
    );
  }

  if (type === "error") {
    return (
      <div className="cv-state-container error" role="alert">
        <div className="cv-state-icon error" aria-hidden="true">⚠️</div>
        <h3 className="cv-state-title">Unable to Connect to Clipboard Service</h3>
        <p className="cv-state-desc">
          {errorMessage || "An unexpected error occurred while communicating with the background listener."}
        </p>
        <p className="cv-state-recovery-tip" style={{ fontSize: "12px", color: "var(--cv-text-secondary)", marginTop: "0.5rem", maxWidth: "420px" }}>
          <strong>Recovery steps:</strong> Ensure CopyVault background process is running and local storage file permissions are intact. Then click retry below.
        </p>
        {onRetry && (
          <button type="button" className="cv-btn cv-btn-primary" onClick={onRetry} style={{ marginTop: "0.75rem" }}>
            🔄 Try Reconnecting
          </button>
        )}
      </div>
    );
  }

  if (type === "no-results") {
    return (
      <div className="cv-state-container no-results" role="status">
        <div className="cv-state-icon" aria-hidden="true">🔍</div>
        <h3 className="cv-state-title">No matching clipboard items</h3>
        <p className="cv-state-desc">
          {searchQuery
            ? `No records found matching "${searchQuery}". Try a different term or adjust the format filter.`
            : "No items match the currently selected filter."}
        </p>
        {onClearSearch && searchQuery && (
          <button type="button" className="cv-btn cv-btn-secondary" onClick={onClearSearch}>
            Clear Search Filter
          </button>
        )}
      </div>
    );
  }

  // Default: Initial Genuine Empty State
  return (
    <div className="cv-state-container empty" role="status">
      <div className="cv-state-icon" aria-hidden="true">📋</div>
      <h3 className="cv-state-title">Clipboard History is Empty</h3>
      <p className="cv-state-desc">
        Copy text, code, links, or images anywhere on your desktop. They will automatically be encrypted and saved locally in your vault.
      </p>
      {onAddTestItem && (
        <button type="button" className="cv-btn cv-btn-primary" onClick={onAddTestItem}>
          + Add Clipboard Item
        </button>
      )}
    </div>
  );
};
