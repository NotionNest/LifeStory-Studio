use lifestory_studio_lib::{
    attachments::{AttachmentOperation, ImportImage},
    library_query::LibraryQuery,
    records::{CreateRecord, SaveRecord},
    recovery::BeginEdit,
    storage::DatabaseWorker,
    trash::{RETENTION_MS, TrashRequest},
};
use rusqlite::{Connection, params};
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Workspace(PathBuf);
impl Workspace {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!(
            "trash-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&p).unwrap();
        Self(p)
    }
    fn sql(&self) -> Connection {
        let c = Connection::open(self.0.join("lifestory.db")).unwrap();
        c.pragma_update(None, "foreign_keys", "ON").unwrap();
        c
    }
}
impl Drop for Workspace {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn add(db: &DatabaseWorker, id: &str) {
    db.create_record(CreateRecord {
        request_id: id.into(),
        record_date: "2026-10-21".into(),
        created_timezone: "Asia/Shanghai".into(),
    })
    .unwrap();
}
fn move_to_trash(db: &DatabaseWorker, id: &str) {
    let i = db.trash_impact(id.into()).unwrap();
    db.trash_move(TrashRequest {
        record_id: id.into(),
        expected_content_version: i.content_version,
        expected_impact: i.impact_token,
    })
    .unwrap();
}
fn deleted(db: &DatabaseWorker, id: &str) -> i64 {
    db.trash_list(0)
        .unwrap()
        .items
        .iter()
        .find(|i| i.id == id)
        .unwrap()
        .deleted_at
}
#[test]
fn trash_restores_without_replaying_old_sessions_and_rejects_stale_actions() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    add(&db, "a");
    let editing = db
        .begin_edit(BeginEdit {
            record_id: "a".into(),
            expected_content_version: 0,
            recovery: None,
        })
        .unwrap();
    move_to_trash(&db, "a");
    let at = deleted(&db, "a");
    assert!(db.read_record("a".into()).is_err());
    assert_eq!(db.query_library(LibraryQuery::default()).unwrap().total, 0);
    let old = SaveRecord {
        record_id: "a".into(),
        base_revision_id: Some(editing.record.revision_id.clone()),
        base_content_version: Some(0),
        request_id: "late".into(),
        session_id: editing.session_id,
        edit_sequence: 1,
        title: Some("晚到内容".into()),
        record_date: "2026-10-21".into(),
        document: editing.record.document,
        tag_ids: vec![],
        attachment_ids: vec![],
    };
    assert!(db.save_record(old.clone()).is_err());
    db.trash_restore("a".into(), at).unwrap();
    assert!(db.save_record(old).is_err());
    assert_eq!(db.query_library(LibraryQuery::default()).unwrap().total, 1);
    assert!(db.trash_purge("a".into(), at).is_err());
    move_to_trash(&db, "a");
    let newer = deleted(&db, "a");
    assert_ne!(newer, at);
    if newer != at {
        assert!(db.trash_restore("a".into(), at).is_err());
        assert!(db.trash_purge("a".into(), at).is_err());
    }
    db.trash_purge("a".into(), newer).unwrap();
    db.trash_purge("a".into(), newer).unwrap();
    assert!(db.trash_list(0).unwrap().items.is_empty());
}
#[test]
fn purge_clears_private_rows_and_preserves_independent_draft_with_unavailable_source() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    add(&db, "source");
    add(&db, "draft");
    let sql = root.sql();
    sql.execute("UPDATE records SET title='独立稿件',kind='draft',working_text='独立创作内容' WHERE id='draft'",[]).unwrap();
    sql.execute(
        "UPDATE records SET title='原文秘密',working_text='被删除的私密原文' WHERE id='source'",
        [],
    )
    .unwrap();
    let revision: String = sql
        .query_row(
            "SELECT current_revision_id FROM records WHERE id='source'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let old = db.trash_impact("source".into()).unwrap();
    sql.execute("INSERT INTO record_relations(id,owner_id,source_id,source_revision_id,relation_kind) VALUES('relation','draft','source',?1,'draft_source')",[&revision]).unwrap();
    assert!(
        db.trash_move(TrashRequest {
            record_id: "source".into(),
            expected_content_version: old.content_version,
            expected_impact: old.impact_token
        })
        .is_err()
    );
    assert_eq!(
        db.trash_impact("source".into()).unwrap().references.len(),
        1
    );
    sql.execute("INSERT INTO conversation_messages VALUES('message','source',0,'user',?1,'message-request',1)",[json!({"text":"私密消息"}).to_string()]).unwrap();
    sql.execute(
        "INSERT INTO recovery_drafts VALUES('source',?1,'old',1,'{}',1)",
        [&revision],
    )
    .unwrap();
    sql.execute(
        "INSERT INTO revision_pins VALUES(?1,'test','owner')",
        [&revision],
    )
    .unwrap();
    move_to_trash(&db, "source");
    let at = deleted(&db, "source");
    assert!(db.preview_library_content("draft".into()).unwrap().sources[0].unavailable);
    db.trash_purge("source".into(), at).unwrap();
    for table in [
        "records",
        "record_revisions",
        "recovery_drafts",
        "conversation_messages",
        "record_save_receipts",
        "history_restore_receipts",
        "attachment_receipts",
        "edit_sessions",
    ] {
        let column = if table == "records" {
            "id"
        } else {
            "record_id"
        };
        let n: i64 = sql
            .query_row(
                &format!("SELECT count(*) FROM {table} WHERE {column}='source'"),
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 0, "{table}");
    }
    assert_eq!(
        sql.query_row(
            "SELECT count(*) FROM record_search WHERE record_id='source'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
    let status:(Option<String>,Option<String>,String,i64)=sql.query_row("SELECT source_id,source_revision_id,unavailable_source_id,source_deleted FROM record_relations WHERE id='relation'",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).unwrap();
    assert_eq!(status, (None, None, "source".into(), 1));
    assert!(db.preview_library_content("draft".into()).unwrap().sources[0].unavailable);
    assert!(db.read_record("draft".into()).is_err()); // draft stays readable through its own preview, not the text editor.
    assert_eq!(
        db.preview_library_content("draft".into())
            .unwrap()
            .title
            .as_deref(),
        Some("独立稿件")
    );
    assert!(
        sql.query_row("PRAGMA foreign_key_check", [], |_| Ok(()))
            .optional()
            .unwrap()
            .is_none()
    );
}
use rusqlite::OptionalExtension;
#[test]
fn due_boundary_and_transaction_failure_are_retryable() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    add(&db, "due");
    move_to_trash(&db, "due");
    let sql = root.sql();
    let now: i64 = sql
        .query_row(
            "SELECT CAST(unixepoch('subsec')*1000 AS INTEGER)",
            [],
            |r| r.get(0),
        )
        .unwrap();
    sql.execute(
        "UPDATE records SET deleted_at=?1,purge_at=?2 WHERE id='due'",
        params![now - RETENTION_MS + 60_000, now + 60_000],
    )
    .unwrap();
    assert_eq!(db.trash_list(0).unwrap().items.len(), 1);
    sql.execute(
        "UPDATE records SET deleted_at=?1,purge_at=?2 WHERE id='due'",
        params![now - RETENTION_MS - 1, now - 1],
    )
    .unwrap();
    sql.execute_batch("CREATE TRIGGER block_delete BEFORE DELETE ON records BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
    let page = db.trash_list(0).unwrap();
    assert!(page.cleanup_error.is_some());
    assert_eq!(page.items.len(), 1);
    assert!(
        db.trash_restore("due".into(), now - RETENTION_MS - 1)
            .is_err()
    );
    sql.execute_batch("DROP TRIGGER block_delete;").unwrap();
    assert!(db.trash_list(0).unwrap().items.is_empty());
}
#[test]
fn shared_images_survive_and_failed_physical_cleanup_retries_after_restart() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    add(&db, "one");
    add(&db, "two");
    for record in ["one", "two"] {
        let r = db.read_record(record.into()).unwrap();
        let s = db
            .begin_edit(BeginEdit {
                record_id: record.into(),
                expected_content_version: r.content_version,
                recovery: None,
            })
            .unwrap();
        let aid = format!("image-{record}");
        let doc = json!({"type":"doc","content":[{"type":"attachmentImage","attrs":{"attachmentId":aid}}]});
        db.import_image(
            ImportImage {
                operation: AttachmentOperation {
                    record_id: record.into(),
                    session_id: s.session_id,
                    expected_content_version: s.record.content_version,
                    request_id: aid,
                },
                name: "synthetic.png".into(),
                document: doc,
            },
            include_bytes!("../../tools/image-validation/fixtures/static.png").to_vec(),
        )
        .unwrap();
    }
    let sql = root.sql();
    assert_eq!(
        sql.query_row("SELECT count(*) FROM image_objects", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        1
    );
    move_to_trash(&db, "one");
    db.trash_purge("one".into(), deleted(&db, "one")).unwrap();
    assert_eq!(db.read_record("two".into()).unwrap().attachments.len(), 1);
    let relative: String = sql
        .query_row("SELECT relative_path FROM image_objects", [], |r| r.get(0))
        .unwrap();
    let path = root.0.join(relative);
    let bytes = fs::read(&path).unwrap();
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    move_to_trash(&db, "two");
    let at = deleted(&db, "two");
    assert!(db.trash_purge("two".into(), at).is_err());
    assert_eq!(
        sql.query_row("SELECT state FROM image_objects", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "pending_delete"
    );
    assert!(db.trash_list(0).unwrap().cleanup_error.is_some());
    drop(db);
    fs::remove_dir(&path).unwrap();
    fs::write(&path, bytes).unwrap();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    assert!(db.trash_list(0).unwrap().cleanup_error.is_none());
    assert!(!path.exists());
    assert_eq!(
        sql.query_row("SELECT count(*) FROM image_objects", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
}
