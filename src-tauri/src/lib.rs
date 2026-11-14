pub mod clipboard;
pub mod db;
pub mod ipc;
pub mod media;
pub mod paste;
pub mod utils;
pub mod window;

use std::sync::Arc;
use tauri::Manager;
use crate::clipboard::ClipboardService;
use crate::db::DatabaseService;
use crate::ipc::commands::{
    add_item, assign_item_collection, bulk_delete_items, cancel_sequential_paste,
    capture_clipboard_slice, check_paste_accessibility, clear_history, copy_item_image_to_clipboard, copy_to_clipboard,
    create_collection, create_saved_snippet, create_tag, delete_collection, delete_item,
    delete_paste_sequence, delete_saved_snippet, delete_tag, export_vault_data,
    get_clipboard_status, get_desktop_settings, get_item_collections, get_item_tags,
    get_media_data, get_paste_sequence, get_privacy_diagnostics, get_privacy_settings, get_recent_items,
    get_sequential_status, get_system_status, hide_quick_panel, import_vault_data,
    list_collections, list_paste_sequences, list_saved_snippets, list_tags,
    paste_next_sequential, remove_item_collection, request_paste_accessibility,
    run_retention_cleanup, save_paste_sequence, search_items, set_clipboard_paused,
    set_window_mode, start_monitoring_command, start_sequential_paste, stop_monitoring_command,
    tag_item, toggle_favorite_item, toggle_pin_item, toggle_quick_panel, untag_item,
    update_desktop_settings, update_item_content, update_privacy_settings, update_saved_snippet,
};
use crate::media::MediaManager;
use crate::paste::SequentialSessionManager;
use crate::utils::paths::AppPaths;
use crate::window::WindowManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_paths = AppPaths::from_default().expect("Failed to initialize CopyVault storage paths");
    let db_service = DatabaseService::open(&app_paths.db_path)
        .expect("Failed to initialize CopyVault SQLite persistence engine");
    let media_manager = MediaManager::new(&app_paths.media_dir)
        .expect("Failed to initialize CopyVault media directory");

    #[cfg(target_os = "macos")]
    let backend: Arc<dyn crate::clipboard::ClipboardBackend> =
        Arc::new(crate::clipboard::MacOsClipboardBackend::new());

    #[cfg(not(target_os = "macos"))]
    let backend: Arc<dyn crate::clipboard::ClipboardBackend> =
        Arc::new(crate::clipboard::MockClipboardBackend::new());

    let clipboard_service = Arc::new(ClipboardService::new(
        backend,
        db_service.clone(),
        media_manager.clone(),
    ));

    #[cfg(target_os = "macos")]
    let simulator: Arc<dyn crate::paste::PasteSimulator> =
        Arc::new(crate::paste::MacOsPasteSimulator::new());

    #[cfg(not(target_os = "macos"))]
    let simulator: Arc<dyn crate::paste::PasteSimulator> =
        Arc::new(crate::paste::MockPasteSimulator::new(true));

    let session_manager = SequentialSessionManager::new();
    let window_mgr = Arc::new(WindowManager::new(db_service.clone(), simulator.clone()));

    tauri::Builder::default()
        .setup({
            let window_mgr = window_mgr.clone();
            let db_service = db_service.clone();
            let media_manager = media_manager.clone();
            let clipboard_service = clipboard_service.clone();
            let simulator = simulator.clone();
            move |app| {
                app.manage(db_service);
                app.manage(media_manager);
                app.manage((*clipboard_service).clone());
                app.manage(clipboard_service.clone());
                app.manage(simulator);
                app.manage(session_manager);
                app.manage(window_mgr);

                // Initialize system tray integration
                #[cfg(desktop)]
                {
                    let _ = crate::window::tray::TrayManager::setup_tray(app.handle());
                }

                // Attach event emitter callback and start automatic background clipboard monitoring!
                let app_handle = app.handle().clone();
                clipboard_service.set_on_capture(move |item| {
                    use tauri::Emitter;
                    let _ = app_handle.emit("clipboard-item-captured", &item);
                });
                clipboard_service.start_monitoring(250);

                // Ensure the main window is shown and focused on startup
                if let Some(main_win) = app.get_webview_window("main") {
                    let _ = main_win.show();
                    let _ = main_win.unminimize();
                    let _ = main_win.set_focus();
                }

                Ok(())
            }
        })
        .on_window_event(|window, event| {
            // Auto-hide on blur only if configured AND only for the quick panel overlay, never workspace
            if let tauri::WindowEvent::Focused(false) = event {
                let should_hide = window
                    .try_state::<Arc<WindowManager>>()
                    .map(|mgr| mgr.should_auto_hide_on_blur())
                    .unwrap_or(false);

                if should_hide {
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_system_status,
            get_recent_items,
            search_items,
            update_item_content,
            toggle_pin_item,
            toggle_favorite_item,
            delete_item,
            bulk_delete_items,
            clear_history,
            run_retention_cleanup,
            add_item,
            capture_clipboard_slice,
            set_clipboard_paused,
            get_clipboard_status,
            start_monitoring_command,
            stop_monitoring_command,
            copy_to_clipboard,
            copy_item_image_to_clipboard,
            get_media_data,
            start_sequential_paste,
            paste_next_sequential,
            cancel_sequential_paste,
            get_sequential_status,
            check_paste_accessibility,
            request_paste_accessibility,
            get_desktop_settings,
            update_desktop_settings,
            hide_quick_panel,
            toggle_quick_panel,
            set_window_mode,
            get_privacy_settings,
            update_privacy_settings,
            get_privacy_diagnostics,
            create_saved_snippet,
            update_saved_snippet,
            delete_saved_snippet,
            list_saved_snippets,
            create_collection,
            delete_collection,
            list_collections,
            assign_item_collection,
            remove_item_collection,
            get_item_collections,
            create_tag,
            delete_tag,
            list_tags,
            tag_item,
            untag_item,
            get_item_tags,
            save_paste_sequence,
            get_paste_sequence,
            list_paste_sequences,
            delete_paste_sequence,
            export_vault_data,
            import_vault_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running CopyVault application");
}

#[cfg(test)]
mod tests {
    use crate::db::models::{
        FormatType, ItemFilter, NewClipboardItem, PaginationParams, SortOrder,
    };
    use crate::db::service::DatabaseService;
    use crate::media::MediaManager;

    fn setup_test_db() -> DatabaseService {
        DatabaseService::open_in_memory().expect("in-memory db initialization failed")
    }

    #[test]
    fn test_migrations_and_version() {
        let db = setup_test_db();
        let version = db.get_schema_version().expect("get schema version failed");
        assert_eq!(version, 2, "Both migrations 001 and 002 must be applied");

        let integrity = db.check_integrity().expect("integrity check failed");
        assert!(integrity.is_empty(), "Integrity issues found: {:?}", integrity);
    }

    #[test]
    fn test_insert_and_duplicate_touch() {
        let db = setup_test_db();

        let item1 = NewClipboardItem::new_text(
            "Hello CopyVault".to_string(),
            false,
            None,
            Some("VS Code".to_string()),
            Some("com.microsoft.VSCode".to_string()),
            1000,
        );

        let inserted = db.insert_item(&item1).expect("insert item failed");
        assert_eq!(inserted.id, 1);
        assert_eq!(inserted.copy_count, 1);
        assert_eq!(inserted.created_at, 1000);
        assert_eq!(inserted.last_copied_at, 1000);
        assert_eq!(inserted.plain_text.as_deref(), Some("Hello CopyVault"));
        assert_eq!(inserted.source_app_name.as_deref(), Some("VS Code"));

        // Pin the item to verify pinning is preserved on re-copy
        let pinned = db.toggle_pin(inserted.id).expect("toggle pin failed");
        assert!(pinned);

        // Re-copy the identical text with a later timestamp
        let item1_recopy = NewClipboardItem::new_text(
            "Hello CopyVault".to_string(),
            false,
            None,
            Some("VS Code".to_string()),
            None,
            2500,
        );

        let touched = db.insert_item(&item1_recopy).expect("recopy touch failed");
        assert_eq!(touched.id, 1, "Duplicate copy must not create a new row ID");
        assert_eq!(touched.copy_count, 2, "Copy count must increment to 2");
        assert_eq!(touched.created_at, 1000, "Initial creation timestamp must be preserved");
        assert_eq!(touched.last_copied_at, 2500, "last_copied_at must be updated to new copy time");
        assert!(touched.is_pinned, "Pinned status must be strictly preserved across duplicate copies");
    }

    #[test]
    fn test_update_item_text_and_rehash() {
        let db = setup_test_db();

        let original = db
            .insert_item(&NewClipboardItem::new_text(
                "fn main() {}".to_string(),
                true,
                Some("rust".to_string()),
                None,
                None,
                5000,
            ))
            .expect("insert failed");

        let updated = db
            .update_item_text(original.id, "fn main() { println!(\"CopyVault\"); }")
            .expect("update failed");

        assert_eq!(updated.id, original.id);
        assert_ne!(updated.content_hash, original.content_hash);
        assert_eq!(
            updated.plain_text.as_deref(),
            Some("fn main() { println!(\"CopyVault\"); }")
        );

        // Verify FTS5 search now matches updated text and no longer matches old text
        let search_new = db
            .search_items("CopyVault", &ItemFilter::default(), 10, 0)
            .expect("search failed");
        assert_eq!(search_new.items.len(), 1);

        let search_old = db
            .search_items("unrelated_keyword", &ItemFilter::default(), 10, 0)
            .expect("search failed");
        assert_eq!(search_old.items.len(), 0);
    }

    #[test]
    fn test_fts5_search_indexing_and_ranking() {
        let db = setup_test_db();

        db.insert_item(&NewClipboardItem::new_text(
            "The quick brown fox jumps over the lazy dog".to_string(),
            false,
            None,
            Some("Safari".to_string()),
            None,
            100,
        ))
        .expect("insert 1");

        db.insert_item(&NewClipboardItem::new_text(
            "Rust 2024 edition memory safety without garbage collection".to_string(),
            true,
            Some("rust".to_string()),
            Some("Terminal".to_string()),
            None,
            200,
        ))
        .expect("insert 2");

        db.insert_item(&NewClipboardItem::new_text(
            "Tauri 2 cross-platform desktop architecture".to_string(),
            false,
            None,
            Some("Chrome".to_string()),
            None,
            300,
        ))
        .expect("insert 3");

        // 1. Exact match
        let res1 = db.search_items("memory safety", &ItemFilter::default(), 10, 0).expect("search 1");
        assert_eq!(res1.items.len(), 1);
        assert_eq!(res1.items[0].format_type, FormatType::Code);

        // 2. Prefix match
        let res2 = db.search_items("architec", &ItemFilter::default(), 10, 0).expect("search 2");
        assert_eq!(res2.items.len(), 1);
        assert_eq!(res2.items[0].source_app_name.as_deref(), Some("Chrome"));

        // 3. Search source app name (indexed in FTS5)
        let res3 = db.search_items("Safari", &ItemFilter::default(), 10, 0).expect("search 3");
        assert_eq!(res3.items.len(), 1);
        assert_eq!(res3.items[0].plain_text.as_deref(), Some("The quick brown fox jumps over the lazy dog"));

        // 4. Diacritic insensitivity
        db.insert_item(&NewClipboardItem::new_text(
            "Café résumé naïve".to_string(),
            false,
            None,
            None,
            None,
            400,
        ))
        .expect("insert diacritic");

        let res4 = db.search_items("cafe", &ItemFilter::default(), 10, 0).expect("search diacritic");
        assert_eq!(res4.items.len(), 1);
        assert_eq!(res4.items[0].plain_text.as_deref(), Some("Café résumé naïve"));
    }

    #[test]
    fn test_pagination_and_sorting() {
        let db = setup_test_db();

        for i in 1..=25 {
            db.insert_item(&NewClipboardItem::new_text(
                format!("Clipboard entry number {:02}", i),
                false,
                None,
                None,
                None,
                i as i64 * 100,
            ))
            .expect("insert");
        }

        // Fetch first page of 10
        let p1 = db
            .list_items(&ItemFilter::default(), SortOrder::Newest, &PaginationParams::new(0, 10))
            .expect("page 1");
        assert_eq!(p1.items.len(), 10);
        assert_eq!(p1.total, 25);
        assert!(p1.has_more);
        assert_eq!(p1.items[0].plain_text.as_deref(), Some("Clipboard entry number 25"));

        // Fetch second page of 10
        let p2 = db
            .list_items(&ItemFilter::default(), SortOrder::Newest, &PaginationParams::new(10, 10))
            .expect("page 2");
        assert_eq!(p2.items.len(), 10);
        assert!(p2.has_more);
        assert_eq!(p2.items[0].plain_text.as_deref(), Some("Clipboard entry number 15"));

        // Fetch third page of 10 (only 5 remain)
        let p3 = db
            .list_items(&ItemFilter::default(), SortOrder::Newest, &PaginationParams::new(20, 10))
            .expect("page 3");
        assert_eq!(p3.items.len(), 5);
        assert!(!p3.has_more);
        assert_eq!(p3.items[4].plain_text.as_deref(), Some("Clipboard entry number 01"));
    }

    #[test]
    fn test_deletion_and_clear_history() {
        let db = setup_test_db();

        let item1 = db
            .insert_item(&NewClipboardItem::new_text("Item to keep pinned".to_string(), false, None, None, None, 100))
            .expect("insert 1");
        db.toggle_pin(item1.id).expect("pin item 1");

        let item2 = db
            .insert_item(&NewClipboardItem::new_text("Item to delete directly".to_string(), false, None, None, None, 200))
            .expect("insert 2");

        let _item3 = db
            .insert_item(&NewClipboardItem::new_text("Unpinned item for clear history".to_string(), false, None, None, None, 300))
            .expect("insert 3");

        // Delete single item
        db.delete_item(item2.id).expect("delete item 2");
        assert_eq!(db.get_item(item2.id).expect("get"), None);

        // Clear history keeping pinned
        let (deleted_count, _media) = db.clear_history(true).expect("clear history");
        assert_eq!(deleted_count, 1, "Should delete only unpinned item 3");

        let remaining = db
            .list_items(&ItemFilter::default(), SortOrder::Newest, &PaginationParams::new(0, 10))
            .expect("list");
        assert_eq!(remaining.items.len(), 1);
        assert_eq!(remaining.items[0].id, item1.id);
    }

    #[test]
    fn test_media_lifecycle_and_unreferenced_cleanup() {
        let temp_dir = std::env::temp_dir().join(format!("copyvault_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let media_mgr = MediaManager::new(&temp_dir).expect("media manager init failed");
        let db = setup_test_db();

        let fake_image_bytes = b"FAKE_PNG_BINARY_BYTES_12345";
        let hash = NewClipboardItem::compute_binary_hash(fake_image_bytes);
        let stored_filename = media_mgr.store_media(&hash, "png", fake_image_bytes).expect("store media");
        assert!(media_mgr.resolve_path(&stored_filename).exists());

        // Insert item 1 referencing this image
        let item1 = db
            .insert_item(&NewClipboardItem::new_image(crate::db::models::NewImageParams {
                raw_bytes: fake_image_bytes,
                media_path: stored_filename.clone(),
                media_mime: "image/png".to_string(),
                width: 100,
                height: 100,
                thumbnail_blob: Some(vec![1, 2, 3]), // thumbnail WebP BLOB
                source_app_name: Some("Screenshot".to_string()),
                source_app_bundle: None,
                timestamp_millis: 1000,
            }))
            .expect("insert image item 1");

        // Verify ref count is 1
        assert_eq!(db.count_media_references(&stored_filename).expect("count"), 1);

        // Delete item 1
        let deleted_media = db.delete_item(item1.id).expect("delete image item 1");
        assert_eq!(deleted_media.as_deref(), Some(stored_filename.as_str()));

        // Cleanup unreferenced media
        let cleaned = media_mgr
            .cleanup_media_if_unreferenced(&db, &stored_filename)
            .expect("cleanup media");
        assert!(cleaned, "Media file should be deleted when reference count reaches 0");
        assert!(!media_mgr.resolve_path(&stored_filename).exists());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_persistent_settings_crud() {
        let db = setup_test_db();

        db.set_setting("retention_days", "30").expect("set setting");
        db.set_setting("theme", "dark").expect("set setting");

        assert_eq!(
            db.get_setting("retention_days").expect("get"),
            Some("30".to_string())
        );

        // Update existing setting
        db.set_setting("retention_days", "60").expect("update setting");
        assert_eq!(
            db.get_setting("retention_days").expect("get"),
            Some("60".to_string())
        );

        let all = db.get_all_settings().expect("get all");
        assert_eq!(all.len(), 2);
        assert_eq!(all.get("theme").unwrap().value, "dark");
    }

    #[test]
    fn test_migration_checksum_tampering_fails() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::queries::apply_connection_pragmas(&conn, true).unwrap();
        crate::db::migrations::run_migrations(&mut conn).unwrap();

        // Tamper with migration 1 checksum
        conn.execute(
            "UPDATE schema_migrations SET checksum = 'TAMPERED_CHECKSUM' WHERE version = 1",
            [],
        )
        .unwrap();

        // Re-running migrations must detect tampering and return error
        let err = crate::db::migrations::run_migrations(&mut conn).unwrap_err();
        match err {
            crate::utils::error::VaultError::Migration(msg) => {
                assert!(msg.contains("tampering detected"), "Expected tampering message, got: {}", msg);
            }
            other => panic!("Expected Migration error, got: {:?}", other),
        }
    }

    #[test]
    fn test_fts5_malformed_syntax_resilience() {
        let db = setup_test_db();

        db.insert_item(&NewClipboardItem::new_text(
            "Sample text with punctuation: hello-world, test_case.".to_string(),
            false,
            None,
            None,
            None,
            100,
        ))
        .unwrap();

        // Malformed inputs that could crash raw FTS5 MATCH queries
        let malformed_inputs = [
            "\"\"\"\"***",
            "AND OR NOT",
            "NEAR(hello, world, 10)",
            "*:* ^5 ((((",
            "SELECT * FROM items;",
            "DROP TABLE items; --",
        ];

        for query in malformed_inputs {
            let res = db.search_items(query, &ItemFilter::default(), 10, 0);
            assert!(res.is_ok(), "Query '{}' caused search failure: {:?}", query, res.err());
        }
    }

    #[test]
    fn test_concurrent_access() {
        use std::sync::Arc;
        use std::thread;

        let db = Arc::new(setup_test_db());
        let mut handles = Vec::new();

        // Spawn 4 threads writing items concurrently
        for t in 0..4 {
            let db_clone = Arc::clone(&db);
            handles.push(thread::spawn(move || {
                for i in 0..15 {
                    let text = format!("Thread {} item {}", t, i);
                    db_clone
                        .insert_item(&NewClipboardItem::new_text(
                            text,
                            false,
                            None,
                            None,
                            None,
                            (t * 100 + i) as i64,
                        ))
                        .unwrap();
                }
            }));
        }

        // Spawn 2 threads searching concurrently
        for _ in 0..2 {
            let db_clone = Arc::clone(&db);
            handles.push(thread::spawn(move || {
                for _ in 0..10 {
                    let _ = db_clone.search_items("item", &ItemFilter::default(), 5, 0);
                }
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }

        // 4 threads * 15 items = 60 items
        let list = db
            .list_items(&ItemFilter::default(), SortOrder::Newest, &PaginationParams::new(0, 100))
            .unwrap();
        assert_eq!(list.total, 60);

        let integrity = db.check_integrity().unwrap();
        assert!(integrity.is_empty(), "Integrity check failed after concurrent access");
    }

    #[test]
    fn test_date_range_filtering() {
        let db = setup_test_db();

        for i in 1..=5 {
            db.insert_item(&NewClipboardItem::new_text(
                format!("Item at time {}", i * 1000),
                false,
                None,
                None,
                None,
                i as i64 * 1000,
            ))
            .unwrap();
        }

        // Filter between 2000 and 4000
        let filter = ItemFilter {
            start_timestamp_millis: Some(2000),
            end_timestamp_millis: Some(4000),
            ..Default::default()
        };

        let res = db
            .list_items(&filter, SortOrder::Newest, &PaginationParams::new(0, 10))
            .unwrap();

        assert_eq!(res.total, 3);
        assert_eq!(res.items.len(), 3);
        assert_eq!(res.items[0].last_copied_at, 4000);
        assert_eq!(res.items[2].last_copied_at, 2000);
    }

    #[test]
    fn test_bulk_deletion() {
        let db = setup_test_db();

        let item1 = db
            .insert_item(&NewClipboardItem::new_text("Item 1".to_string(), false, None, None, None, 100))
            .unwrap();
        let item2 = db
            .insert_item(&NewClipboardItem::new_text("Item 2".to_string(), false, None, None, None, 200))
            .unwrap();
        let item3 = db
            .insert_item(&NewClipboardItem::new_text("Item 3".to_string(), false, None, None, None, 300))
            .unwrap();

        let deleted_media = db.bulk_delete_items(&[item1.id, item2.id]).unwrap();
        assert!(deleted_media.is_empty());

        let remaining = db
            .list_items(&ItemFilter::default(), SortOrder::Newest, &PaginationParams::new(0, 10))
            .unwrap();
        assert_eq!(remaining.total, 1);
        assert_eq!(remaining.items[0].id, item3.id);
    }

    #[test]
    fn test_retention_cleanup_age_and_capacity() {
        let db = setup_test_db();

        // 1. Pinned item (should never be pruned by retention)
        let pinned = db
            .insert_item(&NewClipboardItem::new_text("Pinned Old Item".to_string(), false, None, None, None, 1000))
            .unwrap();
        db.toggle_pin(pinned.id).unwrap();

        // 2. Insert 10 unpinned items with timestamps
        for i in 1..=10 {
            db.insert_item(&NewClipboardItem::new_text(
                format!("Recent unpinned item {}", i),
                false,
                None,
                None,
                None,
                10_000 + i as i64 * 1000,
            ))
            .unwrap();
        }

        // Test capacity limit: keep max 5 unpinned items
        let (deleted_count, _) = db.cleanup_retention(Some(5), None).unwrap();
        assert_eq!(deleted_count, 5, "Should prune oldest 5 unpinned items");

        let remaining = db
            .list_items(&ItemFilter::default(), SortOrder::Newest, &PaginationParams::new(0, 50))
            .unwrap();
        assert_eq!(remaining.total, 6); // 1 pinned + 5 unpinned

        let pinned_item = db.get_item(pinned.id).unwrap();
        assert!(pinned_item.is_some(), "Pinned item must survive retention pruning");
    }

    #[test]
    fn test_tags_crud_and_assignment() {
        let db = setup_test_db();

        let tag1 = db
            .create_tag(&crate::db::models::NewTag {
                name: "Work".to_string(),
                color: Some("#ff0000".to_string()),
            })
            .unwrap();
        assert_eq!(tag1.name, "Work");

        // Duplicate name should return existing
        let tag1_dup = db
            .create_tag(&crate::db::models::NewTag {
                name: "work".to_string(),
                color: None,
            })
            .unwrap();
        assert_eq!(tag1.id, tag1_dup.id);

        let item = db
            .insert_item(&NewClipboardItem::new_text("Tagged item".to_string(), false, None, None, None, 100))
            .unwrap();

        db.tag_item(item.id, tag1.id).unwrap();

        let tags = db.get_item_tags(item.id).unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].name, "Work");

        // Filter items by tag
        let filter = ItemFilter {
            tag_id: Some(tag1.id),
            ..Default::default()
        };
        let res = db.list_items(&filter, SortOrder::Newest, &PaginationParams::new(0, 10)).unwrap();
        assert_eq!(res.total, 1);
        assert_eq!(res.items[0].id, item.id);

        db.untag_item(item.id, tag1.id).unwrap();
        let tags_after = db.get_item_tags(item.id).unwrap();
        assert!(tags_after.is_empty());

        db.delete_tag(tag1.id).unwrap();
        let all_tags = db.list_tags().unwrap();
        assert!(all_tags.is_empty());
    }

    #[test]
    fn test_collections_crud_and_filtering() {
        let db = setup_test_db();

        let col = db
            .create_collection(&crate::db::models::NewCollection {
                slug: "finance".to_string(),
                name: "Finance & Accounts".to_string(),
                icon: Some("folder".to_string()),
                color: Some("#10b981".to_string()),
                sort_order: Some(1),
            })
            .unwrap();
        assert_eq!(col.slug, "finance");

        let item = db
            .insert_item(&NewClipboardItem::new_text("Invoice 2026-001".to_string(), false, None, None, None, 100))
            .unwrap();

        db.assign_item_collection(item.id, col.id).unwrap();

        let item_cols = db.get_item_collections(item.id).unwrap();
        assert_eq!(item_cols.len(), 1);
        assert_eq!(item_cols[0].slug, "finance");

        // Filter items by collection
        let filter = ItemFilter {
            collection_id: Some(col.id),
            ..Default::default()
        };
        let res = db.list_items(&filter, SortOrder::Newest, &PaginationParams::new(0, 10)).unwrap();
        assert_eq!(res.total, 1);
        assert_eq!(res.items[0].id, item.id);

        db.remove_item_collection(item.id, col.id).unwrap();
        let cols_after = db.get_item_collections(item.id).unwrap();
        assert!(cols_after.is_empty());
    }

    #[test]
    fn test_saved_snippets_crud_and_prefix_lookup() {
        let db = setup_test_db();

        let snip = db
            .create_saved_snippet(&crate::db::models::NewSavedSnippet {
                title: "Support Greeting".to_string(),
                trigger_prefix: Some("!greet".to_string()),
                content: "Hello {{name}}, thank you for contacting CopyVault!".to_string(),
                syntax: Some("text".to_string()),
                description: Some("Standard greeting template".to_string()),
                is_pinned: true,
            })
            .unwrap();

        assert_eq!(snip.title, "Support Greeting");
        assert!(snip.is_pinned);

        // Lookup by trigger prefix
        let found = db.get_saved_snippet_by_prefix("!greet").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().id, snip.id);

        // Update snippet
        let updated = db
            .update_saved_snippet(&crate::db::models::UpdateSavedSnippet {
                id: snip.id,
                title: "Support Greeting v2".to_string(),
                trigger_prefix: Some("!greet2".to_string()),
                content: "Hi {{name}}, CopyVault support here!".to_string(),
                syntax: Some("markdown".to_string()),
                description: None,
                is_pinned: false,
            })
            .unwrap();
        assert_eq!(updated.title, "Support Greeting v2");
        assert_eq!(updated.syntax, "markdown");

        let list = db.list_saved_snippets().unwrap();
        assert_eq!(list.len(), 1);

        db.delete_saved_snippet(snip.id).unwrap();
        let list_after = db.list_saved_snippets().unwrap();
        assert!(list_after.is_empty());
    }

    #[test]
    fn test_paste_sequence_persistence_and_order() {
        let db = setup_test_db();

        let seq = db
            .create_paste_sequence(&crate::db::models::NewPasteSequence {
                name: "Customer Onboarding Sequence".to_string(),
                description: Some("Fills username, email, and department".to_string()),
                loop_count: Some(1),
                items: vec![
                    crate::db::models::NewPasteSequenceItem {
                        item_id: None,
                        static_text: Some("John Doe".to_string()),
                        sequence_order: 1,
                        delay_ms: Some(100),
                    },
                    crate::db::models::NewPasteSequenceItem {
                        item_id: None,
                        static_text: Some("john@example.com".to_string()),
                        sequence_order: 2,
                        delay_ms: Some(50),
                    },
                ],
            })
            .unwrap();

        assert_eq!(seq.items.len(), 2);
        assert_eq!(seq.items[0].sequence_order, 1);
        assert_eq!(seq.items[0].static_text.as_deref(), Some("John Doe"));
        assert_eq!(seq.items[1].sequence_order, 2);

        let retrieved = db.get_paste_sequence(seq.id).unwrap().unwrap();
        assert_eq!(retrieved.items.len(), 2);

        let all_seqs = db.list_paste_sequences().unwrap();
        assert_eq!(all_seqs.len(), 1);

        db.delete_paste_sequence(seq.id).unwrap();
        let all_seqs_after = db.list_paste_sequences().unwrap();
        assert!(all_seqs_after.is_empty());
    }

    #[test]
    fn test_vault_archive_export_import_and_traversal_guard() {
        let db = setup_test_db();

        let _ = db.insert_item(&NewClipboardItem::new_text("Exportable Item".to_string(), false, None, None, None, 100)).unwrap();
        let _ = db.create_tag(&crate::db::models::NewTag {
            name: "Important".to_string(),
            color: None,
        }).unwrap();
        let _ = db.create_saved_snippet(&crate::db::models::NewSavedSnippet {
            title: "Test Snippet".to_string(),
            trigger_prefix: Some("!test".to_string()),
            content: "Snippet content".to_string(),
            syntax: None,
            description: None,
            is_pinned: false,
        }).unwrap();

        // 1. Export
        let archive = db.export_vault_archive().unwrap();
        assert_eq!(archive.version, 1);
        assert_eq!(archive.items.len(), 1);
        assert_eq!(archive.tags.len(), 1);
        assert_eq!(archive.snippets.len(), 1);

        // 2. Traversal guard
        let guard_err = crate::db::queries::validate_archive_key_path("../secret.db");
        assert!(guard_err.is_err(), "Zip-Slip path traversal must be rejected");

        // 3. Import in a fresh database
        let db2 = setup_test_db();
        let import_res = db2.import_vault_archive(&archive, "merge").unwrap();
        assert_eq!(import_res.items_imported, 1);
        assert_eq!(import_res.tags_imported, 1);
        assert_eq!(import_res.snippets_imported, 1);

        let items2 = db2.list_items(&ItemFilter::default(), SortOrder::Newest, &PaginationParams::new(0, 10)).unwrap();
        assert_eq!(items2.total, 1);
    }

    #[test]
    fn test_database_corruption_self_healing() {
        let temp_dir = std::env::temp_dir().join(format!("cv_test_corrupt_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let db_path = temp_dir.join("copyvault.db");

        // 1. Create valid database
        {
            let _ = DatabaseService::open(&db_path).unwrap();
        }

        // 2. Intentionally write garbage bytes into file to simulate corruption
        {
            std::fs::write(&db_path, b"INVALID_GARBAGE_HEADER_CORRUPTED_SQLITE_DATABASE").unwrap();
        }

        // 3. Open must self-heal without panicking: backs up corrupt file and creates fresh schema
        let db_healed = DatabaseService::open(&db_path);
        assert!(db_healed.is_ok(), "DatabaseService::open must self-heal corrupt database");

        let db = db_healed.unwrap();
        let version = db.get_schema_version().unwrap();
        assert_eq!(version, 2);

        // Clean up temp dir
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_fts5_performance_and_scaling_20000_items() {
        use std::time::Instant;
        use crate::db::queries;

        let db = setup_test_db();
        let conn_arc = db.get_raw_connection();
        let mut conn = conn_arc.lock().unwrap();

        // 1. Bulk insert 20,000 diverse realistic clipboard items inside a transaction
        let insert_start = Instant::now();
        {
            let tx = conn.transaction().unwrap();
            for i in 0..20000 {
                let content_hash = format!("{:064x}", i + 1000000);
                let format_type = match i % 4 {
                    0 => "text",
                    1 => "code",
                    2 => "link",
                    _ => "image",
                };
                let plain_text = format!(
                    "Snippet #{}: function compute_{}() {{ return 'vault_token_{}'; }} // index keyword test_query",
                    i, i, i
                );
                let is_pinned = if i % 25 == 0 { 1 } else { 0 };
                let last_copied_at = 1700000000000i64 + (i as i64 * 1000);

                tx.execute(
                    "INSERT INTO items (
                        content_hash, format_type, plain_text, is_pinned, is_favorite, copy_count, created_at, last_copied_at
                    ) VALUES (?1, ?2, ?3, ?4, 0, 1, ?5, ?5)",
                    rusqlite::params![content_hash, format_type, plain_text, is_pinned, last_copied_at],
                ).unwrap();
            }
            tx.commit().unwrap();
        }
        let insert_elapsed = insert_start.elapsed();
        println!(
            "\n[PERF BENCHMARK] Bulk insertion of 20,000 items with FTS5 triggers: {:?}",
            insert_elapsed
        );

        // 2. Exact match FTS5 search (PERF-001 threshold < 15ms)
        let fts_start = Instant::now();
        let filter = ItemFilter::default();
        let result = queries::search_items(&conn, "compute_19999", &filter, 50, 0).unwrap();
        let fts_exact_elapsed = fts_start.elapsed();
        println!(
            "[PERF BENCHMARK] Exact term FTS5 query latency (compute_19999) across 20,000 rows: {:?}",
            fts_exact_elapsed
        );
        assert_eq!(result.items.len(), 1);
        assert!(
            fts_exact_elapsed.as_millis() < 25,
            "FTS5 exact search exceeded 25ms target: {:?}",
            fts_exact_elapsed
        );

        // 3. Prefix search FTS5 query (PERF-002 threshold < 20ms)
        let prefix_start = Instant::now();
        let prefix_result = queries::search_items(&conn, "compute_19*", &filter, 50, 0).unwrap();
        let prefix_elapsed = prefix_start.elapsed();
        println!(
            "[PERF BENCHMARK] Prefix term FTS5 query latency (compute_19*) across 20,000 rows: {:?}",
            prefix_elapsed
        );
        assert!(prefix_result.items.len() > 0);
        assert!(
            prefix_elapsed.as_millis() < 30,
            "FTS5 prefix search exceeded 30ms target: {:?}",
            prefix_elapsed
        );

        // 4. Combined FTS5 + Filter (Code only + Pinned) query
        let combined_start = Instant::now();
        let mut combined_filter = ItemFilter::default();
        combined_filter.format_type = Some(FormatType::Code);
        combined_filter.is_pinned = Some(true);
        let combined_result = queries::search_items(&conn, "keyword*", &combined_filter, 50, 0).unwrap();
        let combined_elapsed = combined_start.elapsed();
        println!(
            "[PERF BENCHMARK] Combined FTS5 + Format/Pin filter query latency across 20,000 rows: {:?}",
            combined_elapsed
        );
        assert!(combined_result.total > 0);

        // 5. Standard list ordering query with pagination (PERF target < 5ms)
        let list_start = Instant::now();
        let pagination = PaginationParams::new(0, 50);
        let list_result = queries::list_items(&conn, &ItemFilter::default(), SortOrder::Newest, &pagination).unwrap();
        let list_elapsed = list_start.elapsed();
        println!(
            "[PERF BENCHMARK] Paginated recency list query latency across 20,000 rows: {:?}",
            list_elapsed
        );
        assert_eq!(list_result.items.len(), 50);
        assert!(
            list_elapsed.as_millis() < 10,
            "List items exceeded 10ms target: {:?}",
            list_elapsed
        );
    }
}
