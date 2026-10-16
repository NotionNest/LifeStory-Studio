use lifestory_studio_lib::{
    records::{CreateRecord, SaveRecord},
    recovery::{BeginEdit, RecoveryAction, RecoveryChoice},
    storage::DatabaseWorker,
};
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
            "lifestory-recovery-{}-{}",
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
fn setup(db: &DatabaseWorker) -> SaveRecord {
    let record = db
        .create_record(CreateRecord {
            request_id: "entry".into(),
            record_date: "2026-10-15".into(),
            created_timezone: "Asia/Shanghai".into(),
        })
        .unwrap();
    let session = db
        .begin_edit(BeginEdit {
            record_id: record.id.clone(),
            expected_content_version: record.content_version,
            recovery: None,
        })
        .unwrap();
    SaveRecord {
        record_id: record.id,
        base_revision_id: Some(session.record.revision_id),
        base_content_version: Some(record.content_version),
        request_id: "save-one".into(),
        session_id: session.session_id,
        edit_sequence: 1,
        title: Some("未保存标题".into()),
        record_date: "2026-10-14".into(),
        tag_ids: vec![],
        document: json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"合成恢复内容"}]}]}),
        attachment_ids: vec![],
    }
}
#[test]
fn restart_preview_restore_keeps_durable_copy_until_formal_save() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let input = setup(&db);
    assert!(db.recovery_write(input.clone()).unwrap());
    drop(db);
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let formal = db.read_record("entry".into()).unwrap();
    assert_eq!(formal.title, None);
    let draft = db.recovery_read("entry".into()).unwrap().unwrap();
    assert_eq!(draft.input.document, input.document);
    assert!(
        db.begin_edit(BeginEdit {
            record_id: "entry".into(),
            expected_content_version: formal.content_version,
            recovery: None
        })
        .is_err()
    );
    let restored = db
        .begin_edit(BeginEdit {
            record_id: "entry".into(),
            expected_content_version: formal.content_version,
            recovery: Some(RecoveryChoice {
                session_id: draft.session_id,
                edit_sequence: draft.edit_sequence,
                action: RecoveryAction::Restore,
            }),
        })
        .unwrap();
    let current = restored.recovered.unwrap();
    assert_ne!(current.session_id, input.session_id);
    let mut invalid = current.clone();
    invalid.record_date = "2025-02-29".into();
    assert!(db.save_record(invalid).is_err());
    assert!(db.recovery_read("entry".into()).unwrap().is_some());
    assert!(db.recovery_write(input).is_err());
    db.save_record(current).unwrap();
    assert!(db.recovery_read("entry".into()).unwrap().is_none());
    assert_eq!(
        db.read_record("entry".into()).unwrap().title,
        Some("未保存标题".into())
    );
}
#[test]
fn discarding_and_replacing_sessions_rejects_late_writes() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let mut input = setup(&db);
    input.edit_sequence = 4;
    db.recovery_write(input.clone()).unwrap();
    let mut older = input.clone();
    older.edit_sequence = 3;
    older.title = Some("不能覆盖".into());
    assert!(!db.recovery_write(older).unwrap());
    let record = db.read_record("entry".into()).unwrap();
    let next = db
        .begin_edit(BeginEdit {
            record_id: "entry".into(),
            expected_content_version: record.content_version,
            recovery: Some(RecoveryChoice {
                session_id: input.session_id.clone(),
                edit_sequence: 4,
                action: RecoveryAction::Discard,
            }),
        })
        .unwrap();
    input.edit_sequence = 5;
    assert!(db.recovery_write(input.clone()).is_err());
    assert!(db.save_record(input.clone()).is_err());
    input.session_id = next.session_id.clone();
    input.edit_sequence = 1;
    db.recovery_write(input.clone()).unwrap();
    db.end_edit("entry".into(), next.session_id).unwrap();
    input.edit_sequence = 2;
    assert!(db.recovery_write(input).is_err());
    assert!(db.recovery_read("entry".into()).unwrap().is_none());
    assert_eq!(db.read_record("entry".into()).unwrap().title, None);
}
#[test]
fn older_save_only_clears_covered_drafts_and_late_old_snapshot_is_ignored() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let first = setup(&db);
    let mut newer = first.clone();
    newer.edit_sequence = 2;
    newer.request_id = "save-two".into();
    newer.title = Some("保存期间的新编辑".into());
    db.recovery_write(newer.clone()).unwrap();
    let saved = db.save_record(first.clone()).unwrap();
    assert!(!db.recovery_write(first).unwrap());
    let kept = db.recovery_read("entry".into()).unwrap().unwrap();
    assert_eq!(kept.edit_sequence, 2);
    newer.base_revision_id = Some(saved.revision_id);
    newer.base_content_version = Some(saved.content_version);
    db.save_record(newer).unwrap();
    assert!(db.recovery_read("entry".into()).unwrap().is_none());
}
