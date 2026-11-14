use rusqlite::Connection;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::db::migrations::{get_current_schema_version, run_migrations};
use crate::db::models::{
    ClipboardItem, Collection, ImportResultDto, ItemFilter, NewClipboardItem, NewCollection,
    NewPasteSequence, NewSavedSnippet, NewTag, PaginatedResult, PaginationParams, PasteSequence,
    SavedSnippet, SettingRecord, SortOrder, Tag, UpdateSavedSnippet, VaultArchiveDto,
};
use crate::db::queries::{
    apply_connection_pragmas, assign_item_collection, bulk_delete_items, check_database_integrity,
    clear_history, count_media_references, create_collection, create_paste_sequence,
    create_saved_snippet, create_tag, delete_collection, delete_item, delete_paste_sequence,
    delete_saved_snippet, delete_tag, export_vault_archive, get_all_settings, get_item_by_hash,
    get_item_by_id, get_item_collections, get_item_tags, get_paste_sequence,
    get_saved_snippet_by_id, get_saved_snippet_by_prefix, get_setting, import_vault_archive,
    insert_or_touch_item, list_collections, list_items, list_paste_sequences, list_saved_snippets,
    list_tags, prune_retention, remove_item_collection, search_items, set_setting, tag_item,
    toggle_favorite_item, toggle_pin_item, untag_item, update_item_text, update_saved_snippet,
};
use crate::utils::error::VaultError;

/// Thread-safe service managing SQLite operations behind a disciplined repository boundary.
#[derive(Clone)]
pub struct DatabaseService {
    conn: Arc<Mutex<Connection>>,
}

impl DatabaseService {
    /// Opens a disk-backed SQLite database at the specified path, applies pragmas, performs startup integrity check with self-healing, and runs migrations.
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, VaultError> {
        let path_ref = path.as_ref();

        let init_result = (|| -> Result<Connection, VaultError> {
            let mut conn = Connection::open(path_ref)?;
            apply_connection_pragmas(&conn, false)?;
            check_database_integrity(&conn)?;
            run_migrations(&mut conn)?;
            let _ = self_heal_historical_urls(&conn);
            Ok(conn)
        })();

        match init_result {
            Ok(conn) => Ok(Self {
                conn: Arc::new(Mutex::new(conn)),
            }),
            Err(e) => {
                // If opening or verification failed and file exists, back up corrupt file and self-heal
                if path_ref.exists() {
                    let now_ms = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|d| d.as_millis())
                        .unwrap_or(0);
                    let backup_path = format!("{}.corrupt.{}", path_ref.display(), now_ms);
                    let _ = std::fs::rename(path_ref, &backup_path);

                    let mut fresh_conn = Connection::open(path_ref)?;
                    apply_connection_pragmas(&fresh_conn, false)?;
                    run_migrations(&mut fresh_conn)?;
                    let _ = self_heal_historical_urls(&fresh_conn);
                    Ok(Self {
                        conn: Arc::new(Mutex::new(fresh_conn)),
                    })
                } else {
                    Err(e)
                }
            }
        }
    }

    /// Opens an in-memory SQLite database, applies pragmas, and runs migrations.
    pub fn open_in_memory() -> Result<Self, VaultError> {
        let mut conn = Connection::open_in_memory()?;
        apply_connection_pragmas(&conn, true)?;
        run_migrations(&mut conn)?;
        let _ = self_heal_historical_urls(&conn);

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    fn lock_conn(&self) -> Result<std::sync::MutexGuard<'_, Connection>, VaultError> {
        self.conn
            .lock()
            .map_err(|e| VaultError::LockPoisoned(e.to_string()))
    }

    /// Inserts a new clipboard item or touches/increments an existing item if the SHA-256 hash matches.
    pub fn insert_item(&self, item: &NewClipboardItem) -> Result<ClipboardItem, VaultError> {
        let mut conn = self.lock_conn()?;
        insert_or_touch_item(&mut conn, item)
    }

    /// Retrieves an item by its ID.
    pub fn get_item(&self, id: i64) -> Result<Option<ClipboardItem>, VaultError> {
        let conn = self.lock_conn()?;
        get_item_by_id(&conn, id)
    }

    /// Retrieves an item by its content SHA-256 hash.
    pub fn get_item_by_hash(&self, hash: &str) -> Result<Option<ClipboardItem>, VaultError> {
        let conn = self.lock_conn()?;
        get_item_by_hash(&conn, hash)
    }

    /// In-place text update. Recomputes content hash and triggers FTS5 synchronization.
    pub fn update_item_text(&self, id: i64, new_text: &str) -> Result<ClipboardItem, VaultError> {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let mut conn = self.lock_conn()?;
        update_item_text(&mut conn, id, new_text, now_millis)
    }

    /// Toggles pinned status for an item.
    pub fn toggle_pin(&self, id: i64) -> Result<bool, VaultError> {
        let conn = self.lock_conn()?;
        toggle_pin_item(&conn, id)
    }

    /// Toggles favorite status for an item.
    pub fn toggle_favorite(&self, id: i64) -> Result<bool, VaultError> {
        let conn = self.lock_conn()?;
        toggle_favorite_item(&conn, id)
    }

    /// Deletes an item by ID, returning its media_path (if any) for media lifecycle management.
    pub fn delete_item(&self, id: i64) -> Result<Option<String>, VaultError> {
        let mut conn = self.lock_conn()?;
        delete_item(&mut conn, id)
    }

    /// Deletes multiple items in a single transaction, returning media paths for cleanup.
    pub fn bulk_delete_items(&self, ids: &[i64]) -> Result<Vec<String>, VaultError> {
        let mut conn = self.lock_conn()?;
        bulk_delete_items(&mut conn, ids)
    }

    /// Prunes unpinned items exceeding retention age or capacity limits.
    pub fn cleanup_retention(
        &self,
        max_items: Option<u64>,
        retention_days: Option<u64>,
    ) -> Result<(u64, Vec<String>), VaultError> {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let mut conn = self.lock_conn()?;
        prune_retention(&mut conn, max_items, retention_days, now_millis)
    }

    /// Clears history, optionally preserving pinned items. Returns number of items deleted and associated media paths.
    pub fn clear_history(&self, keep_pinned: bool) -> Result<(u64, Vec<String>), VaultError> {
        let mut conn = self.lock_conn()?;
        clear_history(&mut conn, keep_pinned)
    }

    /// Checks the reference count for a media path to prevent deleting shared media files.
    pub fn count_media_references(&self, media_path: &str) -> Result<u64, VaultError> {
        let conn = self.lock_conn()?;
        count_media_references(&conn, media_path)
    }

    /// Lists items with filters, sorting, and pagination.
    pub fn list_items(
        &self,
        filter: &ItemFilter,
        sort: SortOrder,
        pagination: &PaginationParams,
    ) -> Result<PaginatedResult<ClipboardItem>, VaultError> {
        let conn = self.lock_conn()?;
        list_items(&conn, filter, sort, pagination)
    }

    /// Searches items using BM25-ranked FTS5 full-text search.
    pub fn search_items(
        &self,
        query: &str,
        filter: &ItemFilter,
        limit: u32,
        offset: u32,
    ) -> Result<PaginatedResult<ClipboardItem>, VaultError> {
        let conn = self.lock_conn()?;
        search_items(&conn, query, filter, limit, offset)
    }

    /// Gets a persistent setting value.
    pub fn get_setting(&self, key: &str) -> Result<Option<String>, VaultError> {
        let conn = self.lock_conn()?;
        get_setting(&conn, key)
    }

    /// Sets a persistent setting value.
    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), VaultError> {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let conn = self.lock_conn()?;
        set_setting(&conn, key, value, now_millis)
    }

    /// Retrieves all stored settings as a map.
    pub fn get_all_settings(&self) -> Result<HashMap<String, SettingRecord>, VaultError> {
        let conn = self.lock_conn()?;
        get_all_settings(&conn)
    }

    /// Verifies SQLite database integrity.
    pub fn check_integrity(&self) -> Result<Vec<String>, VaultError> {
        let conn = self.lock_conn()?;
        check_database_integrity(&conn)
    }

    /// Returns the active schema migration version.
    pub fn get_schema_version(&self) -> Result<i32, VaultError> {
        let conn = self.lock_conn()?;
        get_current_schema_version(&conn)
    }

    // ==========================================
    // Phase 8: Tags, Collections, Snippets & Sequences
    // ==========================================

    /// Creates a tag or returns an existing one.
    pub fn create_tag(&self, new_tag: &NewTag) -> Result<Tag, VaultError> {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let conn = self.lock_conn()?;
        create_tag(&conn, new_tag, now_millis)
    }

    /// Lists all tags.
    pub fn list_tags(&self) -> Result<Vec<Tag>, VaultError> {
        let conn = self.lock_conn()?;
        list_tags(&conn)
    }

    /// Deletes a tag by ID.
    pub fn delete_tag(&self, id: i64) -> Result<bool, VaultError> {
        let conn = self.lock_conn()?;
        delete_tag(&conn, id)
    }

    /// Associates an item with a tag.
    pub fn tag_item(&self, item_id: i64, tag_id: i64) -> Result<(), VaultError> {
        let conn = self.lock_conn()?;
        tag_item(&conn, item_id, tag_id)
    }

    /// Removes a tag association from an item.
    pub fn untag_item(&self, item_id: i64, tag_id: i64) -> Result<(), VaultError> {
        let conn = self.lock_conn()?;
        untag_item(&conn, item_id, tag_id)
    }

    /// Retrieves all tags for an item.
    pub fn get_item_tags(&self, item_id: i64) -> Result<Vec<Tag>, VaultError> {
        let conn = self.lock_conn()?;
        get_item_tags(&conn, item_id)
    }

    /// Creates or updates a collection by slug.
    pub fn create_collection(&self, new_col: &NewCollection) -> Result<Collection, VaultError> {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let conn = self.lock_conn()?;
        create_collection(&conn, new_col, now_millis)
    }

    /// Lists all collections.
    pub fn list_collections(&self) -> Result<Vec<Collection>, VaultError> {
        let conn = self.lock_conn()?;
        list_collections(&conn)
    }

    /// Deletes a collection by ID.
    pub fn delete_collection(&self, id: i64) -> Result<bool, VaultError> {
        let conn = self.lock_conn()?;
        delete_collection(&conn, id)
    }

    /// Assigns an item to a collection.
    pub fn assign_item_collection(&self, item_id: i64, collection_id: i64) -> Result<(), VaultError> {
        let conn = self.lock_conn()?;
        assign_item_collection(&conn, item_id, collection_id)
    }

    /// Removes an item from a collection.
    pub fn remove_item_collection(&self, item_id: i64, collection_id: i64) -> Result<(), VaultError> {
        let conn = self.lock_conn()?;
        remove_item_collection(&conn, item_id, collection_id)
    }

    /// Retrieves all collections for an item.
    pub fn get_item_collections(&self, item_id: i64) -> Result<Vec<Collection>, VaultError> {
        let conn = self.lock_conn()?;
        get_item_collections(&conn, item_id)
    }

    /// Creates a new saved permanent snippet.
    pub fn create_saved_snippet(&self, new_snip: &NewSavedSnippet) -> Result<SavedSnippet, VaultError> {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let conn = self.lock_conn()?;
        create_saved_snippet(&conn, new_snip, now_millis)
    }

    /// Retrieves a saved snippet by ID.
    pub fn get_saved_snippet(&self, id: i64) -> Result<Option<SavedSnippet>, VaultError> {
        let conn = self.lock_conn()?;
        get_saved_snippet_by_id(&conn, id)
    }

    /// Retrieves a saved snippet by trigger prefix (e.g. '!email').
    pub fn get_saved_snippet_by_prefix(&self, prefix: &str) -> Result<Option<SavedSnippet>, VaultError> {
        let conn = self.lock_conn()?;
        get_saved_snippet_by_prefix(&conn, prefix)
    }

    /// Updates a saved snippet.
    pub fn update_saved_snippet(&self, snip: &UpdateSavedSnippet) -> Result<SavedSnippet, VaultError> {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let conn = self.lock_conn()?;
        update_saved_snippet(&conn, snip, now_millis)
    }

    /// Deletes a saved snippet by ID.
    pub fn delete_saved_snippet(&self, id: i64) -> Result<bool, VaultError> {
        let conn = self.lock_conn()?;
        delete_saved_snippet(&conn, id)
    }

    /// Lists all saved snippets.
    pub fn list_saved_snippets(&self) -> Result<Vec<SavedSnippet>, VaultError> {
        let conn = self.lock_conn()?;
        list_saved_snippets(&conn)
    }

    /// Creates a new reusable paste sequence.
    pub fn create_paste_sequence(&self, new_seq: &NewPasteSequence) -> Result<PasteSequence, VaultError> {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let mut conn = self.lock_conn()?;
        create_paste_sequence(&mut conn, new_seq, now_millis)
    }

    /// Retrieves a paste sequence with items by ID.
    pub fn get_paste_sequence(&self, id: i64) -> Result<Option<PasteSequence>, VaultError> {
        let conn = self.lock_conn()?;
        get_paste_sequence(&conn, id)
    }

    /// Lists all paste sequences.
    pub fn list_paste_sequences(&self) -> Result<Vec<PasteSequence>, VaultError> {
        let conn = self.lock_conn()?;
        list_paste_sequences(&conn)
    }

    /// Deletes a paste sequence by ID.
    pub fn delete_paste_sequence(&self, id: i64) -> Result<bool, VaultError> {
        let conn = self.lock_conn()?;
        delete_paste_sequence(&conn, id)
    }

    /// Exports complete vault data into an archive DTO.
    pub fn export_vault_archive(&self) -> Result<VaultArchiveDto, VaultError> {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let conn = self.lock_conn()?;
        export_vault_archive(&conn, now_millis)
    }

    /// Imports vault archive data with format validation and merge/replace options.
    pub fn import_vault_archive(&self, archive: &VaultArchiveDto, mode: &str) -> Result<ImportResultDto, VaultError> {
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let mut conn = self.lock_conn()?;
        import_vault_archive(&mut conn, archive, mode, now_millis)
    }

    #[cfg(test)]
    pub fn get_raw_connection(&self) -> Arc<Mutex<Connection>> {
        self.conn.clone()
    }
}

/// Idempotent startup check: converts existing plain text URLs to 'link' format type
/// so they appear under the Links filter tab immediately.
fn self_heal_historical_urls(conn: &Connection) -> Result<(), VaultError> {
    let _ = conn.execute(
        "UPDATE items 
         SET format_type = 'link' 
         WHERE format_type = 'text' 
           AND (
               plain_text LIKE 'http://%' 
               OR plain_text LIKE 'https://%' 
               OR plain_text LIKE 'www.%' 
               OR plain_text LIKE 'ftp://%' 
               OR plain_text LIKE 'mailto:%'
           )",
        [],
    );
    Ok(())
}

