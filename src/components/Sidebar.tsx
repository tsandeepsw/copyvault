import React from "react";
import { SidebarView } from "../types/clipboard.ts";

interface SidebarProps {
  activeView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  totalCount: number;
  pinnedCount: number;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  totalCount,
  pinnedCount,
  theme,
  onToggleTheme,
  onOpenSettings,
}) => {
  return (
    <aside className="cv-sidebar" role="navigation" aria-label="Vault navigation">
      <div className="cv-sidebar-top">
        <div className="cv-brand" aria-label="CopyVault">
          <img src="/logo.png" alt="CopyVault Logo" className="cv-logo-img" />
          <div className="cv-brand-text">
            <span className="cv-brand-name">CopyVault</span>
            <span className="cv-brand-tag">Local Vault</span>
          </div>
        </div>

        <nav className="cv-nav-list" aria-label="History categories">
          <button
            type="button"
            className={`cv-nav-item ${activeView === "history" ? "active" : ""}`}
            onClick={() => onViewChange("history")}
            aria-current={activeView === "history" ? "page" : undefined}
          >
            <span className="cv-nav-icon" aria-hidden="true">📋</span>
            <span className="cv-nav-label">All History</span>
            <span className="cv-nav-badge" aria-label={`${totalCount} total items`}>
              {totalCount}
            </span>
          </button>

          <button
            type="button"
            className={`cv-nav-item ${activeView === "pinned" ? "active" : ""}`}
            onClick={() => onViewChange("pinned")}
            aria-current={activeView === "pinned" ? "page" : undefined}
          >
            <span className="cv-nav-icon" aria-hidden="true">📌</span>
            <span className="cv-nav-label">Pinned</span>
            <span className="cv-nav-badge" aria-label={`${pinnedCount} pinned items`}>
              {pinnedCount}
            </span>
          </button>

          <button
            type="button"
            className={`cv-nav-item ${activeView === "snippets" ? "active" : ""}`}
            onClick={() => onViewChange("snippets")}
            aria-current={activeView === "snippets" ? "page" : undefined}
          >
            <span className="cv-nav-icon" aria-hidden="true">📑</span>
            <span className="cv-nav-label">Snippets & Templates</span>
          </button>

          <button
            type="button"
            className={`cv-nav-item ${activeView === "sequences" ? "active" : ""}`}
            onClick={() => onViewChange("sequences")}
            aria-current={activeView === "sequences" ? "page" : undefined}
          >
            <span className="cv-nav-icon" aria-hidden="true">🔁</span>
            <span className="cv-nav-label">Paste Sequences</span>
          </button>
        </nav>
      </div>

      <div className="cv-sidebar-bottom">
        <div className="cv-sidebar-actions">
          <button
            type="button"
            className="cv-sidebar-action-btn"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </button>

          <button
            type="button"
            className="cv-sidebar-action-btn"
            onClick={onOpenSettings}
            aria-label="Open CopyVault Settings"
          >
            <span aria-hidden="true">⚙️</span>
            <span>Settings</span>
          </button>

          <button
            type="button"
            className={`cv-sidebar-action-btn ${activeView === "about" ? "active" : ""}`}
            onClick={() => onViewChange("about")}
            aria-label="Open About CopyVault"
            aria-current={activeView === "about" ? "page" : undefined}
          >
            <span aria-hidden="true">💡</span>
            <span>About</span>
          </button>
        </div>

        <div
          className={`cv-privacy-pill ${activeView === "privacy" ? "active" : ""}`}
          title="Click to view Privacy Policy (100% offline, zero-telemetry)"
          onClick={() => onViewChange("privacy")}
          style={{ cursor: "pointer" }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onViewChange("privacy");
            }
          }}
          aria-label="View Privacy Policy"
        >
          <span className="cv-privacy-dot" aria-hidden="true" />
          <span>Local Storage Only</span>
        </div>
      </div>
    </aside>
  );
};
