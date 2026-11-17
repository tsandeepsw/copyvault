import React, { useEffect, useRef, useState } from "react";
import { DesktopSettings, PrivacyDiagnostics, PrivacySettings } from "../types/clipboard.ts";
import { exportVaultData, importVaultData, openExternalUrl } from "../api/vault";
import { safeConfirm } from "../utils/confirm.ts";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  retentionDays: number;
  onRetentionChange: (days: number) => void;
  maxCapacity: number;
  onCapacityChange: (cap: number) => void;
  privacyConcealmentEnabled: boolean;
  onTogglePrivacyConcealment: () => void;
  desktopSettings?: DesktopSettings;
  onUpdateDesktopSettings?: (settings: DesktopSettings) => Promise<void>;
  privacySettings?: PrivacySettings;
  onUpdatePrivacySettings?: (settings: Partial<PrivacySettings>) => Promise<void>;
  diagnostics?: PrivacyDiagnostics | null;
  onClearHistory?: (keepPinned: boolean) => Promise<void>;
  onRunRetentionCleanup?: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  retentionDays,
  onRetentionChange,
  maxCapacity,
  onCapacityChange,
  privacyConcealmentEnabled,
  onTogglePrivacyConcealment,
  desktopSettings,
  onUpdateDesktopSettings,
  privacySettings,
  onUpdatePrivacySettings,
  diagnostics,
  onClearHistory,
  onRunRetentionCleanup,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [newExclusionInput, setNewExclusionInput] = useState("");
  const [shortcutInput, setShortcutInput] = useState(
    desktopSettings?.global_shortcut || "Cmd+Shift+V"
  );
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportVaultData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `copyvault-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert("Failed to export vault: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus(null);
    setImportError(null);

    try {
      const text = await file.text();
      const res = await importVaultData(text, importMode);
      setImportStatus(
        `✓ Restored: ${res.items_imported} items, ${res.snippets_imported} snippets, ${res.collections_imported} collections, ${res.tags_imported} tags, ${res.sequences_imported} sequences.`
      );
    } catch (err: unknown) {
      setImportError(
        "Import failed: " + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  useEffect(() => {
    if (desktopSettings) {
      setShortcutInput(desktopSettings.global_shortcut);
    }
  }, [desktopSettings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
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
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleShortcutBlur = async () => {
    if (!desktopSettings || !onUpdateDesktopSettings) return;
    const trimmed = shortcutInput.trim();
    if (!trimmed) {
      setShortcutError("Shortcut cannot be empty");
      return;
    }
    // Prevent standard system hotkey conflicts
    const lower = trimmed.toLowerCase();
    if (lower === "cmd+c" || lower === "cmd+v" || lower === "ctrl+c" || lower === "ctrl+v") {
      setShortcutError("Conflicts with OS clipboard shortcut");
      return;
    }
    try {
      setShortcutError(null);
      await onUpdateDesktopSettings({
        ...desktopSettings,
        global_shortcut: trimmed,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setShortcutError(msg);
    }
  };

  return (
    <div className="cv-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="cv-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cv-modal-header">
          <div className="cv-modal-title-group">
            <span aria-hidden="true">⚙️</span>
            <h2 id="settings-dialog-title" className="cv-modal-title">
              CopyVault Settings
            </h2>
          </div>
          <button
            type="button"
            className="cv-modal-close-btn"
            onClick={onClose}
            aria-label="Close Settings modal"
          >
            ✕
          </button>
        </div>

        <div className="cv-modal-body">
          {/* Desktop & Hotkey Integration */}
          {desktopSettings && onUpdateDesktopSettings && (
            <section className="cv-settings-section">
              <h3 className="cv-settings-section-title">Desktop & Quick Panel Integration</h3>
              <div className="cv-settings-row">
                <div className="cv-settings-row-text">
                  <label htmlFor="global-shortcut-input" className="cv-settings-row-label">
                    Global Shortcut
                  </label>
                  <span className="cv-settings-row-desc">
                    Summons the CopyVault quick panel instantly from any desktop context.
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                  <input
                    id="global-shortcut-input"
                    type="text"
                    className="cv-input"
                    style={{ width: "140px", textAlign: "center", fontWeight: 600 }}
                    value={shortcutInput}
                    onChange={(e) => {
                      setShortcutInput(e.target.value);
                      setShortcutError(null);
                    }}
                    onBlur={handleShortcutBlur}
                    placeholder="Cmd+Shift+V"
                    aria-label="Global quick panel shortcut"
                  />
                  {shortcutError && (
                    <span style={{ fontSize: "11px", color: "var(--cv-color-danger)" }}>
                      {shortcutError}
                    </span>
                  )}
                </div>
              </div>

              <div className="cv-settings-row">
                <div className="cv-settings-row-text">
                  <span className="cv-settings-row-label">Launch at Login</span>
                  <span className="cv-settings-row-desc">
                    Starts CopyVault silently in the background when logging into your desktop (opt-in only).
                  </span>
                </div>
                <input
                  type="checkbox"
                  id="autostart-toggle"
                  className="cv-toggle-checkbox"
                  checked={desktopSettings.launch_at_login}
                  onChange={(e) =>
                    onUpdateDesktopSettings({
                      ...desktopSettings,
                      launch_at_login: e.target.checked,
                    })
                  }
                  aria-label="Launch CopyVault at login"
                />
              </div>

              <div className="cv-settings-row">
                <div className="cv-settings-row-text">
                  <span className="cv-settings-row-label">Auto-hide on Focus Loss</span>
                  <span className="cv-settings-row-desc">
                    Automatically closes the quick panel launcher when clicking outside or switching applications.
                  </span>
                </div>
                <input
                  type="checkbox"
                  id="autohide-toggle"
                  className="cv-toggle-checkbox"
                  checked={desktopSettings.auto_hide_on_blur}
                  onChange={(e) =>
                    onUpdateDesktopSettings({
                      ...desktopSettings,
                      auto_hide_on_blur: e.target.checked,
                    })
                  }
                  aria-label="Auto hide on blur"
                />
              </div>

              <div className="cv-settings-row">
                <div className="cv-settings-row-text">
                  <span className="cv-settings-row-label">Compact Density Mode</span>
                  <span className="cv-settings-row-desc">
                    Reduces card height to 38px to display 10+ items at once in the quick panel.
                  </span>
                </div>
                <input
                  type="checkbox"
                  id="density-toggle"
                  className="cv-toggle-checkbox"
                  checked={desktopSettings.compact_density}
                  onChange={(e) =>
                    onUpdateDesktopSettings({
                      ...desktopSettings,
                      compact_density: e.target.checked,
                    })
                  }
                  aria-label="Enable compact density mode"
                />
              </div>
            </section>
          )}

          {/* Privacy Section */}
          <section className="cv-settings-section">
            <h3 className="cv-settings-section-title">Privacy & Secret Concealment</h3>

            {/* Pause/Resume Monitoring Toggle */}
            {privacySettings && onUpdatePrivacySettings && (
              <div className="cv-settings-row">
                <div className="cv-settings-row-text">
                  <span className="cv-settings-row-label">
                    Clipboard Ingestion Status: {privacySettings.pause_monitoring ? "⏸ Paused" : "🟢 Active"}
                  </span>
                  <span className="cv-settings-row-desc">
                    Temporarily suspend clipboard capture. When paused, zero copies touch memory or SQLite.
                  </span>
                </div>
                <button
                  type="button"
                  className={`cv-btn ${privacySettings.pause_monitoring ? "cv-btn-primary" : "cv-btn-secondary"}`}
                  onClick={() =>
                    onUpdatePrivacySettings({
                      pause_monitoring: !privacySettings.pause_monitoring,
                    })
                  }
                  aria-label={privacySettings.pause_monitoring ? "Resume clipboard capture" : "Pause clipboard capture"}
                >
                  {privacySettings.pause_monitoring ? "Resume Capture" : "Pause Capture"}
                </button>
              </div>
            )}

            <div className="cv-settings-row">
              <div className="cv-settings-row-text">
                <span className="cv-settings-row-label">Password Manager Flags Exclusion</span>
                <span className="cv-settings-row-desc">
                  Automatically suppress copies flagged with OS concealed/transient flags (1Password, Bitwarden, KeePassXC).
                </span>
              </div>
              <input
                type="checkbox"
                id="privacy-toggle"
                className="cv-toggle-checkbox"
                checked={privacyConcealmentEnabled}
                onChange={onTogglePrivacyConcealment}
                aria-label="Enable password manager exclusion"
              />
            </div>

            {/* Heuristic Sensitive Content Policy */}
            {privacySettings && onUpdatePrivacySettings && (
              <div className="cv-settings-row">
                <div className="cv-settings-row-text">
                  <span className="cv-settings-row-label">Heuristic Sensitive-Content Filter</span>
                  <span className="cv-settings-row-desc">
                    Skip capturing private keys, cloud tokens (AKIA), and standalone 6–8 digit one-time codes (OTPs).
                    <strong style={{ display: "block", marginTop: "2px", color: "var(--cv-color-warning)" }}>
                      ⚠️ Notice: Automatic detection is inherently heuristic and incomplete. Do not treat as an absolute boundary.
                    </strong>
                  </span>
                </div>
                <input
                  type="checkbox"
                  id="heuristics-toggle"
                  className="cv-toggle-checkbox"
                  checked={privacySettings.skip_confidential_heuristics}
                  onChange={(e) =>
                    onUpdatePrivacySettings({
                      skip_confidential_heuristics: e.target.checked,
                    })
                  }
                  aria-label="Filter sensitive credentials and one-time codes"
                />
              </div>
            )}

            {/* Application Exclusions */}
            {privacySettings && onUpdatePrivacySettings && (
              <div style={{ marginTop: "0.75rem" }}>
                <div className="cv-settings-row-text" style={{ marginBottom: "6px" }}>
                  <span className="cv-settings-row-label">Excluded Applications</span>
                  <span className="cv-settings-row-desc">
                    Copies from these applications or bundle IDs are discarded prior to reading payload contents.
                  </span>
                  {!privacySettings.platform_supports_app_identification && (
                    <span style={{ fontSize: "11px", color: "var(--cv-color-danger)", marginTop: "2px" }}>
                      ⚠️ Note: Your current operating system environment does not reliably expose the source application bundle ID. Application exclusions cannot be fully enforced on this platform.
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                  {privacySettings.app_exclusions.map((app) => (
                    <span
                      key={app}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "2px 8px",
                        background: "var(--cv-bg-elevated)",
                        border: "1px solid var(--cv-border-default)",
                        borderRadius: "var(--cv-radius-sm)",
                        fontSize: "12px",
                      }}
                    >
                      {app}
                      <button
                        type="button"
                        style={{ border: "none", background: "none", cursor: "pointer", color: "var(--cv-text-muted)" }}
                        onClick={() => {
                          const updated = privacySettings.app_exclusions.filter((x) => x !== app);
                          onUpdatePrivacySettings({ app_exclusions: updated });
                        }}
                        aria-label={`Remove exclusion ${app}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    className="cv-input"
                    style={{ flex: 1, padding: "4px 8px", fontSize: "12px" }}
                    placeholder="e.g. 1Password, com.agilebits, Terminal"
                    value={newExclusionInput}
                    onChange={(e) => setNewExclusionInput(e.target.value)}
                    aria-label="Add application name or bundle ID to exclusion list"
                  />
                  <button
                    type="button"
                    className="cv-btn cv-btn-secondary"
                    style={{ padding: "4px 12px", fontSize: "12px" }}
                    onClick={() => {
                      const trimmed = newExclusionInput.trim();
                      if (trimmed && !privacySettings.app_exclusions.includes(trimmed)) {
                        onUpdatePrivacySettings({
                          app_exclusions: [...privacySettings.app_exclusions, trimmed],
                        });
                        setNewExclusionInput("");
                      }
                    }}
                    aria-label="Add app to exclusion list"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Retention & Storage Section */}
          <section className="cv-settings-section">
            <h3 className="cv-settings-section-title">Storage & Retention Limits</h3>
            <div className="cv-settings-row">
              <div className="cv-settings-row-text">
                <label htmlFor="retention-select" className="cv-settings-row-label">
                  History Retention Period
                </label>
                <span className="cv-settings-row-desc">
                  Unpinned items older than this period are automatically pruned.
                </span>
              </div>
              <select
                id="retention-select"
                className="cv-select-field"
                value={retentionDays}
                onChange={(e) => onRetentionChange(Number(e.target.value))}
              >
                <option value={7}>7 Days</option>
                <option value={30}>30 Days</option>
                <option value={90}>90 Days</option>
                <option value={365}>1 Year</option>
                <option value={0}>Forever (No time limit)</option>
              </select>
            </div>

            <div className="cv-settings-row">
              <div className="cv-settings-row-text">
                <label htmlFor="capacity-select" className="cv-settings-row-label">
                  Maximum History Items
                </label>
                <span className="cv-settings-row-desc">
                  Maximum number of unpinned entries to keep in SQLite database.
                </span>
              </div>
              <select
                id="capacity-select"
                className="cv-select-field"
                value={maxCapacity}
                onChange={(e) => onCapacityChange(Number(e.target.value))}
              >
                <option value={500}>500 Items</option>
                <option value={1000}>1,000 Items</option>
                <option value={5000}>5,000 Items</option>
                <option value={10000}>10,000 Items</option>
              </select>
            </div>

            {onRunRetentionCleanup && (
              <div className="cv-settings-row" style={{ marginTop: "0.5rem" }}>
                <div className="cv-settings-row-text">
                  <span className="cv-settings-row-label">Prune & Vacuum Storage</span>
                  <span className="cv-settings-row-desc">
                    Immediately prune unpinned items beyond retention limits and defragment SQLite database.
                  </span>
                </div>
                <button
                  type="button"
                  className="cv-btn cv-btn-secondary"
                  disabled={isCleaning}
                  onClick={async () => {
                    setIsCleaning(true);
                    try {
                      await onRunRetentionCleanup();
                    } finally {
                      setIsCleaning(false);
                    }
                  }}
                  aria-label="Run retention cleanup now"
                >
                  {isCleaning ? "Pruning..." : "Run Cleanup Now"}
                </button>
              </div>
            )}
          </section>

          {/* Storage Cleanup & Diagnostics Section */}
          <section className="cv-settings-section">
            <h3 className="cv-settings-section-title">Local Storage & Privacy Diagnostics</h3>

            <div style={{ fontSize: "12px", color: "var(--cv-text-secondary)", lineHeight: "1.5", marginBottom: "8px" }}>
              <p>
                <strong>Where is your data stored?</strong> All clipboard history is stored exclusively on this device:
              </p>
              <ul style={{ paddingLeft: "1.2rem", margin: "4px 0" }}>
                <li>SQLite Database: <code>{diagnostics?.db_path || "copyvault.db"}</code></li>
                <li>Media Directory: <code>{diagnostics?.media_dir || "media/"}</code></li>
              </ul>
              <p style={{ marginTop: "4px" }}>
                CopyVault has zero cloud connections, zero telemetry, and zero remote synchronization.
              </p>
              <div style={{ marginTop: "6px", padding: "6px 8px", background: "var(--cv-bg-elevated)", borderRadius: "var(--cv-radius-sm)", fontSize: "11px", color: "var(--cv-text-muted)" }}>
                🛡️ <strong>Security Boundary Notice:</strong> CopyVault runs with your standard user permissions. Local storage relies on your operating system's disk encryption (FileVault / BitLocker). CopyVault cannot protect clipboard data from malware or keyloggers already executing with your user account's privileges.
              </div>
            </div>

            {/* Privacy Diagnostics Grid */}
            {diagnostics && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginBottom: "12px", background: "var(--cv-bg-surface-elevated)", padding: "8px", borderRadius: "var(--cv-radius-sm)" }}>
                <div>
                  <div style={{ fontSize: "10px", color: "var(--cv-text-muted)" }}>TOTAL ITEMS</div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{diagnostics.total_items_count}</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "var(--cv-text-muted)" }}>PINNED ITEMS</div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{diagnostics.pinned_items_count}</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "var(--cv-text-muted)" }}>MEDIA FILES</div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{diagnostics.media_items_count}</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "var(--cv-text-muted)" }}>DB DISK SIZE</div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{(diagnostics.db_size_bytes / 1024).toFixed(1)} KB</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "var(--cv-text-muted)" }}>MEDIA DISK SIZE</div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{(diagnostics.media_dir_size_bytes / 1024).toFixed(1)} KB</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "var(--cv-text-muted)" }}>EXCLUSIONS ACTIVE</div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{diagnostics.exclusions_count} apps</div>
                </div>
              </div>
            )}

            {/* Clear All History Action */}
            {onClearHistory && (
              <div className="cv-settings-row" style={{ marginTop: "0.5rem", borderTop: "1px solid var(--cv-border-subtle)", paddingTop: "8px" }}>
                <div className="cv-settings-row-text">
                  <span className="cv-settings-row-label" style={{ color: "var(--cv-color-danger)" }}>Clear All History</span>
                  <span className="cv-settings-row-desc">
                    Permanently delete all clipboard items and associated media files from local disk.
                  </span>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    className="cv-btn cv-btn-secondary"
                    style={{ color: "var(--cv-color-danger)" }}
                    disabled={isClearingHistory}
                    onClick={async () => {
                      if (safeConfirm("Delete all unpinned items? Pinned items will be preserved.")) {
                        setIsClearingHistory(true);
                        try {
                          await onClearHistory(true);
                        } finally {
                          setIsClearingHistory(false);
                        }
                      }
                    }}
                    aria-label="Clear unpinned history"
                  >
                    Clear Unpinned
                  </button>
                  <button
                    type="button"
                    className="cv-btn"
                    style={{ background: "var(--cv-color-danger)", color: "#fff" }}
                    disabled={isClearingHistory}
                    onClick={async () => {
                      if (safeConfirm("⚠️ DANGER: Permanently delete ALL items including pinned items and media? This cannot be undone.")) {
                        setIsClearingHistory(true);
                        try {
                          await onClearHistory(false);
                        } finally {
                          setIsClearingHistory(false);
                        }
                      }
                    }}
                    aria-label="Clear all items including pinned"
                  >
                    Clear Everything
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Backup & Portability Section */}
          <section className="cv-settings-section">
            <h3 className="cv-settings-section-title">📦 Backup & Data Portability</h3>
            <p style={{ fontSize: "12px", color: "var(--cv-text-secondary)", marginBottom: "8px" }}>
              Export and import your complete vault data (items, snippets, collections, tags, and sequences) as a local JSON file. Never uploaded to any server.
            </p>

            {importStatus && <div className="cv-success-banner">{importStatus}</div>}
            {importError && <div className="cv-error-banner">{importError}</div>}

            <div className="cv-settings-row">
              <div className="cv-settings-row-text">
                <span className="cv-settings-row-label">Export Vault Backup</span>
                <span className="cv-settings-row-desc">
                  Downloads a schema-versioned JSON backup file to your local computer.
                </span>
              </div>
              <button
                type="button"
                className="cv-btn cv-btn-secondary"
                onClick={handleExport}
                disabled={isExporting}
                aria-label="Export complete vault backup"
              >
                {isExporting ? "Exporting..." : "📥 Export JSON"}
              </button>
            </div>

            <div className="cv-settings-row" style={{ alignItems: "flex-start" }}>
              <div className="cv-settings-row-text">
                <span className="cv-settings-row-label">Import / Restore Vault Backup</span>
                <span className="cv-settings-row-desc">
                  Restores items, snippets, collections, and sequences with schema validation.
                </span>
                <div style={{ marginTop: "6px", display: "flex", gap: "12px", fontSize: "12px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="import-mode"
                      value="merge"
                      checked={importMode === "merge"}
                      onChange={() => setImportMode("merge")}
                    />
                    <span>Merge with existing</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="import-mode"
                      value="replace"
                      checked={importMode === "replace"}
                      onChange={() => setImportMode("replace")}
                    />
                    <span>Replace existing</span>
                  </label>
                </div>
              </div>
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,application/json"
                  style={{ display: "none" }}
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  className="cv-btn cv-btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  aria-label="Select backup JSON file to import"
                >
                  {isImporting ? "Importing..." : "📤 Import JSON"}
                </button>
              </div>
            </div>
          </section>

          {/* Keyboard Shortcuts Reference */}
          <section className="cv-settings-section">
            <h3 className="cv-settings-section-title">Keyboard Shortcuts</h3>
            <div className="cv-shortcuts-grid">
              <div className="cv-shortcut-item">
                <kbd>/</kbd> or <kbd>⌘K</kbd>
                <span>Focus Search</span>
              </div>
              <div className="cv-shortcut-item">
                <kbd>↑</kbd> <kbd>↓</kbd>
                <span>Navigate List</span>
              </div>
              <div className="cv-shortcut-item">
                <kbd>1</kbd> .. <kbd>9</kbd>
                <span>Instant Paste #1..9</span>
              </div>
              <div className="cv-shortcut-item">
                <kbd>Space</kbd>
                <span>Select for Sequential Paste</span>
              </div>
              <div className="cv-shortcut-item">
                <kbd>Enter</kbd>
                <span>Paste Selected Item</span>
              </div>
              <div className="cv-shortcut-item">
                <kbd>Esc</kbd>
                <span>Dismiss Quick Panel</span>
              </div>
            </div>
          </section>

          {/* About & Open Source */}
          <section className="cv-settings-section">
            <h3 className="cv-settings-section-title">About CopyVault</h3>
            <div style={{ padding: "0.75rem", backgroundColor: "var(--cv-bg-card, #1e293b)", borderRadius: "6px", border: "1px solid var(--cv-border-subtle, #334155)", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <img src="/logo.png" alt="CopyVault" style={{ width: "36px", height: "36px", borderRadius: "6px", flexShrink: 0 }} />
              <div>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "13px", color: "var(--cv-text-primary, #f8fafc)" }}>
                  <strong>Hi, I'm Sandeep</strong>, an independent software developer.
                </p>
                <p style={{ margin: "0 0 0.75rem 0", fontSize: "12px", color: "var(--cv-text-secondary, #94a3b8)", lineHeight: 1.5 }}>
                  CopyVault is a 100% free, local-first, zero-telemetry open-source clipboard manager. The source code is available on GitHub.
                </p>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => openExternalUrl("https://github.com/tsandeepsw/copyvault")}
                    className="cv-btn cv-btn-secondary"
                    style={{ fontSize: "12px", padding: "4px 10px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <span>⭐ View on GitHub</span>
                  </button>
                  <span style={{ fontSize: "11px", color: "var(--cv-text-muted, #64748b)" }}>Version 0.1.0</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="cv-modal-footer">
          <button type="button" className="cv-btn cv-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

