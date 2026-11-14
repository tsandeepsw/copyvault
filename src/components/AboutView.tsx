import React from "react";

export const AboutView: React.FC = () => {
  return (
    <div className="cv-content-view" role="region" aria-label="About CopyVault and Developer">
      <div className="cv-view-header">
        <div className="cv-view-header-title-group">
          <span className="cv-view-header-icon" aria-hidden="true">💡</span>
          <div>
            <h2 className="cv-view-header-title">About CopyVault</h2>
            <p className="cv-view-header-subtitle">
              Fast, privacy-first, local clipboard manager for modern desktops.
            </p>
          </div>
        </div>
      </div>

      <div className="cv-view-scrollable">
        {/* Developer Greeting Card */}
        <div className="cv-about-card cv-about-card-hero">
          <img src="/logo.png" alt="CopyVault Logo" className="cv-about-logo" />
          <div className="cv-about-hero-text">
            <h3 className="cv-about-hero-greeting">Hi, I'm Sandeep</h3>
            <p className="cv-about-hero-sub">
              An independent software developer passionate about building high-performance, private, and distraction-free developer tools.
            </p>
          </div>
        </div>

        {/* Open Source Banner */}
        <div className="cv-about-card" style={{ marginTop: "1rem" }}>
          <div className="cv-about-badge-row">
            <span className="cv-badge cv-badge-primary">Open Source</span>
            <span className="cv-badge cv-badge-secondary">MIT License</span>
            <span className="cv-badge cv-badge-secondary">Version 0.1.0</span>
          </div>

          <h3 className="cv-about-heading">100% Free & Open Source Software</h3>
          <p className="cv-about-paragraph">
            CopyVault is completely free and open-source software. The complete source code, architecture records,
            and verification suites are publicly accessible on GitHub. You can inspect every line of code,
            audit its offline zero-telemetry guarantee, report issues, or contribute.
          </p>

          <div style={{ marginTop: "1rem" }}>
            <a
              href="https://github.com/tsandeep/copyvault"
              target="_blank"
              rel="noopener noreferrer"
              className="cv-btn cv-btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>View Source Code on GitHub</span>
            </a>
          </div>
        </div>

        {/* Architecture & Mission Card */}
        <div className="cv-about-card" style={{ marginTop: "1rem" }}>
          <h3 className="cv-about-heading">Why CopyVault was Built</h3>
          <p className="cv-about-paragraph">
            Most desktop clipboard tools today are either bloated web wrappers taking hundreds of megabytes of RAM,
            or closed-source apps that silently beam personal clipboard contents and keystrokes to remote clouds.
          </p>
          <p className="cv-about-paragraph" style={{ marginTop: "0.5rem" }}>
            CopyVault was crafted with <strong>Tauri 2, Rust, and React 19</strong> to provide a sub-10MB native footprint,
            instantaneous sub-5ms search via SQLite FTS5, and a cast-iron guarantee: your clipboard data stays on your machine.
          </p>
        </div>

        {/* Tech Stack Summary */}
        <div className="cv-about-card" style={{ marginTop: "1rem" }}>
          <h3 className="cv-about-heading">Core Technology Stack</h3>
          <ul className="cv-about-tech-list">
            <li><strong>Desktop Engine:</strong> Tauri 2 (Secure native Rust windowing)</li>
            <li><strong>Frontend UI:</strong> React 19, TypeScript, WCAG 2.1 AA tokens</li>
            <li><strong>Local Database:</strong> Embedded SQLite with WAL mode & FTS5 BM25 search</li>
            <li><strong>Native Clipboard:</strong> Direct OS pasteboard listeners (macOS NSPasteboard / Win32)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

