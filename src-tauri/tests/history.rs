use lifestory_studio_lib::{
    history::{HISTORY_RETENTION_MS, RestoreHistory},
    records::{CreateRecord, Record, RecordError, SaveRecord},
    recovery::{BeginEdit, EditingSession},
    storage::DatabaseWorker,
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
        let path = std::env::temp_dir().join(format!(
            "lifestory-history-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn sql(&self) -> Connection {
        let db = Connection::open(self.0.join("lifestory.db")).unwrap();
        db.pragma_update(None, "foreign_keys", "ON").unwrap();
        db
    }
}
impl Drop for Workspace {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn create(db: &DatabaseWorker, id: &str) -> Record {
    db.create_record(CreateRecord {
        request_id: id.into(),
        record_date: "2026-10-19".into(),
        created_timezone: "Asia/Shanghai".into(),
    })
    .unwrap()
}
fn begin(db: &DatabaseWorker, r: &Record) -> EditingSession {
    db.begin_edit(BeginEdit {
        record_id: r.id.clone(),
        expected_content_version: r.content_version,
        recovery: None,
    })
    .unwrap()
}
fn input(s: &EditingSession, text: &str, n: u32) -> SaveRecord {
    SaveRecord {
        record_id: s.record.id.clone(),
        base_revision_id: Some(s.record.revision_id.clone()),
        base_content_version: Some(s.record.content_version),
        session_id: s.session_id.clone(),
        edit_sequence: n,
        request_id: format!("save-{}-{n}", s.session_id),
        title: Some(text.into()),
        record_date: "2026-10-18".into(),
        tag_ids: vec![],
        document: json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]}),
        attachment_ids: vec![],
    }
}
fn prepare(db: &DatabaseWorker) -> (String, EditingSession, SaveRecord) {
    let r = create(db, "entry");
    let s = begin(db, &r);
    let mut a = input(&s, "第一轮", 1);
    let tag = db.create_tag("旧标签".into()).unwrap();
    a.tag_ids.push(tag.id);
    db.save_record(a).unwrap();
    let s = begin(db, &db.read_record("entry".into()).unwrap());
    let source = s.record.revision_id.clone();
    let mut b = input(&s, "恢复前新内容", 1);
    b.record_date = "".into();
    db.save_record(b.clone()).unwrap();
    let r = db.read_record("entry".into()).unwrap();
    (
        source,
        EditingSession {
            record: r,
            session_id: s.session_id,
            recovered: None,
            recovered_tags: vec![],
        },
        b,
    )
}
fn request(source: &str, s: &EditingSession) -> RestoreHistory {
    RestoreHistory {
        record_id: s.record.id.clone(),
        revision_id: source.into(),
        expected_content_version: s.record.content_version,
        session_id: s.session_id.clone(),
        request_id: "restore-request".into(),
    }
}
#[test]
fn restore_is_atomic_idempotent_and_preserves_both_rounds_across_reopen() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let (source, s, stale) = prepare(&db);
    let restored = db.history_restore(request(&source, &s)).unwrap();
    let replay = db.history_restore(request(&source, &s)).unwrap();
    assert_eq!(restored.session_id, replay.session_id);
    assert_eq!(restored.record.revision_id, replay.record.revision_id);
    assert_eq!(restored.record.title.as_deref(), Some("第一轮"));
    assert_eq!(restored.record.record_date, "2026-10-18");
    assert_eq!(restored.record.tags[0].name, "旧标签");
    assert_ne!(restored.session_id, s.session_id);
    assert!(db.save_record(stale).is_err());
    let page = db.history_list("entry".into(), None).unwrap();
    assert_eq!(page.items.len(), 3);
    let before = page
        .items
        .iter()
        .find(|h| h.excerpt.contains("恢复前新内容"))
        .unwrap();
    let before = db.history_read("entry".into(), before.id.clone()).unwrap();
    assert_eq!(before.snapshot.unwrap().record_date, "");
    let mut next = input(&restored, "恢复后继续写", 1);
    next.tag_ids = restored.record.tags.iter().map(|t| t.id.clone()).collect();
    db.save_record(next).unwrap();
    assert!(db.history_restore(request(&source, &s)).is_err());
    drop(db);
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(
        db.read_record("entry".into()).unwrap().title.as_deref(),
        Some("恢复后继续写")
    );
    assert_eq!(
        db.history_list("entry".into(), None).unwrap().items.len(),
        3
    );
    let sql = root.sql();
    let indexed: String = sql
        .query_row(
            "SELECT content FROM record_search WHERE record_id='entry'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(indexed.contains("恢复后继续写"));
    assert_eq!(
        sql.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r
            .get::<_, i64>(
            0
        ))
        .unwrap(),
        0
    );
}
#[test]
fn stale_version_wrong_session_cross_record_and_failure_leave_content_unchanged() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let (source, s, _) = prepare(&db);
    let mut r = request(&source, &s);
    r.expected_content_version -= 1;
    assert_eq!(
        db.history_restore(r)
            .err()
            .unwrap()
            .downcast_ref::<RecordError>()
            .unwrap()
            .code,
        "conflict"
    );
    let mut r = request(&source, &s);
    r.session_id = "other".into();
    assert!(db.history_restore(r).is_err());
    let other = create(&db, "other");
    let other = begin(&db, &other);
    assert!(db.history_read("other".into(), source.clone()).is_err());
    assert!(
        db.history_mark("other".into(), source.clone(), true)
            .is_err()
    );
    assert!(db.history_restore(request(&source, &other)).is_err());
    let sql = root.sql();
    sql.execute_batch("CREATE TRIGGER fail_restore BEFORE INSERT ON history_restore_receipts BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
    assert!(db.history_restore(request(&source, &s)).is_err());
    let after = db.read_record("entry".into()).unwrap();
    assert_eq!(after.title, s.record.title);
    assert_eq!(after.content_version, s.record.content_version);
    assert_eq!(after.revision_id, s.record.revision_id);
    assert_eq!(
        db.history_list("entry".into(), None).unwrap().items.len(),
        1
    );
}
#[test]
fn ordinary_expiry_protects_current_important_references_drafts_and_cascades_receipts() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let (source, s, _) = prepare(&db);
    db.history_mark("entry".into(), source.clone(), true)
        .unwrap();
    assert!(
        db.history_read("entry".into(), source.clone())
            .unwrap()
            .summary
            .important
    );
    let sql = root.sql();
    let now: i64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    for name in [
        "expired",
        "important",
        "pinned",
        "related",
        "draft",
        "fresh",
    ] {
        sql.execute("INSERT INTO record_revisions(id,record_id,document_json,searchable_text,created_at,request_id,snapshot_json) SELECT ?1,'entry',document_json,?1,?2,?1,snapshot_json FROM record_revisions WHERE id=?3",params![name,if name=="fresh" {now} else {now-HISTORY_RETENTION_MS-1000},source]).unwrap();
    }
    sql.execute(
        "UPDATE record_revisions SET important=1 WHERE id='important'",
        [],
    )
    .unwrap();
    sql.execute(
        "UPDATE record_revisions SET created_at=0 WHERE id=?1",
        [&source],
    )
    .unwrap();
    sql.execute(
        "INSERT INTO revision_pins VALUES('pinned','test','owner')",
        [],
    )
    .unwrap();
    sql.execute("INSERT INTO record_relations VALUES('entry','entry','related','draft_source','relation',0)",[]).unwrap();
    sql.execute(
        "INSERT INTO recovery_drafts VALUES('entry','draft','session',1,'{}',0)",
        [],
    )
    .unwrap();
    sql.execute(
        "INSERT INTO record_save_receipts VALUES('obsolete','entry','expired','{}','{}')",
        [],
    )
    .unwrap();
    sql.execute(
        "INSERT INTO history_restore_receipts VALUES('obsolete','entry','expired','{}','{}')",
        [],
    )
    .unwrap();
    db.history_list("entry".into(), None).unwrap();
    for name in ["important", "pinned", "related", "draft", "fresh"] {
        assert!(
            db.history_read("entry".into(), name.into()).is_ok(),
            "{name}"
        );
    }
    assert!(db.history_read("entry".into(), "expired".into()).is_err());
    assert_eq!(
        sql.query_row(
            "SELECT count(*) FROM record_save_receipts WHERE request_id='obsolete'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
    assert_eq!(
        sql.query_row(
            "SELECT count(*) FROM history_restore_receipts WHERE request_id='obsolete'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
    db.history_mark("entry".into(), source.clone(), false)
        .unwrap();
    db.history_list("entry".into(), None).unwrap();
    assert!(db.history_read("entry".into(), source).is_ok()); // Current checkpoint always protected.
    assert_eq!(s.record.id, "entry");
}
#[test]
fn list_is_paged_and_legacy_content_is_previewable_without_invented_metadata() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let (source, _, _) = prepare(&db);
    let sql = root.sql();
    for n in 0..55 {
        sql.execute("INSERT INTO record_revisions(id,record_id,document_json,searchable_text,created_at,request_id) SELECT ?1,record_id,document_json,'旧版正文',created_at,?1 FROM record_revisions WHERE id=?2",params![format!("legacy-{n:02}"),source]).unwrap();
    }
    let page = db.history_list("entry".into(), None).unwrap();
    assert_eq!(page.items.len(), 50);
    let next = db.history_list("entry".into(), page.next_before).unwrap();
    assert_eq!(next.items.len(), 6);
    let legacy = db.history_read("entry".into(), "legacy-00".into()).unwrap();
    assert!(legacy.snapshot.is_none());
    assert!(!legacy.summary.restorable);
}
