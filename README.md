# CopyVault

> **Current Status**: Production Test Release `v0.1.0` Active — Verified on macOS (Apple Silicon `aarch64`)  
> **Platforms**: macOS (Darwin arm64/x86_64), Windows (x64), Linux (Planned Post-Core)

CopyVault is an ultra-fast, local-first, zero-telemetry clipboard manager designed for privacy, seamless developer ergonomics, and desktop productivity. It automatically monitors, indexes, and categorizes copied text, formatted rich text/HTML, code snippets, URLs, and images/GIFs with sub-15ms full-text search, drag-and-drop form filling, sequential pasting, dynamic snippet expansion, and strict secret protection.

---

## 💡 What is CopyVault?

Most clipboard managers compromise either speed or privacy—often syncing sensitive credentials over the cloud or bloating system memory. CopyVault is built differently:

- **100% Local-First & Zero-Telemetry**: Your clipboard data never leaves your computer. No analytics, no tracking, and no network calls.
- **Concealed Content Protection**: Detects and automatically ignores passwords, authorization tokens, and copies from credential managers (e.g. 1Password, Bitwarden, KeePass, Apple Keychain).
- **Dual Surface Ergonomics**: Toggle between a sub-second spotlight **Quick Panel** (`720px × 460px`) and an expanded **Full Workspace** (`960px × 680px`) with detail inspection and collection management.
- **Drag-and-Drop Workflow**: Drag text, code, or links straight from CopyVault cards directly into browser form fields or desktop app inputs.
- **Ordered Step-by-Step Paste**: Select multiple items in any custom sequence (`[1]`, `[2]`, `[3]`) and paste them sequentially or automatically one-by-one into external target forms.
- **Instant Full-Text Search (FTS5)**: Embedded SQLite with BM25 ranking finds exact matches and prefixes across tens of thousands of items in under 5 milliseconds.

---

## ✨ Key Features

### 📋 Smart Clipboard Capture & Monitoring
- **Multi-Format Ingestion**: Captures Plain Text, Rich Text (HTML), Code Blocks (with syntax recognition), URLs, and Images (PNG, JPEG, WebP, GIF).
- **Active / Pause Toggle**: Easily toggle clipboard recording on/off from the UI. When paused, no system copies are recorded, and resuming will not retroactively capture paused clipboard items.
- **Smart Deduplication & Self-Healing**: Automatically deduplicates consecutive identical copies and heals DB state on startup.
- **Local File & Web Image Support**: Ingests images copied from browsers, web applications, or local Finder/Download folders with automatic disk caching and memory-safe thumbnails.

### 🔍 Search, Organization & Filtering
- **Sub-15ms FTS5 Search**: Full-text instant search with BM25 relevance score ranking and search query highlighting.
- **Type Filtering**: Instant filter tabs: **All**, **Text**, **Code**, **Links**, **Images**, **Favorites**, and **Trash**.
- **Permanent Saved Snippets**: Store reusable templates with custom trigger prefixes (e.g., `!email`, `!addr`) and dynamic placeholder expansion (`{{name}}`, `{{date}}`, `{{time}}`).
- **Color-Coded Collections & Tags**: Organize snippets and clippings into custom collections with custom color badges.

### 🖱️ Ergonomics & Sequential Pasting
- **Native Drag-and-Drop**: Text and URL cards are directly draggable into browser forms, text editors, and external desktop windows.
- **Ordered Multi-Selection**: Select multiple items across your history with visible order numbers `[1]`, `[2]`, `[3]`.
- **Automated Synthetic Paste & Step Paste**: Paste queued clips sequentially using global shortcuts or an automated timer interval without manual switching.
- **Instant Text Transformations**: Transform text cards in 1-click (UPPERCASE, lowercase, Title Case, CamelCase, Kebab-case, Snake_case, URL Encode/Decode, Trim).

### 🔒 Privacy, Security & Accessibility
- **Concealed Secret Shield**: Automatically suppresses password manager entries and clipboard items flagged with sensitive OS concealment types (`org.nspasteboard.ConcealedType`).
- **100% WCAG 2.1 AA Compliant**: High-contrast theme tokens (≥ 6.9:1), visible 2px focus indicators, screen-reader ARIA live announcements, and full keyboard navigation.
- **Backup & Portability**: Export and restore your complete vault history and collections using encrypted or standard ZIP archives.

---

## 📂 Repository File Structure

```text
copyvault/
├── .github/
│   └── workflows/
│       └── release.yml                 # Multi-platform CI/CD release workflow (macOS, Windows, Ubuntu)
├── release/                            # Staged local release folder (macOS standalone bundle & binary)
│   ├── CopyVault.app                   # Double-clickable macOS application bundle
│   ├── copyvault                       # Standalone Mach-O 64-bit arm64 native executable
│   ├── CopyVault_0.1.0_mac_aarch64.zip # Zipped native release bundle
│   └── README.md                       # Local release quick-start guide
├── src/                                # Frontend application (React 19, TypeScript, CSS)
│   ├── api/
│   │   ├── vault.ts                    # Tauri IPC client bridging UI to Rust backend commands
│   │   └── vault.test.ts               # Unit tests for IPC bridge and mock fallback
│   ├── components/
│   │   ├── ActiveSessionBar.tsx        # Top status bar for sequential paste progress & execution
│   │   ├── AddTestItemModal.tsx        # Modal for manual entry (Text, Code, Link, Image upload)
│   │   ├── AuditHardening.test.tsx     # Verification tests for edge cases and accessibility
│   │   ├── ClipboardCard.tsx           # History card component with preview, drag-and-drop, and actions
│   │   ├── DetailPane.tsx              # Side inspector showing raw text, metadata, and transformations
│   │   ├── EmptyState.tsx              # Friendly zero-state display for empty filters and searches
│   │   ├── FilterBar.tsx               # Format tabs (All, Text, Code, Links, Images, Trash)
│   │   ├── ImagePreviewModal.tsx       # Full-resolution image preview lightbox modal
│   │   ├── SearchBar.tsx               # Instant search input with debounced query dispatch
│   │   ├── SelectionQueueBar.tsx       # Bottom bar managing ordered multi-selection & batch deletion
│   │   ├── SequencePreviewModal.tsx    # Modal to review, reorder, and launch sequential paste queues
│   │   ├── SequencesView.tsx           # Manager for saved paste sequences and execution profiles
│   │   ├── SettingsModal.tsx           # User settings (hotkeys, retention, auto-start, privacy)
│   │   ├── Sidebar.tsx                 # Navigation bar (History, Starred, Snippets, Collections, Trash)
│   │   └── SnippetsView.tsx            # Saved snippets manager with template variable expansion
│   ├── types/
│   │   └── clipboard.ts                # TypeScript domain models, DTOs, and interface definitions
│   ├── utils/
│   │   ├── confirm.ts / .test.ts       # Accessible modal confirmation helpers
│   │   ├── template.ts / .test.ts      # Template string interpolation engine ({{name}}, {{date}})
│   │   └── transform.ts / .test.ts     # String case transformations and encoding utilities
│   ├── App.tsx                         # Main window container, state coordinator, and hotkey listener
│   ├── App.test.tsx                    # Vitest UI component integration test suite
│   ├── index.css                       # Design tokens, themes (dark/light), layout & responsive styles
│   ├── main.tsx                        # React application DOM root bootstrap
│   └── vite-env.d.ts                   # Vite environment type declarations
├── src-tauri/                          # Backend desktop core (Rust 2024 edition)
│   ├── capabilities/
│   │   └── default.json                # Scoped Tauri 2 security permissions
│   ├── icons/                          # Desktop app and system tray icons (.png, .icns, .ico)
│   ├── src/
│   │   ├── clipboard/                  # Clipboard monitoring subsystem
│   │   │   ├── deduplicator.rs         # Hash-based consecutive copy deduplication
│   │   │   ├── detector.rs             # MIME & format classifier (Code, URL, Secret, Text, Image)
│   │   │   ├── macos.rs                # macOS NSPasteboard native listener and secret suppression
│   │   │   ├── mock.rs                 # Mock clipboard engine for cross-platform unit testing
│   │   │   ├── mod.rs                  # Clipboard backend traits and shared contracts
│   │   │   └── service.rs              # Background polling monitor thread with pause/resume guard
│   │   ├── db/                         # Embedded SQLite storage & FTS5 search
│   │   │   ├── migrations.rs           # Atomic transactional schema migrations
│   │   │   ├── models.rs               # Rust data structs and DB row mappings
│   │   │   ├── queries.rs              # Parameterized SQL statements and FTS5 BM25 queries
│   │   │   └── service.rs              # Database manager, connection pool & self-healing logic
│   │   ├── ipc/                        # Tauri IPC command interface
│   │   │   ├── commands.rs             # Handlers invoked by frontend (get, search, delete, paste)
│   │   │   ├── dto.rs                  # Serialization DTO structs exchanged across the IPC boundary
│   │   │   └── mod.rs                  # IPC command module registration
│   │   ├── media/
│   │   │   └── mod.rs                  # Image caching, disk storage, and thumbnail management
│   │   ├── paste/                      # Synthetic keyboard simulation & paste sequences
│   │   │   ├── macos.rs                # macOS CGEvent synthetic Cmd+V injection & window focus
│   │   │   ├── windows.rs              # Windows SendInput synthetic Ctrl+V injection
│   │   │   ├── session.rs              # Step-by-step and automated sequential paste coordinator
│   │   │   └── simulator.rs            # Keyboard simulation abstraction
│   │   ├── utils/
│   │   │   └── paths.rs                # Application directory resolution (App Support / AppData)
│   │   ├── window/                     # Window management, hotkeys, and tray
│   │   │   ├── autostart.rs            # Launch at login configuration (macOS LaunchAgent / Win32)
│   │   │   ├── hotkey.rs               # Global keyboard shortcut registration
│   │   │   └── tray.rs                 # System tray icon, menu actions, and window toggles
│   │   ├── lib.rs                      # Tauri application builder & plugin orchestration
│   │   └── main.rs                     # Native binary entry point
│   ├── Cargo.toml                      # Rust crate dependencies and build configuration
│   └── tauri.conf.json                 # Tauri 2 app manifest (bundle ID, windows, security CSP)
├── docs/                               # Architectural documentation and specifications
│   ├── adr/                            # Architecture Decision Records (ADR-001 through ADR-006)
│   ├── CLIPBOARD_COMPATIBILITY.md      # Platform pasteboard matrices and compatibility specs
│   ├── ERROR_HANDLING.md               # Unified error hierarchy and recovery strategies
│   ├── RELEASE_CHECKLIST.md            # Release gates, signing, notarization, and storage guide
│   └── USER_FLOWS.md                   # Core user interaction paths and shortcuts
├── package.json                        # Node.js project scripts and dependencies
├── tsconfig.json                       # TypeScript compiler configuration (strict mode)
├── vite.config.ts                      # Vite build and Vitest configuration
├── eslint.config.js                    # ESLint 9 configuration
├── ARCHITECTURE.md                     # System architecture, IPC schema, and threading model
├── DATABASE.md                         # SQLite database schema, FTS5 design & performance specs
├── DECISIONS.md                        # Architectural decision log (DEC-001 to DEC-021)
├── DESIGN.md                           # UI/UX design specifications, tokens & typography
├── PRD.md                              # Product Requirements Document
├── ROADMAP.md                          # Phased delivery roadmap
├── SECURITY.md                         # Threat model, secret suppression & zero-telemetry rules
└── TEST_PLAN.md                        # Verification strategy and test gates
```

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Desktop Shell** | [Tauri 2](https://v2.tauri.app/) | Secure, lightweight native windowing and OS bridge |
| **Backend Core** | Rust (2024 Edition) | High-performance clipboard listener, SQLite manager, synthetic paste |
| **Frontend Framework** | React 19 + TypeScript (strict) | Reactive desktop UI with strict type safety |
| **Database & Search** | Embedded SQLite + FTS5 | Local transactional storage with sub-5ms BM25 ranking |
| **Styling & Theming** | Modern CSS + Reusable Tokens | Dark/Light theme, accessible focus rings, 60fps scrolling |
| **Test Runner** | Vitest 3 + Cargo Test | 100% test pass rate across frontend and backend modules |

---

## 💻 Commands & Development Guide

All commands run from the project root directory.

### 1. Prerequisites
- **Node.js**: v20+ LTS (`node` and `npm`)
  > *If Homebrew node is not on your subshell `$PATH`:*
  > ```bash
  > export PATH="/opt/homebrew/bin:$PATH"
  > ```
- **Rust Toolchain**: `rustc 1.85+` / `cargo` (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **macOS Requirements**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows Requirements**: Visual Studio C++ Build Tools & WebView2

### 2. Dependency Setup
```bash
# Install frontend npm dependencies
npm install
```

### 3. Development Server
```bash
# Start Vite development server (frontend only in browser)
npm run dev

# Start full Tauri desktop app in hot-reloading development mode
npm run tauri dev
```

### 4. Verification & Testing Commands
```bash
# Run TypeScript strict type verification
npm run typecheck

# Run ESLint linting
npm run lint

# Run Vitest frontend unit & integration tests
npm test

# Run Rust backend test suite (unit tests, deduplication, FTS5 queries)
cargo test --manifest-path src-tauri/Cargo.toml

# Run all release quality checks together
npm run release:check
```

### 5. Packaging & Building Releases

#### macOS Local Application Bundle
```bash
# Builds the production React frontend and native macOS bundle (.app)
npm run bundle:mac

# Output will be located at:
# src-tauri/target/release/bundle/macos/CopyVault.app
```

#### Staged Release Folder
To prepare a clean testing folder in the repository root:
```bash
mkdir -p release
cp -R src-tauri/target/release/bundle/macos/CopyVault.app release/
cp src-tauri/target/release/copyvault release/
chmod +x release/copyvault
```

#### Running the Release Build Locally
```bash
# Launch the macOS application bundle
open release/CopyVault.app

# Or execute binary directly with live console logs
./release/copyvault
```

---

## 💾 Local Storage & Privacy Model

CopyVault operates strictly within user-scoped application directories:

| OS | Database & Media Storage Path |
| :--- | :--- |
| **macOS** | `~/Library/Application Support/com.copyvault.desktop/copyvault.db`<br>`~/Library/Application Support/com.copyvault.desktop/media/` |
| **Windows** | `%APPDATA%\com.copyvault.desktop\copyvault.db`<br>`%APPDATA%\com.copyvault.desktop\media\` |
| **LaunchAgent (macOS)** | `~/Library/LaunchAgents/com.copyvault.app.plist` |

### Uninstallation & Data Purge
- **Retaining Data (Standard)**: Moving `CopyVault.app` to Trash removes the executable but preserves your local database for future re-installations.
- **Complete Clean Purge**:
  1. Use **Settings (⚙️)** → **Privacy & History** → **Clear All History** within the app.
  2. Or manually remove the folder:
     - **macOS**: `rm -rf ~/Library/Application\ Support/com.copyvault.desktop`
     - **Windows**: `Remove-Item -Recurse -Force "$env:APPDATA\com.copyvault.desktop"`

---

## 🛡️ Zero-Telemetry Privacy Commitment

CopyVault does not include Google Analytics, Sentry, Mixpanel, Segment, or any remote error-tracking services. All search queries, clipboard clippings, image caches, and application configurations are stored exclusively on your local machine and never transmitted over any network interface.

---

## License

MIT

