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
    assert_eq!(info.schema_version, 17);
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
    assert_eq!(reopened.inspect().unwrap().schema_version, 17);
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

#[test]
fn schema_eleven_without_deletion_fence_upgrades_and_preserves_existing_data() {
    let root = Workspace::new();
    drop(DatabaseWorker::start(root.0.clone()).unwrap());
    let db = Connection::open(root.0.join("lifestory.db")).unwrap();
    db.execute_batch("DROP TRIGGER chat_user_text_insert; ALTER TABLE ai_tasks DROP COLUMN reasoning_summary; ALTER TABLE ai_tasks DROP COLUMN effective_profile_json; DROP TABLE ai_request_receipts; DROP TABLE ai_adopted_ranges; DROP TABLE ai_previews; DROP TABLE ai_conversations; DROP TABLE ai_preferences; DROP TABLE ai_source_blocks; PRAGMA user_version=11; INSERT INTO workspace_metadata VALUES ('upgrade-probe','合成旧资料');").unwrap();
    drop(db);
    let worker = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(worker.inspect().unwrap().schema_version, 17);
    drop(worker);
    let db = Connection::open(root.0.join("lifestory.db")).unwrap();
    assert_eq!(
        db.query_row(
            "SELECT value FROM workspace_metadata WHERE key='upgrade-probe'",
            [],
            |r| r.get::<_, String>(0)
        )
        .unwrap(),
        "合成旧资料"
    );
    assert_eq!(
        db.query_row("SELECT count(*) FROM ai_source_blocks", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn schema_fourteen_upgrade_preserves_existing_configuration() {
    let root = Workspace::new();
    drop(DatabaseWorker::start(root.0.clone()).unwrap());
    let db = Connection::open(root.0.join("lifestory.db")).unwrap();
    db.execute_batch("DROP TRIGGER chat_user_text_insert; ALTER TABLE ai_tasks DROP COLUMN reasoning_summary; ALTER TABLE ai_tasks DROP COLUMN effective_profile_json; ALTER TABLE ai_conversations DROP COLUMN cli_profile_json; ALTER TABLE ai_conversations DROP COLUMN has_user_text; PRAGMA user_version=14;").unwrap();
    let raw = r#"{"id":"old-cli","label":"合成旧配置","service":"codex","protocol":"codex","baseUrl":"","model":"fixed-model","contextChars":32000,"maxOutputTokens":4096,"downstream":null,"codexPath":"/synthetic/codex"}"#;
    db.execute("INSERT INTO ai_profiles VALUES('old-cli',?1,0)", [raw])
        .unwrap();
    drop(db);
    let worker = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(worker.inspect().unwrap().schema_version, 17);
    let profile = worker.ai_profiles().unwrap().remove(0);
    assert_eq!(profile.model, "fixed-model");
    assert!(profile.cli_model_mode.is_none());
    assert!(profile.reasoning_effort.is_none());
}

#[test]
fn migrates_v15_task_metadata_without_rewriting_existing_data() {
    let root = Workspace::new();
    let worker = DatabaseWorker::start(root.0.clone()).unwrap();
    drop(worker);
    let sql = Connection::open(root.0.join("lifestory.db")).unwrap();
    sql.execute(
        "INSERT INTO workspace_metadata VALUES('migration-probe','合成旧资料')",
        [],
    )
    .unwrap();
    sql.execute_batch(
        "DROP TRIGGER chat_user_text_insert; ALTER TABLE ai_conversations DROP COLUMN has_user_text; ALTER TABLE ai_tasks DROP COLUMN reasoning_summary; PRAGMA user_version=15;",
    )
    .unwrap();
    drop(sql);
    let worker = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(worker.inspect().unwrap().schema_version, 17);
    drop(worker);
    let sql = Connection::open(root.0.join("lifestory.db")).unwrap();
    assert_eq!(
        sql.query_row(
            "SELECT value FROM workspace_metadata WHERE key='migration-probe'",
            [],
            |r| r.get::<_, String>(0)
        )
        .unwrap(),
        "合成旧资料"
    );
    sql.prepare("SELECT reasoning_summary FROM ai_tasks")
        .unwrap();
    assert!(
        fs::read_dir(root.0.join("migration-backups"))
            .unwrap()
            .any(|entry| entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("schema-15-"))
    );
}

#[test]
fn schema_sixteen_backfills_chat_text_flags_and_keeps_a_recoverable_backup() {
    use lifestory_studio_lib::chat_history::WindowRequest;
    use rusqlite::params;
    let root = Workspace::new();
    let worker = DatabaseWorker::start(root.0.clone()).unwrap();
    let chats: Vec<_> = (0..3)
        .map(|_| {
            worker
                .ai_create_conversation("2026-10-29".into(), "Asia/Shanghai".into())
                .unwrap()
        })
        .collect();
    drop(worker);
    let sql = Connection::open(root.0.join("lifestory.db")).unwrap();
    sql.execute_batch("DROP TRIGGER chat_user_text_insert; ALTER TABLE ai_conversations DROP COLUMN has_user_text; PRAGMA user_version=16;").unwrap();
    let contents = [
        r#"{"content":[{"text":"合成旧讲述"}]}"#,
        r#"{"text":"","images":["synthetic-image"]}"#,
        r#"{"text":"合成助手回应"}"#,
    ];
    for (i, content) in contents.iter().enumerate() {
        sql.execute(
            "INSERT INTO conversation_messages VALUES(?1,?2,0,?3,?4,?1,1)",
            params![
                format!("old-message-{i}"),
                chats[i],
                if i == 2 { "assistant" } else { "user" },
                content
            ],
        )
        .unwrap();
    }
    let before: Vec<_> = fs::read_dir(root.0.join("migration-backups"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    drop(sql);
    let worker = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(worker.inspect().unwrap().schema_version, 17);
    for (i, chat) in chats.iter().enumerate() {
        assert_eq!(
            worker
                .ai_chat_window(chat.clone(), WindowRequest::default())
                .unwrap()
                .page
                .has_user_text,
            i == 0
        );
    }
    drop(worker);
    let sql = Connection::open(root.0.join("lifestory.db")).unwrap();
    for (i, content) in contents.iter().enumerate() {
        assert_eq!(
            sql.query_row(
                "SELECT content_json FROM conversation_messages WHERE id=?1",
                [format!("old-message-{i}")],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
            *content
        );
    }
    let backup = fs::read_dir(root.0.join("migration-backups"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .find(|path| !before.contains(path))
        .unwrap();
    let backup = Connection::open(backup).unwrap();
    assert_eq!(
        backup
            .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
            .unwrap(),
        16
    );
    assert_eq!(
        backup
            .query_row("SELECT count(*) FROM conversation_messages", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
        3
    );
    assert!(
        backup
            .prepare("SELECT has_user_text FROM ai_conversations")
            .is_err()
    );
}

#[test]
fn failed_chat_flag_backfill_rolls_back_schema_and_preserves_old_content() {
    let root = Workspace::new();
    let worker = DatabaseWorker::start(root.0.clone()).unwrap();
    let chat = worker
        .ai_create_conversation("2026-10-29".into(), "Asia/Shanghai".into())
        .unwrap();
    drop(worker);
    let sql = Connection::open(root.0.join("lifestory.db")).unwrap();
    sql.execute_batch("DROP TRIGGER chat_user_text_insert; ALTER TABLE ai_conversations DROP COLUMN has_user_text; PRAGMA user_version=16; PRAGMA ignore_check_constraints=ON;").unwrap();
    sql.execute("INSERT INTO conversation_messages VALUES('invalid-legacy',?1,0,'user','{','invalid-legacy',1)",[chat]).unwrap();
    drop(sql);
    assert!(DatabaseWorker::start(root.0.clone()).is_err());
    let sql = Connection::open(root.0.join("lifestory.db")).unwrap();
    assert_eq!(
        sql.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
            .unwrap(),
        16
    );
    assert!(
        sql.prepare("SELECT has_user_text FROM ai_conversations")
            .is_err()
    );
    assert_eq!(
        sql.query_row(
            "SELECT content_json FROM conversation_messages WHERE id='invalid-legacy'",
            [],
            |row| row.get::<_, String>(0)
        )
        .unwrap(),
        "{"
    );
}
