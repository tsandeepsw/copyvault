-- Migration: 002_collections_tags_and_snippets.sql
-- Description: Tags, collections, saved snippets, and reusable paste sequences
-- Status: Production Migration v2

-- Custom tags for flexible labeling
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT NOT NULL DEFAULT '#6366f1',
    created_at INTEGER NOT NULL
);

-- Many-to-many relationship: items to tags
CREATE TABLE IF NOT EXISTS item_tags (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);

-- Organizational collections (folders)
CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- Many-to-many relationship: items to collections
CREATE TABLE IF NOT EXISTS item_collections (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, collection_id)
);
CREATE INDEX IF NOT EXISTS idx_item_collections_col ON item_collections(collection_id);

-- Saved permanent snippets & text templates
CREATE TABLE IF NOT EXISTS saved_snippets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    trigger_prefix TEXT UNIQUE,                       -- Dynamic snippet expander prefix, e.g. '!email'
    content TEXT NOT NULL,
    syntax TEXT NOT NULL DEFAULT 'text',              -- 'text', 'markdown', 'rust', 'sql', etc.
    description TEXT,
    is_pinned BOOLEAN NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snippets_prefix ON saved_snippets(trigger_prefix);

-- Reusable paste sequences
CREATE TABLE IF NOT EXISTS paste_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    loop_count INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Ordered items within a reusable paste sequence
CREATE TABLE IF NOT EXISTS paste_sequence_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_id INTEGER NOT NULL REFERENCES paste_sequences(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL, -- Nullable if original item deleted
    static_text TEXT,                                 -- Snapshot of text if item row is removed
    sequence_order INTEGER NOT NULL,                  -- 1-based ordering position
    delay_ms INTEGER NOT NULL DEFAULT 50,             -- Milliseconds delay before paste
    UNIQUE(sequence_id, sequence_order)
);
CREATE INDEX IF NOT EXISTS idx_seq_items_order ON paste_sequence_items(sequence_id, sequence_order);

