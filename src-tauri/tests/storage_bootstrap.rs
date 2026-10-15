use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

use lifestory_studio_lib::storage::DatabaseWorker;
use rusqlite::Connection;

struct Workspace(PathBuf);

static NEXT_WORKSPACE_ID: AtomicU64 = AtomicU64::new(0);

impl Workspace {
    fn new() -> Self {
        let id = NEXT_WORKSPACE_ID.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("lifestory-test-{}-{id}", std::process::id()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}

impl Drop for Workspace {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn initializes_and_reopens_real_database_without_losing_metadata() {
    let root = Workspace::new();
    let worker = DatabaseWorker::start(root.0.clone()).unwrap();
    let info = worker.inspect().unwrap();
    assert_eq!(info.schema_version, 1);
    assert!(info.fts5_available);
    drop(worker);

    let connection = Connection::open(root.0.join("lifestory.db")).unwrap();
    connection
        .execute(
            "INSERT INTO workspace_metadata VALUES (?1, ?2)",
            ["probe", "合成数据：标点，换行\n仍须保留"],
        )
        .unwrap();
    drop(connection);

    let reopened = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(reopened.inspect().unwrap().schema_version, 1);
    drop(reopened);
    let connection = Connection::open(root.0.join("lifestory.db")).unwrap();
    let value: String = connection
        .query_row(
            "SELECT value FROM workspace_metadata WHERE key = 'probe'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(value, "合成数据：标点，换行\n仍须保留");
}

#[test]
fn refuses_newer_schema_without_mutating_existing_database() {
    let root = Workspace::new();
    let connection = Connection::open(root.0.join("lifestory.db")).unwrap();
    connection.execute_batch("PRAGMA user_version = 99; CREATE TABLE sentinel (value TEXT); INSERT INTO sentinel VALUES ('keep');").unwrap();
    drop(connection);

    assert!(DatabaseWorker::start(root.0.clone()).is_err());
    let connection = Connection::open(root.0.join("lifestory.db")).unwrap();
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 99);
    let value: String = connection
        .query_row("SELECT value FROM sentinel", [], |row| row.get(0))
        .unwrap();
    assert_eq!(value, "keep");
}

#[test]
fn failed_migration_keeps_version_and_existing_content() {
    let root = Workspace::new();
    let connection = Connection::open(root.0.join("lifestory.db")).unwrap();
    connection.execute_batch("CREATE TABLE workspace_metadata (value TEXT); INSERT INTO workspace_metadata VALUES ('keep');").unwrap();
    drop(connection);

    assert!(DatabaseWorker::start(root.0.clone()).is_err());
    let connection = Connection::open(root.0.join("lifestory.db")).unwrap();
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 0);
    let value: String = connection
        .query_row("SELECT value FROM workspace_metadata", [], |row| row.get(0))
        .unwrap();
    assert_eq!(value, "keep");
}
