use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use crate::utils::error::VaultError;

/// Migration definition containing version number, description, and raw SQL.
#[derive(Debug, Clone)]
pub struct Migration {
    pub version: i32,
    pub description: &'static str,
    pub sql: &'static str,
}

impl Migration {
    pub fn checksum(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.sql.as_bytes());
        format!("{:x}", hasher.finalize())
    }
}

/// Ordered list of embedded schema migrations.
pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "Initial core schema with items, indices, settings and FTS5 virtual table",
            sql: include_str!("../../migrations/001_initial_core_schema.sql"),
        },
        Migration {
            version: 2,
            description: "Collections, tags, saved snippets, and reusable paste sequences",
            sql: include_str!("../../migrations/002_collections_tags_and_snippets.sql"),
        },
    ]
}

/// Applies all unapplied migrations transactionally and verifies checksum integrity.
pub fn run_migrations(conn: &mut Connection) -> Result<u32, VaultError> {
    // 1. Ensure migrations tracking table exists
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL,
            description TEXT NOT NULL,
            checksum TEXT NOT NULL
        );",
    )?;

    let migrations = get_migrations();
    let mut applied_count = 0;

    for migration in migrations {
        let expected_checksum = migration.checksum();

        // Check if this migration version is already recorded
        let recorded_checksum: Option<String> = {
            let mut stmt = conn.prepare(
                "SELECT checksum FROM schema_migrations WHERE version = ?1",
            )?;
            let mut rows = stmt.query([migration.version])?;
            if let Some(row) = rows.next()? {
                Some(row.get(0)?)
            } else {
                None
            }
        };

        if let Some(recorded) = recorded_checksum {
            if recorded != expected_checksum {
                return Err(VaultError::Migration(format!(
                    "Migration checksum mismatch for version {}. Expected: {}, Recorded: {}. Schema tampering detected.",
                    migration.version, expected_checksum, recorded
                )));
            }
            // Already applied and valid
            continue;
        }

        // Apply new migration inside an atomic transaction
        let tx = conn.transaction()?;
        tx.execute_batch(migration.sql)?;

        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        tx.execute(
            "INSERT INTO schema_migrations (version, applied_at, description, checksum)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                migration.version,
                now_millis,
                migration.description,
                expected_checksum,
            ],
        )?;

        tx.commit()?;
        applied_count += 1;
    }

    Ok(applied_count)
}

/// Gets the highest applied migration version or 0 if none applied.
pub fn get_current_schema_version(conn: &Connection) -> Result<i32, VaultError> {
    let mut stmt = conn.prepare("SELECT COALESCE(MAX(version), 0) FROM schema_migrations")?;
    let version = stmt.query_row([], |row| row.get(0)).unwrap_or(0);
    Ok(version)
}
