use lifestory_studio_lib::{
    records::{CreateRecord, Record, RecordError, SaveRecord},
    storage::DatabaseWorker,
};
use rusqlite::Connection;
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
struct Workspace(PathBuf);
static NEXT: AtomicU64 = AtomicU64::new(0);
impl Workspace {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!(
            "lifestory-records-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&p).unwrap();
        Self(p)
    }
}
impl Drop for Workspace {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn create(db: &DatabaseWorker) -> Record {
    db.create_record(CreateRecord {
        request_id: "entry".into(),
        record_date: "2024-02-29".into(),
        created_timezone: "Asia/Shanghai".into(),
    })
    .unwrap()
}
fn save(record: &Record) -> SaveRecord {
    SaveRecord {
        record_id: record.id.clone(),
        base_revision_id: Some(record.revision_id.clone()),
        request_id: "save-one".into(),
        session_id: "session".into(),
        edit_sequence: 1,
        title: Some("补写旅行".into()),
        record_date: "2024-02-29".into(),
        tag_ids: vec![],
        document: json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"原文：标点，换行"}]},{"type":"paragraph","content":[{"type":"text","text":"下一段"}]}]}),
        attachment_ids: vec![],
    }
}
#[test]
fn save_retry_reopen_tags_and_conflict_preserve_content() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let entry = create(&db);
    let tag = db.create_tag(" e\u{301} ".into()).unwrap();
    assert_eq!(tag.id, db.create_tag("é".into()).unwrap().id);
    let mut input = save(&entry);
    input.tag_ids = vec![tag.id.clone()];
    let result = db.save_record(input.clone()).unwrap();
    assert_eq!(
        db.save_record(input.clone()).unwrap().revision_id,
        result.revision_id
    );
    let mut stale = input.clone();
    stale.request_id = "stale".into();
    stale.title = Some("不能覆盖".into());
    assert_eq!(
        db.save_record(stale)
            .unwrap_err()
            .downcast_ref::<RecordError>()
            .unwrap()
            .code,
        "conflict"
    );
    let mut reused = input.clone();
    reused.title = Some("请求不能复用".into());
    assert!(db.save_record(reused).is_err());
    drop(db);
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let reopened = db.read_record(entry.id).unwrap();
    assert_eq!(reopened.document, input.document);
    assert_eq!(reopened.title, input.title);
    assert_eq!(reopened.record_date, "2024-02-29");
    assert_eq!(reopened.tags[0].id, tag.id);
    let mut same = input.clone();
    same.request_id = "unchanged".into();
    same.base_revision_id = Some(reopened.revision_id.clone());
    assert_eq!(
        db.save_record(same).unwrap().revision_id,
        reopened.revision_id
    );
    assert_eq!(db.list_records(0).unwrap().len(), 1);
}
#[test]
fn validation_and_transaction_failure_never_change_current_record() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let entry = create(&db);
    let mut bad = save(&entry);
    bad.record_date = "2025-02-29".into();
    assert!(db.save_record(bad).is_err());
    let mut bad = save(&entry);
    bad.document =
        json!({"type":"doc","content":[{"type":"image","attrs":{"src":"file:///private"}}]});
    assert!(db.save_record(bad).is_err());
    let external = Connection::open(root.0.join("lifestory.db")).unwrap();
    external.execute_batch("CREATE TRIGGER reject_save BEFORE INSERT ON record_tags BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
    let tag = db.create_tag("测试".into()).unwrap();
    let mut input = save(&entry);
    input.tag_ids = vec![tag.id];
    assert!(db.save_record(input).is_err());
    let unchanged = db.read_record(entry.id).unwrap();
    assert_eq!(unchanged.revision_id, entry.revision_id);
    assert_eq!(unchanged.title, None);
    let count: i64 = external
        .query_row("SELECT count(*) FROM record_revisions", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
    drop(external);
}
#[test]
fn migration_keeps_a_snapshot_and_rolls_back_failed_schema_two() {
    let root = Workspace::new();
    let old = Connection::open(root.0.join("lifestory.db")).unwrap();
    old.execute_batch(include_str!("../migrations/001_workspace.sql"))
        .unwrap();
    old.execute_batch("PRAGMA user_version=1; CREATE TABLE records(sentinel TEXT); INSERT INTO records VALUES ('keep');").unwrap();
    drop(old);
    assert!(DatabaseWorker::start(root.0.clone()).is_err());
    let original = Connection::open(root.0.join("lifestory.db")).unwrap();
    assert_eq!(
        original
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        original
            .query_row("SELECT sentinel FROM records", [], |r| r
                .get::<_, String>(0))
            .unwrap(),
        "keep"
    );
    drop(original);
    let snapshot = fs::read_dir(root.0.join("migration-backups"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| p.extension().is_some_and(|e| e == "sqlite"))
        .unwrap();
    let copy = Connection::open(snapshot).unwrap();
    assert_eq!(
        copy.query_row("SELECT sentinel FROM records", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "keep"
    );
}
