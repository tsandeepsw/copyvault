-- Migration: 001_initial_core_schema.sql
-- Description: Core clipboard items, performance indices, settings, and FTS5 search virtual table
-- Status: Production Migration v1

-- Master clipboard items table
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_hash TEXT NOT NULL UNIQUE,                -- SHA-256 for duplicate detection
    format_type TEXT NOT NULL,                        -- 'text', 'code', 'rich_text', 'image', 'link', 'file_uri'
    plain_text TEXT,                                  -- Plain text string representation
    html_content TEXT,                                -- Sanitized HTML for rich clippings
    rtf_content BLOB,                                 -- Compressed binary RTF payload if captured
    media_path TEXT,                                  -- Relative path to stored image in media/ directory
    media_mime TEXT,                                  -- 'image/png', 'image/jpeg', 'image/gif', 'image/webp'
    media_width INTEGER,                              -- Image width in pixels
    media_height INTEGER,                             -- Image height in pixels
    media_size_bytes INTEGER,                         -- Disk size of raw media file
    media_thumbnail BLOB,                             -- Downscaled WebP thumbnail (< 50 KB)
    source_app_bundle TEXT,                           -- OS Bundle ID (e.g. 'com.apple.Safari')
    source_app_name TEXT,                             -- Friendly name (e.g. 'Safari', 'VS Code')
    detected_lang TEXT,                               -- Programming language if code detected ('rust', 'ts')
    is_pinned BOOLEAN NOT NULL DEFAULT 0,             -- Pinned items are immune to auto-pruning
    is_favorite BOOLEAN NOT NULL DEFAULT 0,           -- Favorite toggle for quick filtering
    copy_count INTEGER NOT NULL DEFAULT 1,            -- Number of times item has been re-copied
    created_at INTEGER NOT NULL,                      -- UTC Unix timestamp (milliseconds)
    last_copied_at INTEGER NOT NULL,                  -- UTC Unix timestamp (milliseconds) of most recent copy
    last_pasted_at INTEGER                            -- UTC Unix timestamp (milliseconds) of most recent paste
);

-- Performance indices for fast ordering and filtering
CREATE INDEX IF NOT EXISTS idx_items_last_copied ON items(last_copied_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_pinned_copied ON items(is_pinned, last_copied_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_format_copied ON items(format_type, last_copied_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_content_hash ON items(content_hash);
CREATE INDEX IF NOT EXISTS idx_items_favorite ON items(is_favorite, last_copied_at DESC);

-- Application Settings & Preferences
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,                              -- JSON or string value
    updated_at INTEGER NOT NULL
);

-- External Content FTS5 Virtual Table
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    plain_text,
    source_app_name,
    content='items',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

-- FTS5 Synchronization Triggers
-- After Insert Trigger
CREATE TRIGGER IF NOT EXISTS trg_items_ai AFTER INSERT ON items BEGIN
    INSERT INTO items_fts(rowid, plain_text, source_app_name)
    VALUES (new.id, new.plain_text, new.source_app_name);
END;

-- After Delete Trigger
CREATE TRIGGER IF NOT EXISTS trg_items_ad AFTER DELETE ON items BEGIN
    INSERT INTO items_fts(items_fts, rowid, plain_text, source_app_name)
    VALUES ('delete', old.id, old.plain_text, old.source_app_name);
END;

-- After Update Trigger (synchronizes content edits)
CREATE TRIGGER IF NOT EXISTS trg_items_au AFTER UPDATE ON items BEGIN
    INSERT INTO items_fts(items_fts, rowid, plain_text, source_app_name)
    VALUES ('delete', old.id, old.plain_text, old.source_app_name);
    INSERT INTO items_fts(rowid, plain_text, source_app_name)
    VALUES (new.id, new.plain_text, new.source_app_name);
END;

