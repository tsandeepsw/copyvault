import React from "react";
import { PrivacyDiagnostics, PrivacySettings } from "../types/clipboard.ts";

interface PrivacyViewProps {
  privacySettings?: PrivacySettings;
  diagnostics?: PrivacyDiagnostics | null;
  onUpdatePrivacySettings?: (settings: Partial<PrivacySettings>) => Promise<void>;
  onClearHistory?: (keepPinned: boolean) => Promise<void>;
}

export const PrivacyView: React.FC<PrivacyViewProps> = ({
  privacySettings,
  diagnostics,
  onUpdatePrivacySettings,
  onClearHistory,
}) => {
  return (
    <div className="cv-content-view" role="region" aria-label="Privacy Policy and Local Data Protection">
      <div className="cv-view-header">
        <div className="cv-view-header-title-group">
          <span className="cv-view-header-icon" aria-hidden="true">🔒</span>
          <div>
            <h2 className="cv-view-header-title">Privacy Policy</h2>
            <p className="cv-view-header-subtitle">
              Strictly local-first, zero-telemetry, and offline clipboard storage.
            </p>
          </div>
        </div>
      </div>

      <div className="cv-view-scrollable">
        <div className="cv-about-card">
          <div className="cv-about-badge-row">
            <span className="cv-badge cv-badge-success">✓ 100% Offline</span>
            <span className="cv-badge cv-badge-success">✓ Zero Telemetry</span>
            <span className="cv-badge cv-badge-success">✓ No Remote Tracking</span>
            <span className="cv-badge cv-badge-success">✓ Local SQLite Only</span>
          </div>

          <h3 className="cv-about-heading">Privacy-First Architecture</h3>
          <p className="cv-about-paragraph">
            CopyVault is engineered with an uncompromising commitment to privacy.
            Your copied text, code snippets, sensitive passwords, form data, and images are stored
            <strong> solely on your local computer</strong> inside an embedded SQLite database.
            No data is ever sent across any network.
          </p>

          <div className="cv-about-features-grid">
            <div className="cv-about-feature-box">
              <span className="cv-about-feature-icon" aria-hidden="true">🚫</span>
              <div>
                <strong>Zero Analytics & Telemetry</strong>
                <p>No Google Analytics, no telemetry trackers, no crash reporting beacons, and no network pingbacks. Ever.</p>
              </div>
            </div>

            <div className="cv-about-feature-box">
              <span className="cv-about-feature-icon" aria-hidden="true">🛡️</span>
              <div>
                <strong>Password Manager Protection</strong>
                <p>
                  Automatically honors OS concealment flags (such as <code>org.nspasteboard.ConcealedType</code>)
                  from password managers like 1Password, Bitwarden, KeePassXC, and Apple Keychain.
                </p>
              </div>
            </div>

            <div className="cv-about-feature-box">
              <span className="cv-about-feature-icon" aria-hidden="true">⏸️</span>
              <div>
                <strong>Pause Capture Anytime</strong>
                <p>
                  Pause monitoring whenever you copy sensitive API tokens or passwords. Turning recording back on
                  will never retroactively capture what you copied while paused.
                </p>
              </div>
            </div>

            <div className="cv-about-feature-box">
              <span className="cv-about-feature-icon" aria-hidden="true">🧹</span>
              <div>
                <strong>Complete Local Data Purge</strong>
                <p>
                  You retain complete control of your data. You can delete individual clippings or wipe the entire database
                  with a single click at any time.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Live Diagnostics Card */}
        {diagnostics && (
          <div className="cv-about-card" style={{ marginTop: "1rem" }}>
            <h3 className="cv-about-heading">Local Storage Diagnostics</h3>
            <div className="cv-privacy-stat-grid">
              <div className="cv-privacy-stat-card">
                <span className="cv-privacy-stat-label">Total Clippings</span>
                <span className="cv-privacy-stat-val">{diagnostics.total_items_count}</span>
              </div>
              <div className="cv-privacy-stat-card">
                <span className="cv-privacy-stat-label">Pinned Snippets</span>
                <span className="cv-privacy-stat-val">{diagnostics.pinned_items_count}</span>
              </div>
              <div className="cv-privacy-stat-card">
                <span className="cv-privacy-stat-label">Cached Images</span>
                <span className="cv-privacy-stat-val">{diagnostics.media_items_count}</span>
              </div>
              <div className="cv-privacy-stat-card">
                <span className="cv-privacy-stat-label">Database Size</span>
                <span className="cv-privacy-stat-val">
                  {(diagnostics.db_size_bytes / 1024).toFixed(1)} KB
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Quick Privacy Actions */}
        <div className="cv-about-card" style={{ marginTop: "1rem" }}>
          <h3 className="cv-about-heading">Quick Privacy Actions</h3>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
            {privacySettings && onUpdatePrivacySettings && (
              <button
                type="button"
                className={`cv-btn ${privacySettings.pause_monitoring ? "cv-btn-primary" : "cv-btn-secondary"}`}
                onClick={() =>
                  onUpdatePrivacySettings({
                    pause_monitoring: !privacySettings.pause_monitoring,
                  })
                }
              >
                {privacySettings.pause_monitoring ? "▶ Resume Recording" : "⏸ Pause Recording"}
              </button>
            )}

            {onClearHistory && (
              <button
                type="button"
                className="cv-btn cv-btn-danger"
                onClick={() => onClearHistory(true)}
              >
                🗑 Clear History (Keep Pinned)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

