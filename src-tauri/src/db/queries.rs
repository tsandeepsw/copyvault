use rusqlite::{params, Connection, Row};
use std::collections::HashMap;
use crate::db::models::{
    ClipboardItem, ClipboardItemExportDto, Collection, FormatType, ImportResultDto, ItemFilter,
    NewCollection, NewClipboardItem, NewPasteSequence, NewSavedSnippet, NewTag, PaginatedResult,
    PaginationParams, PasteSequence, PasteSequenceItem, SavedSnippet, SettingRecord, SortOrder, Tag,
    UpdateSavedSnippet, VaultArchiveDto,
};
use crate::utils::error::VaultError;

/// Configures SQLite connection pragmas for maximum performance and durability per DATABASE.md §2.
pub fn apply_connection_pragmas(conn: &Connection, is_memory: bool) -> Result<(), VaultError> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    conn.execute_batch("PRAGMA busy_timeout = 5000;")?;
    conn.execute_batch("PRAGMA cache_size = -8000;")?;
    conn.execute_batch("PRAGMA temp_store = MEMORY;")?;

    if !is_memory {
        conn.execute_batch("PRAGMA journal_mode = WAL;")?;
        conn.execute_batch("PRAGMA synchronous = NORMAL;")?;
        conn.execute_batch("PRAGMA auto_vacuum = INCREMENTAL;")?;
    }

    Ok(())
}

/// Maps a SQLite row to a strongly-typed ClipboardItem.
pub fn row_to_clipboard_item(row: &Row<'_>) -> Result<ClipboardItem, rusqlite::Error> {
    let format_str: String = row.get("format_type")?;
    let format_type = FormatType::from_str_lossy(&format_str);
    let is_pinned: i64 = row.get("is_pinned")?;
    let is_favorite: i64 = row.get("is_favorite")?;
    let copy_count: i64 = row.get("copy_count")?;

    Ok(ClipboardItem {
        id: row.get("id")?,
        content_hash: row.get("content_hash")?,
        format_type,
        plain_text: row.get("plain_text")?,
        html_content: row.get("html_content")?,
        rtf_content: row.get("rtf_content")?,
        media_path: row.get("media_path")?,
        media_mime: row.get("media_mime")?,
        media_width: row.get("media_width")?,
        media_height: row.get("media_height")?,
        media_size_bytes: row.get("media_size_bytes")?,
        media_thumbnail: row.get("media_thumbnail")?,
        source_app_bundle: row.get("source_app_bundle")?,
        source_app_name: row.get("source_app_name")?,
        detected_lang: row.get("detected_lang")?,
        is_pinned: is_pinned != 0,
        is_favorite: is_favorite != 0,
        copy_count: copy_count as u32,
        created_at: row.get("created_at")?,
        last_copied_at: row.get("last_copied_at")?,
        last_pasted_at: row.get("last_pasted_at")?,
    })
}

/// Inserts a new clipboard item or updates recency and count if a matching hash already exists.
pub fn insert_or_touch_item(
    conn: &mut Connection,
    item: &NewClipboardItem,
) -> Result<ClipboardItem, VaultError> {
    let tx = conn.transaction()?;

    // Check if an item with this exact content_hash already exists
    let existing_opt: Option<(i64, i64)> = tx
        .query_row(
            "SELECT id, copy_count FROM items WHERE content_hash = ?1",
            params![&item.content_hash],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    if let Some((existing_id, existing_count)) = existing_opt {
        // Safe duplicate touch: updates last_copied_at and increments count
        // Strictly preserves pinned status, favorites, and initial creation timestamp
        tx.execute(
            "UPDATE items 
             SET last_copied_at = ?1,
                 copy_count = ?2
             WHERE id = ?3",
            params![item.timestamp_millis, existing_count + 1, existing_id],
        )?;

        let updated_item = tx.query_row(
            "SELECT * FROM items WHERE id = ?1",
            params![existing_id],
            row_to_clipboard_item,
        )?;

        tx.commit()?;
        return Ok(updated_item);
    }

    // New item insertion
    tx.execute(
        "INSERT INTO items (
            content_hash, format_type, plain_text, html_content, rtf_content,
            media_path, media_mime, media_width, media_height, media_size_bytes, media_thumbnail,
            source_app_bundle, source_app_name, detected_lang,
            is_pinned, is_favorite, copy_count, created_at, last_copied_at, last_pasted_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5,
            ?6, ?7, ?8, ?9, ?10, ?11,
            ?12, ?13, ?14,
            ?15, ?16, 1, ?17, ?17, NULL
        )",
        params![
            item.content_hash,
            item.format_type.as_str(),
            item.plain_text,
            item.html_content,
            item.rtf_content,
            item.media_path,
            item.media_mime,
            item.media_width,
            item.media_height,
            item.media_size_bytes,
            item.media_thumbnail,
            item.source_app_bundle,
            item.source_app_name,
            item.detected_lang,
            if item.is_pinned { 1 } else { 0 },
            if item.is_favorite { 1 } else { 0 },
            item.timestamp_millis,
        ],
    )?;

    let inserted_id = tx.last_insert_rowid();
    let inserted_item = tx.query_row(
        "SELECT * FROM items WHERE id = ?1",
        params![inserted_id],
        row_to_clipboard_item,
    )?;

    tx.commit()?;
    Ok(inserted_item)
}

/// Retrieves a clipboard item by its unique database primary key ID.
pub fn get_item_by_id(conn: &Connection, id: i64) -> Result<Option<ClipboardItem>, VaultError> {
    let result = conn.query_row(
        "SELECT * FROM items WHERE id = ?1",
        params![id],
        row_to_clipboard_item,
    );

    match result {
        Ok(item) => Ok(Some(item)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(err) => Err(VaultError::Database(err)),
    }
}

/// Retrieves a clipboard item by its content SHA-256 hash.
pub fn get_item_by_hash(conn: &Connection, hash: &str) -> Result<Option<ClipboardItem>, VaultError> {
    let result = conn.query_row(
        "SELECT * FROM items WHERE content_hash = ?1",
        params![hash],
        row_to_clipboard_item,
    );

    match result {
        Ok(item) => Ok(Some(item)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(err) => Err(VaultError::Database(err)),
    }
}

/// Updates plain text in-place, recalculating content_hash and updating last_copied_at.
/// The SQLite AFTER UPDATE trigger automatically keeps FTS5 synchronized.
pub fn update_item_text(
    conn: &mut Connection,
    id: i64,
    new_text: &str,
    now_millis: i64,
) -> Result<ClipboardItem, VaultError> {
    let new_hash = NewClipboardItem::compute_text_hash(new_text);
    let tx = conn.transaction()?;

    let rows_affected = tx.execute(
        "UPDATE items 
         SET plain_text = ?1,
             content_hash = ?2,
             last_copied_at = ?3
         WHERE id = ?4",
        params![new_text, new_hash, now_millis, id],
    )?;

    if rows_affected == 0 {
        return Err(VaultError::NotFound(id));
    }

    let updated = tx.query_row(
        "SELECT * FROM items WHERE id = ?1",
        params![id],
        row_to_clipboard_item,
    )?;

    tx.commit()?;
    Ok(updated)
}

/// Toggles pinned status for an item.
pub fn toggle_pin_item(conn: &Connection, id: i64) -> Result<bool, VaultError> {
    let mut stmt = conn.prepare(
        "UPDATE items 
         SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END 
         WHERE id = ?1 
         RETURNING is_pinned",
    )?;

    let is_pinned: i64 = stmt
        .query_row(params![id], |row| row.get(0))
        .map_err(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => VaultError::NotFound(id),
            other => VaultError::Database(other),
        })?;

    Ok(is_pinned != 0)
}

/// Toggles favorite status for an item.
pub fn toggle_favorite_item(conn: &Connection, id: i64) -> Result<bool, VaultError> {
    let mut stmt = conn.prepare(
        "UPDATE items 
         SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END 
         WHERE id = ?1 
         RETURNING is_favorite",
    )?;

    let is_favorite: i64 = stmt
        .query_row(params![id], |row| row.get(0))
        .map_err(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => VaultError::NotFound(id),
            other => VaultError::Database(other),
        })?;

    Ok(is_favorite != 0)
}

/// Deletes an item by ID, returning its media_path (if any) for post-commit disk cleanup.
pub fn delete_item(conn: &mut Connection, id: i64) -> Result<Option<String>, VaultError> {
    let tx = conn.transaction()?;

    let media_path: Option<String> = tx
        .query_row(
            "SELECT media_path FROM items WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => VaultError::NotFound(id),
            other => VaultError::Database(other),
        })?;

    tx.execute("DELETE FROM items WHERE id = ?1", params![id])?;
    tx.commit()?;

    Ok(media_path)
}

/// Deletes multiple items in a single transaction, returning any media paths for disk cleanup.
pub fn bulk_delete_items(conn: &mut Connection, ids: &[i64]) -> Result<Vec<String>, VaultError> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let tx = conn.transaction()?;
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let select_sql = format!(
        "SELECT media_path FROM items WHERE id IN ({}) AND media_path IS NOT NULL",
        placeholders
    );

    let slice_ids: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
    let media_paths: Vec<String> = {
        let mut select_stmt = tx.prepare(&select_sql)?;
        let rows = select_stmt.query_map(&slice_ids[..], |row| row.get(0))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let delete_sql = format!("DELETE FROM items WHERE id IN ({})", placeholders);
    {
        let mut delete_stmt = tx.prepare(&delete_sql)?;
        delete_stmt.execute(&slice_ids[..])?;
    }
    tx.commit()?;

    Ok(media_paths)
}

/// Prunes unpinned items exceeding retention age or capacity limits.
/// Runs incremental auto-vacuum to release disk space.
pub fn prune_retention(
    conn: &mut Connection,
    max_items: Option<u64>,
    retention_days: Option<u64>,
    now_millis: i64,
) -> Result<(u64, Vec<String>), VaultError> {
    let mut target_ids: std::collections::HashSet<i64> = std::collections::HashSet::new();

    // 1. Age-based expiration for unpinned items
    if let Some(days) = retention_days
        && days > 0
    {
        let cutoff_millis = now_millis - (days as i64 * 86_400_000);
        let mut stmt = conn.prepare(
            "SELECT id, media_path FROM items WHERE is_pinned = 0 AND last_copied_at < ?1",
        )?;
        let rows = stmt.query_map([cutoff_millis], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        for row in rows {
            let (id, _) = row?;
            target_ids.insert(id);
        }
    }

    // 2. Capacity-based limit for unpinned items
    if let Some(max_cap) = max_items
        && max_cap > 0
    {
        let mut stmt = conn.prepare(
            "SELECT id, media_path FROM items WHERE is_pinned = 0 ORDER BY last_copied_at DESC LIMIT -1 OFFSET ?1",
        )?;
        let rows = stmt.query_map([max_cap as i64], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        for row in rows {
            let (id, _) = row?;
            target_ids.insert(id);
        }
    }

    if target_ids.is_empty() {
        return Ok((0, Vec::new()));
    }

    let ids_vec: Vec<i64> = target_ids.into_iter().collect();
    let deleted_media = bulk_delete_items(conn, &ids_vec)?;

    // Incremental vacuum to reclaim space without freezing UI
    let _ = conn.execute_batch("PRAGMA incremental_vacuum(50);");

    Ok((ids_vec.len() as u64, deleted_media))
}

/// Clears history, optionally preserving pinned items.
/// Returns the number of items deleted and any media paths for disk cleanup.
pub fn clear_history(conn: &mut Connection, keep_pinned: bool) -> Result<(u64, Vec<String>), VaultError> {
    let tx = conn.transaction()?;

    let select_sql = if keep_pinned {
        "SELECT media_path FROM items WHERE is_pinned = 0 AND media_path IS NOT NULL"
    } else {
        "SELECT media_path FROM items WHERE media_path IS NOT NULL"
    };

    let media_paths: Vec<String> = {
        let mut stmt = tx.prepare(select_sql)?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let count = if keep_pinned {
        tx.execute("DELETE FROM items WHERE is_pinned = 0", [])?
    } else {
        tx.execute("DELETE FROM items", [])?
    };

    tx.commit()?;
    Ok((count as u64, media_paths))
}

/// Checks how many items currently reference a specific media file path.
pub fn count_media_references(conn: &Connection, media_path: &str) -> Result<u64, VaultError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM items WHERE media_path = ?1",
        params![media_path],
        |row| row.get(0),
    )?;
    Ok(count as u64)
}

/// Lists items with filters, sorting, and pagination.
pub fn list_items(
    conn: &Connection,
    filter: &ItemFilter,
    sort: SortOrder,
    pagination: &PaginationParams,
) -> Result<PaginatedResult<ClipboardItem>, VaultError> {
    let mut where_clauses = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(format) = filter.format_type {
        where_clauses.push(format!("format_type = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(format.as_str().to_string()));
    }

    if let Some(pinned) = filter.is_pinned {
        where_clauses.push(format!("is_pinned = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(if pinned { 1 } else { 0 }));
    }

    if let Some(favorite) = filter.is_favorite {
        where_clauses.push(format!("is_favorite = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(if favorite { 1 } else { 0 }));
    }

    if let Some(start) = filter.start_timestamp_millis {
        where_clauses.push(format!("last_copied_at >= ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(start));
    }

    if let Some(end) = filter.end_timestamp_millis {
        where_clauses.push(format!("last_copied_at <= ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(end));
    }

    if let Some(col_id) = filter.collection_id {
        where_clauses.push(format!("id IN (SELECT item_id FROM item_collections WHERE collection_id = ?{})", params_vec.len() + 1));
        params_vec.push(Box::new(col_id));
    }

    if let Some(tag_id) = filter.tag_id {
        where_clauses.push(format!("id IN (SELECT item_id FROM item_tags WHERE tag_id = ?{})", params_vec.len() + 1));
        params_vec.push(Box::new(tag_id));
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let count_query = format!("SELECT COUNT(*) FROM items {}", where_sql);
    let mut count_stmt = conn.prepare(&count_query)?;
    let slice_params: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();
    let total: i64 = count_stmt.query_row(&slice_params[..], |row| row.get(0))?;

    let order_by_sql = match sort {
        SortOrder::Newest => "ORDER BY is_pinned DESC, last_copied_at DESC, id DESC",
        SortOrder::Oldest => "ORDER BY is_pinned DESC, last_copied_at ASC, id ASC",
        SortOrder::MostUsed => "ORDER BY is_pinned DESC, copy_count DESC, last_copied_at DESC, id DESC",
    };

    let list_query = format!(
        "SELECT * FROM items {} {} LIMIT ?{} OFFSET ?{}",
        where_sql,
        order_by_sql,
        params_vec.len() + 1,
        params_vec.len() + 2
    );

    params_vec.push(Box::new(pagination.limit as i64));
    params_vec.push(Box::new(pagination.offset as i64));

    let mut list_stmt = conn.prepare(&list_query)?;
    let full_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    let rows = list_stmt.query_map(&full_slice[..], row_to_clipboard_item)?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }

    let has_more = (pagination.offset as i64 + items.len() as i64) < total;

    Ok(PaginatedResult {
        items,
        total: total as u32,
        offset: pagination.offset,
        limit: pagination.limit,
        has_more,
    })
}

/// Sanitizes user search terms for FTS5 queries, preventing syntax errors and injection.
pub fn sanitize_fts5_query(raw_query: &str) -> String {
    let mut sanitized_tokens = Vec::new();

    for token in raw_query.split_whitespace() {
        // Strip out FTS5 control characters: " * ^ : ( ) { } [ ]
        let cleaned: String = token
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || *c == '.')
            .collect();

        if !cleaned.is_empty() {
            // Append '*' for instant prefix search
            sanitized_tokens.push(format!("\"{}\"*", cleaned));
        }
    }

    sanitized_tokens.join(" ")
}

/// Executes full-text search against the FTS5 virtual table using BM25 relevance ranking.
pub fn search_items(
    conn: &Connection,
    raw_query: &str,
    filter: &ItemFilter,
    limit: u32,
    offset: u32,
) -> Result<PaginatedResult<ClipboardItem>, VaultError> {
    let safe_limit = limit.clamp(1, 200);
    let sanitized = sanitize_fts5_query(raw_query);

    if sanitized.is_empty() {
        // Empty query returns paginated list items
        let pagination = PaginationParams::new(offset, safe_limit);
        return list_items(conn, filter, SortOrder::Newest, &pagination);
    }

    let mut where_clauses = vec!["items_fts MATCH ?1".to_string()];
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(sanitized)];

    if let Some(format) = filter.format_type {
        where_clauses.push(format!("items.format_type = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(format.as_str().to_string()));
    }

    if let Some(pinned) = filter.is_pinned {
        where_clauses.push(format!("items.is_pinned = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(if pinned { 1 } else { 0 }));
    }

    if let Some(favorite) = filter.is_favorite {
        where_clauses.push(format!("items.is_favorite = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(if favorite { 1 } else { 0 }));
    }

    if let Some(start) = filter.start_timestamp_millis {
        where_clauses.push(format!("items.last_copied_at >= ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(start));
    }

    if let Some(end) = filter.end_timestamp_millis {
        where_clauses.push(format!("items.last_copied_at <= ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(end));
    }

    if let Some(col_id) = filter.collection_id {
        where_clauses.push(format!("items.id IN (SELECT item_id FROM item_collections WHERE collection_id = ?{})", params_vec.len() + 1));
        params_vec.push(Box::new(col_id));
    }

    if let Some(tag_id) = filter.tag_id {
        where_clauses.push(format!("items.id IN (SELECT item_id FROM item_tags WHERE tag_id = ?{})", params_vec.len() + 1));
        params_vec.push(Box::new(tag_id));
    }

    let where_sql = format!("WHERE {}", where_clauses.join(" AND "));

    let count_query = if where_clauses.len() == 1 {
        // Fast path for text-only search: skip joining items table for row counting
        "SELECT COUNT(*) FROM items_fts WHERE items_fts MATCH ?1".to_string()
    } else {
        format!(
            "SELECT COUNT(*) 
             FROM items_fts 
             JOIN items ON items.id = items_fts.rowid 
             {}",
            where_sql
        )
    };

    let mut count_stmt = conn.prepare(&count_query)?;
    let slice_params: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();
    let total: i64 = count_stmt.query_row(&slice_params[..], |row| row.get(0))?;

    let search_query = format!(
        "SELECT items.*, bm25(items_fts) AS rank 
         FROM items_fts 
         JOIN items ON items.id = items_fts.rowid 
         {} 
         ORDER BY items.is_pinned DESC, rank ASC, items.last_copied_at DESC 
         LIMIT ?{} OFFSET ?{}",
        where_sql,
        params_vec.len() + 1,
        params_vec.len() + 2
    );

    params_vec.push(Box::new(safe_limit as i64));
    params_vec.push(Box::new(offset as i64));

    let mut search_stmt = conn.prepare(&search_query)?;
    let full_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    let rows = search_stmt.query_map(&full_slice[..], row_to_clipboard_item)?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }

    let has_more = (offset as i64 + items.len() as i64) < total;

    Ok(PaginatedResult {
        items,
        total: total as u32,
        offset,
        limit: safe_limit,
        has_more,
    })
}

/// Gets a persistent setting string value.
pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, VaultError> {
    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    );

    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(err) => Err(VaultError::Database(err)),
    }
}

/// Inserts or replaces a persistent setting value.
pub fn set_setting(
    conn: &Connection,
    key: &str,
    value: &str,
    now_millis: i64,
) -> Result<(), VaultError> {
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) 
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, now_millis],
    )?;
    Ok(())
}

/// Deletes a setting by key.
pub fn delete_setting(conn: &Connection, key: &str) -> Result<bool, VaultError> {
    let count = conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(count > 0)
}

/// Retrieves all settings as a key-value map.
pub fn get_all_settings(conn: &Connection) -> Result<HashMap<String, SettingRecord>, VaultError> {
    let mut stmt = conn.prepare("SELECT key, value, updated_at FROM settings")?;
    let rows = stmt.query_map([], |row| {
        Ok(SettingRecord {
            key: row.get(0)?,
            value: row.get(1)?,
            updated_at: row.get(2)?,
        })
    })?;

    let mut map = HashMap::new();
    for row in rows {
        let record = row?;
        map.insert(record.key.clone(), record);
    }
    Ok(map)
}

/// Verifies database structural and index integrity.
pub fn check_database_integrity(conn: &Connection) -> Result<Vec<String>, VaultError> {
    let mut stmt = conn.prepare("PRAGMA integrity_check;")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

    let mut issues = Vec::new();
    for row in rows {
        let msg = row?;
        if msg != "ok" {
            issues.push(msg);
        }
    }

    if !issues.is_empty() {
        return Err(VaultError::IntegrityCheckFailed(issues.join("; ")));
    }

    Ok(issues)
}

// ==========================================
// Phase 8: Tags, Collections, Snippets & Sequences
// ==========================================

/// Creates a new tag or returns existing if name matches case-insensitively.
pub fn create_tag(
    conn: &Connection,
    new_tag: &NewTag,
    now_millis: i64,
) -> Result<Tag, VaultError> {
    let name_trimmed = new_tag.name.trim();
    if name_trimmed.is_empty() {
        return Err(VaultError::InvalidInput("Tag name cannot be empty".to_string()));
    }
    let color = new_tag.color.as_deref().unwrap_or("#6366f1");

    let existing: Result<Tag, rusqlite::Error> = conn.query_row(
        "SELECT id, name, color, created_at FROM tags WHERE name = ?1 COLLATE NOCASE",
        params![name_trimmed],
        |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
            })
        },
    );

    if let Ok(tag) = existing {
        return Ok(tag);
    }

    conn.execute(
        "INSERT INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)",
        params![name_trimmed, color, now_millis],
    )?;
    let id = conn.last_insert_rowid();

    Ok(Tag {
        id,
        name: name_trimmed.to_string(),
        color: color.to_string(),
        created_at: now_millis,
    })
}

/// Lists all tags in alphabetical order.
pub fn list_tags(conn: &Connection) -> Result<Vec<Tag>, VaultError> {
    let mut stmt = conn.prepare("SELECT id, name, color, created_at FROM tags ORDER BY name ASC")?;
    let rows = stmt.query_map([], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;

    let mut tags = Vec::new();
    for row in rows {
        tags.push(row?);
    }
    Ok(tags)
}

/// Deletes a tag by ID.
pub fn delete_tag(conn: &Connection, id: i64) -> Result<bool, VaultError> {
    let count = conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
    Ok(count > 0)
}

/// Assigns a tag to an item.
pub fn tag_item(conn: &Connection, item_id: i64, tag_id: i64) -> Result<(), VaultError> {
    conn.execute(
        "INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?1, ?2)",
        params![item_id, tag_id],
    )?;
    Ok(())
}

/// Removes a tag from an item.
pub fn untag_item(conn: &Connection, item_id: i64, tag_id: i64) -> Result<(), VaultError> {
    conn.execute(
        "DELETE FROM item_tags WHERE item_id = ?1 AND tag_id = ?2",
        params![item_id, tag_id],
    )?;
    Ok(())
}

/// Retrieves all tags associated with an item.
pub fn get_item_tags(conn: &Connection, item_id: i64) -> Result<Vec<Tag>, VaultError> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color, t.created_at 
         FROM tags t 
         JOIN item_tags it ON it.tag_id = t.id 
         WHERE it.item_id = ?1 
         ORDER BY t.name ASC",
    )?;
    let rows = stmt.query_map(params![item_id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;

    let mut tags = Vec::new();
    for row in rows {
        tags.push(row?);
    }
    Ok(tags)
}

/// Creates or updates a collection by unique slug.
pub fn create_collection(
    conn: &Connection,
    new_col: &NewCollection,
    now_millis: i64,
) -> Result<Collection, VaultError> {
    let name_trimmed = new_col.name.trim();
    if name_trimmed.is_empty() {
        return Err(VaultError::InvalidInput("Collection name cannot be empty".to_string()));
    }
    let slug = if new_col.slug.trim().is_empty() {
        name_trimmed.to_lowercase().replace(' ', "-")
    } else {
        new_col.slug.trim().to_lowercase().replace(' ', "-")
    };

    let sort_order = new_col.sort_order.unwrap_or(0);

    conn.execute(
        "INSERT INTO collections (slug, name, icon, color, sort_order, created_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(slug) DO UPDATE SET 
            name = excluded.name, 
            icon = excluded.icon, 
            color = excluded.color, 
            sort_order = excluded.sort_order",
        params![
            slug,
            name_trimmed,
            new_col.icon,
            new_col.color,
            sort_order,
            now_millis
        ],
    )?;

    let col = conn.query_row(
        "SELECT id, slug, name, icon, color, sort_order, created_at FROM collections WHERE slug = ?1",
        params![slug],
        |row| {
            Ok(Collection {
                id: row.get(0)?,
                slug: row.get(1)?,
                name: row.get(2)?,
                icon: row.get(3)?,
                color: row.get(4)?,
                sort_order: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )?;

    Ok(col)
}

/// Lists all collections in display order.
pub fn list_collections(conn: &Connection) -> Result<Vec<Collection>, VaultError> {
    let mut stmt = conn.prepare(
        "SELECT id, slug, name, icon, color, sort_order, created_at 
         FROM collections 
         ORDER BY sort_order ASC, name ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Collection {
            id: row.get(0)?,
            slug: row.get(1)?,
            name: row.get(2)?,
            icon: row.get(3)?,
            color: row.get(4)?,
            sort_order: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;

    let mut cols = Vec::new();
    for row in rows {
        cols.push(row?);
    }
    Ok(cols)
}

/// Deletes a collection by ID.
pub fn delete_collection(conn: &Connection, id: i64) -> Result<bool, VaultError> {
    let count = conn.execute("DELETE FROM collections WHERE id = ?1", params![id])?;
    Ok(count > 0)
}

/// Assigns an item to a collection.
pub fn assign_item_collection(conn: &Connection, item_id: i64, collection_id: i64) -> Result<(), VaultError> {
    conn.execute(
        "INSERT OR IGNORE INTO item_collections (item_id, collection_id) VALUES (?1, ?2)",
        params![item_id, collection_id],
    )?;
    Ok(())
}

/// Removes an item from a collection.
pub fn remove_item_collection(conn: &Connection, item_id: i64, collection_id: i64) -> Result<(), VaultError> {
    conn.execute(
        "DELETE FROM item_collections WHERE item_id = ?1 AND collection_id = ?2",
        params![item_id, collection_id],
    )?;
    Ok(())
}

/// Retrieves all collections associated with an item.
pub fn get_item_collections(conn: &Connection, item_id: i64) -> Result<Vec<Collection>, VaultError> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.slug, c.name, c.icon, c.color, c.sort_order, c.created_at 
         FROM collections c 
         JOIN item_collections ic ON ic.collection_id = c.id 
         WHERE ic.item_id = ?1 
         ORDER BY c.sort_order ASC, c.name ASC",
    )?;
    let rows = stmt.query_map(params![item_id], |row| {
        Ok(Collection {
            id: row.get(0)?,
            slug: row.get(1)?,
            name: row.get(2)?,
            icon: row.get(3)?,
            color: row.get(4)?,
            sort_order: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;

    let mut cols = Vec::new();
    for row in rows {
        cols.push(row?);
    }
    Ok(cols)
}

/// Helper mapping row to SavedSnippet.
fn row_to_saved_snippet(row: &rusqlite::Row<'_>) -> rusqlite::Result<SavedSnippet> {
    Ok(SavedSnippet {
        id: row.get(0)?,
        title: row.get(1)?,
        trigger_prefix: row.get(2)?,
        content: row.get(3)?,
        syntax: row.get(4)?,
        description: row.get(5)?,
        is_pinned: row.get::<_, i64>(6)? != 0,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

/// Creates a new saved permanent snippet.
pub fn create_saved_snippet(
    conn: &Connection,
    new_snip: &NewSavedSnippet,
    now_millis: i64,
) -> Result<SavedSnippet, VaultError> {
    let title_trimmed = new_snip.title.trim();
    if title_trimmed.is_empty() {
        return Err(VaultError::InvalidInput("Snippet title cannot be empty".to_string()));
    }
    if new_snip.content.trim().is_empty() {
        return Err(VaultError::InvalidInput("Snippet content cannot be empty".to_string()));
    }

    let prefix = new_snip.trigger_prefix.as_ref().and_then(|p| {
        let trimmed = p.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    let syntax = new_snip.syntax.as_deref().unwrap_or("text");

    conn.execute(
        "INSERT INTO saved_snippets (title, trigger_prefix, content, syntax, description, is_pinned, created_at, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            title_trimmed,
            prefix,
            new_snip.content,
            syntax,
            new_snip.description,
            if new_snip.is_pinned { 1 } else { 0 },
            now_millis,
            now_millis
        ],
    )?;
    let id = conn.last_insert_rowid();

    Ok(SavedSnippet {
        id,
        title: title_trimmed.to_string(),
        trigger_prefix: prefix,
        content: new_snip.content.clone(),
        syntax: syntax.to_string(),
        description: new_snip.description.clone(),
        is_pinned: new_snip.is_pinned,
        created_at: now_millis,
        updated_at: now_millis,
    })
}

/// Retrieves a saved snippet by its ID.
pub fn get_saved_snippet_by_id(conn: &Connection, id: i64) -> Result<Option<SavedSnippet>, VaultError> {
    let result = conn.query_row(
        "SELECT id, title, trigger_prefix, content, syntax, description, is_pinned, created_at, updated_at 
         FROM saved_snippets WHERE id = ?1",
        params![id],
        row_to_saved_snippet,
    );

    match result {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(VaultError::Database(e)),
    }
}

/// Retrieves a saved snippet by its trigger prefix.
pub fn get_saved_snippet_by_prefix(conn: &Connection, prefix: &str) -> Result<Option<SavedSnippet>, VaultError> {
    let result = conn.query_row(
        "SELECT id, title, trigger_prefix, content, syntax, description, is_pinned, created_at, updated_at 
         FROM saved_snippets WHERE trigger_prefix = ?1",
        params![prefix],
        row_to_saved_snippet,
    );

    match result {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(VaultError::Database(e)),
    }
}

/// Updates an existing saved snippet.
pub fn update_saved_snippet(
    conn: &Connection,
    snip: &UpdateSavedSnippet,
    now_millis: i64,
) -> Result<SavedSnippet, VaultError> {
    let title_trimmed = snip.title.trim();
    if title_trimmed.is_empty() {
        return Err(VaultError::InvalidInput("Snippet title cannot be empty".to_string()));
    }
    if snip.content.trim().is_empty() {
        return Err(VaultError::InvalidInput("Snippet content cannot be empty".to_string()));
    }

    let prefix = snip.trigger_prefix.as_ref().and_then(|p| {
        let trimmed = p.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    let syntax = snip.syntax.as_deref().unwrap_or("text");

    let count = conn.execute(
        "UPDATE saved_snippets 
         SET title = ?1, trigger_prefix = ?2, content = ?3, syntax = ?4, description = ?5, is_pinned = ?6, updated_at = ?7 
         WHERE id = ?8",
        params![
            title_trimmed,
            prefix,
            snip.content,
            syntax,
            snip.description,
            if snip.is_pinned { 1 } else { 0 },
            now_millis,
            snip.id
        ],
    )?;

    if count == 0 {
        return Err(VaultError::NotFound(snip.id));
    }

    get_saved_snippet_by_id(conn, snip.id)?
        .ok_or(VaultError::NotFound(snip.id))
}

/// Deletes a saved snippet by ID.
pub fn delete_saved_snippet(conn: &Connection, id: i64) -> Result<bool, VaultError> {
    let count = conn.execute("DELETE FROM saved_snippets WHERE id = ?1", params![id])?;
    Ok(count > 0)
}

/// Lists all saved snippets.
pub fn list_saved_snippets(conn: &Connection) -> Result<Vec<SavedSnippet>, VaultError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, trigger_prefix, content, syntax, description, is_pinned, created_at, updated_at 
         FROM saved_snippets 
         ORDER BY is_pinned DESC, updated_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_saved_snippet)?;

    let mut snippets = Vec::new();
    for row in rows {
        snippets.push(row?);
    }
    Ok(snippets)
}

/// Creates a new reusable paste sequence with its ordered items in an atomic transaction.
pub fn create_paste_sequence(
    conn: &mut Connection,
    new_seq: &NewPasteSequence,
    now_millis: i64,
) -> Result<PasteSequence, VaultError> {
    let name_trimmed = new_seq.name.trim();
    if name_trimmed.is_empty() {
        return Err(VaultError::InvalidInput("Sequence name cannot be empty".to_string()));
    }
    if new_seq.items.is_empty() {
        return Err(VaultError::InvalidInput("Sequence must contain at least one item".to_string()));
    }

    let tx = conn.transaction()?;

    tx.execute(
        "INSERT INTO paste_sequences (name, description, loop_count, created_at, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            name_trimmed,
            new_seq.description,
            new_seq.loop_count.unwrap_or(1),
            now_millis,
            now_millis
        ],
    )?;
    let sequence_id = tx.last_insert_rowid();

    let mut inserted_items = Vec::new();
    for item in &new_seq.items {
        let delay_ms = item.delay_ms.unwrap_or(50);
        tx.execute(
            "INSERT INTO paste_sequence_items (sequence_id, item_id, static_text, sequence_order, delay_ms) 
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                sequence_id,
                item.item_id,
                item.static_text,
                item.sequence_order,
                delay_ms
            ],
        )?;
        let item_row_id = tx.last_insert_rowid();
        inserted_items.push(PasteSequenceItem {
            id: item_row_id,
            sequence_id,
            item_id: item.item_id,
            static_text: item.static_text.clone(),
            sequence_order: item.sequence_order,
            delay_ms,
        });
    }

    tx.commit()?;

    Ok(PasteSequence {
        id: sequence_id,
        name: name_trimmed.to_string(),
        description: new_seq.description.clone(),
        loop_count: new_seq.loop_count.unwrap_or(1),
        created_at: now_millis,
        updated_at: now_millis,
        items: inserted_items,
    })
}

/// Retrieves a paste sequence with its items.
pub fn get_paste_sequence(conn: &Connection, id: i64) -> Result<Option<PasteSequence>, VaultError> {
    let seq_res = conn.query_row(
        "SELECT id, name, description, loop_count, created_at, updated_at FROM paste_sequences WHERE id = ?1",
        params![id],
        |row| {
            Ok(PasteSequence {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                loop_count: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                items: Vec::new(),
            })
        },
    );

    let mut seq = match seq_res {
        Ok(s) => s,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(VaultError::Database(e)),
    };

    let mut item_stmt = conn.prepare(
        "SELECT id, sequence_id, item_id, static_text, sequence_order, delay_ms 
         FROM paste_sequence_items 
         WHERE sequence_id = ?1 
         ORDER BY sequence_order ASC",
    )?;
    let item_rows = item_stmt.query_map(params![id], |row| {
        Ok(PasteSequenceItem {
            id: row.get(0)?,
            sequence_id: row.get(1)?,
            item_id: row.get(2)?,
            static_text: row.get(3)?,
            sequence_order: row.get(4)?,
            delay_ms: row.get(5)?,
        })
    })?;

    for item in item_rows {
        seq.items.push(item?);
    }

    Ok(Some(seq))
}

/// Lists all paste sequences with items.
pub fn list_paste_sequences(conn: &Connection) -> Result<Vec<PasteSequence>, VaultError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, loop_count, created_at, updated_at 
         FROM paste_sequences 
         ORDER BY updated_at DESC",
    )?;
    let seq_rows = stmt.query_map([], |row| {
        Ok(PasteSequence {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            loop_count: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            items: Vec::new(),
        })
    })?;

    let mut sequences = Vec::new();
    for row in seq_rows {
        let mut seq = row?;
        let mut item_stmt = conn.prepare(
            "SELECT id, sequence_id, item_id, static_text, sequence_order, delay_ms 
             FROM paste_sequence_items 
             WHERE sequence_id = ?1 
             ORDER BY sequence_order ASC",
        )?;
        let items = item_stmt.query_map(params![seq.id], |r| {
            Ok(PasteSequenceItem {
                id: r.get(0)?,
                sequence_id: r.get(1)?,
                item_id: r.get(2)?,
                static_text: r.get(3)?,
                sequence_order: r.get(4)?,
                delay_ms: r.get(5)?,
            })
        })?;
        for it in items {
            seq.items.push(it?);
        }
        sequences.push(seq);
    }

    Ok(sequences)
}

/// Deletes a paste sequence by ID.
pub fn delete_paste_sequence(conn: &Connection, id: i64) -> Result<bool, VaultError> {
    let count = conn.execute("DELETE FROM paste_sequences WHERE id = ?1", params![id])?;
    Ok(count > 0)
}

/// Exports the complete vault data as a schema-versioned archive container.
pub fn export_vault_archive(conn: &Connection, now_millis: i64) -> Result<VaultArchiveDto, VaultError> {
    let mut item_stmt = conn.prepare(
        "SELECT content_hash, format_type, plain_text, html_content, detected_lang, is_pinned, is_favorite, created_at 
         FROM items 
         ORDER BY created_at ASC",
    )?;
    let item_rows = item_stmt.query_map([], |row| {
        let fmt_str: String = row.get(1)?;
        Ok(ClipboardItemExportDto {
            content_hash: row.get(0)?,
            format_type: FormatType::from_str_lossy(&fmt_str),
            plain_text: row.get(2)?,
            html_content: row.get(3)?,
            detected_lang: row.get(4)?,
            is_pinned: row.get::<_, i64>(5)? != 0,
            is_favorite: row.get::<_, i64>(6)? != 0,
            created_at: row.get(7)?,
        })
    })?;
    let mut items = Vec::new();
    for r in item_rows {
        items.push(r?);
    }

    let snippets = list_saved_snippets(conn)?;
    let collections = list_collections(conn)?;
    let tags = list_tags(conn)?;
    let sequences = list_paste_sequences(conn)?;

    Ok(VaultArchiveDto {
        version: 1,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: now_millis,
        items,
        snippets,
        collections,
        tags,
        sequences,
    })
}

/// Validates file paths and keys against directory traversal / Zip-Slip attacks.
pub fn validate_archive_key_path(path: &str) -> Result<(), VaultError> {
    if path.contains("..") || path.starts_with('/') || path.starts_with('\\') || path.contains('\0') {
        return Err(VaultError::InvalidInput(format!(
            "Illegal path traversal detected in archive item: {}",
            path
        )));
    }
    Ok(())
}

/// Imports vault archive data safely with format validation and merge/replace options.
pub fn import_vault_archive(
    conn: &mut Connection,
    archive: &VaultArchiveDto,
    mode: &str,
    _now_millis: i64,
) -> Result<ImportResultDto, VaultError> {
    if archive.version != 1 {
        return Err(VaultError::InvalidInput(format!(
            "Unsupported vault archive schema version: {}. Only version 1 is supported.",
            archive.version
        )));
    }

    let is_replace = mode.eq_ignore_ascii_case("replace");
    let tx = conn.transaction()?;

    if is_replace {
        tx.execute("DELETE FROM paste_sequence_items", [])?;
        tx.execute("DELETE FROM paste_sequences", [])?;
        tx.execute("DELETE FROM saved_snippets", [])?;
        tx.execute("DELETE FROM item_collections", [])?;
        tx.execute("DELETE FROM collections", [])?;
        tx.execute("DELETE FROM item_tags", [])?;
        tx.execute("DELETE FROM tags", [])?;
        tx.execute("DELETE FROM items", [])?;
    }

    let mut items_imported = 0;
    for item in &archive.items {
        let count = tx.execute(
            "INSERT INTO items (content_hash, format_type, plain_text, html_content, detected_lang, is_pinned, is_favorite, copy_count, created_at, last_copied_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8) 
             ON CONFLICT(content_hash) DO UPDATE SET copy_count = copy_count + 1",
            params![
                item.content_hash,
                item.format_type.as_str(),
                item.plain_text,
                item.html_content,
                item.detected_lang,
                if item.is_pinned { 1 } else { 0 },
                if item.is_favorite { 1 } else { 0 },
                item.created_at,
            ],
        )?;
        if count > 0 {
            items_imported += 1;
        }
    }

    let mut tags_imported = 0;
    for tag in &archive.tags {
        let count = tx.execute(
            "INSERT OR IGNORE INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)",
            params![tag.name, tag.color, tag.created_at],
        )?;
        if count > 0 {
            tags_imported += 1;
        }
    }

    let mut collections_imported = 0;
    for col in &archive.collections {
        validate_archive_key_path(&col.slug)?;
        let count = tx.execute(
            "INSERT INTO collections (slug, name, icon, color, sort_order, created_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6) 
             ON CONFLICT(slug) DO UPDATE SET name = excluded.name, icon = excluded.icon, color = excluded.color",
            params![col.slug, col.name, col.icon, col.color, col.sort_order, col.created_at],
        )?;
        if count > 0 {
            collections_imported += 1;
        }
    }

    let mut snippets_imported = 0;
    for snip in &archive.snippets {
        let count = tx.execute(
            "INSERT INTO saved_snippets (title, trigger_prefix, content, syntax, description, is_pinned, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) 
             ON CONFLICT(trigger_prefix) DO UPDATE SET title = excluded.title, content = excluded.content, updated_at = excluded.updated_at",
            params![
                snip.title,
                snip.trigger_prefix,
                snip.content,
                snip.syntax,
                snip.description,
                if snip.is_pinned { 1 } else { 0 },
                snip.created_at,
                snip.updated_at,
            ],
        )?;
        if count > 0 {
            snippets_imported += 1;
        }
    }

    let mut sequences_imported = 0;
    for seq in &archive.sequences {
        tx.execute(
            "INSERT INTO paste_sequences (name, description, loop_count, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![seq.name, seq.description, seq.loop_count, seq.created_at, seq.updated_at],
        )?;
        let seq_id = tx.last_insert_rowid();
        sequences_imported += 1;

        for it in &seq.items {
            tx.execute(
                "INSERT INTO paste_sequence_items (sequence_id, item_id, static_text, sequence_order, delay_ms) 
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![seq_id, it.item_id, it.static_text, it.sequence_order, it.delay_ms],
            )?;
        }
    }

    tx.commit()?;

    Ok(ImportResultDto {
        items_imported,
        snippets_imported,
        collections_imported,
        tags_imported,
        sequences_imported,
    })
}


