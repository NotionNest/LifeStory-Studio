use lifestory_studio_lib::{
    attachments::{AttachmentOperation, ImportImage},
    history::RestoreHistory,
    records::{CreateRecord, SaveRecord},
    recovery::{BeginEdit, EditingSession},
    storage::DatabaseWorker,
};
use rusqlite::Connection;
use serde_json::{Value, json};
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
            "lifestory-images-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&p).unwrap();
        Self(p)
    }
    fn sql(&self) -> Connection {
        let sql = Connection::open(self.0.join("lifestory.db")).unwrap();
        sql.pragma_update(None, "foreign_keys", "ON").unwrap();
        sql
    }
}
impl Drop for Workspace {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
const PNG: &[u8] = include_bytes!("../../tools/image-validation/fixtures/static.png");
const JPG: &[u8] = include_bytes!("../../tools/image-validation/fixtures/static.jpg");
fn begin(db: &DatabaseWorker, id: &str) -> EditingSession {
    let record = db
        .create_record(CreateRecord {
            request_id: id.into(),
            record_date: "2026-10-19".into(),
            created_timezone: "Asia/Shanghai".into(),
        })
        .unwrap();
    db.begin_edit(BeginEdit {
        record_id: record.id,
        expected_content_version: record.content_version,
        recovery: None,
    })
    .unwrap()
}
fn op(s: &EditingSession, request: &str) -> AttachmentOperation {
    AttachmentOperation {
        record_id: s.record.id.clone(),
        session_id: s.session_id.clone(),
        expected_content_version: s.record.content_version,
        request_id: request.into(),
    }
}
fn appended(document: &Value, id: &str) -> Value {
    let mut document = document.clone();
    document["content"]
        .as_array_mut()
        .unwrap()
        .push(json!({"type":"attachmentImage","attrs":{"attachmentId":id}}));
    document
}
fn ids(document: &Value) -> Vec<String> {
    fn walk(node: &Value, ids: &mut Vec<String>) {
        if node["type"] == "attachmentImage" {
            ids.push(node["attrs"]["attachmentId"].as_str().unwrap().into());
        }
        if let Some(children) = node["content"].as_array() {
            for child in children {
                walk(child, ids);
            }
        }
    }
    let mut out = vec![];
    walk(document, &mut out);
    out.sort();
    out.dedup();
    out
}
fn import(
    db: &DatabaseWorker,
    s: &EditingSession,
    request: &str,
    bytes: &[u8],
) -> lifestory_studio_lib::attachments::ImportedAttachment {
    db.import_image(
        ImportImage {
            operation: op(s, request),
            name: "合成照片.png".into(),
            document: appended(&s.record.document, request),
        },
        bytes.to_vec(),
    )
    .unwrap()
}
fn save(db: &DatabaseWorker, s: &EditingSession, document: Value) -> EditingSession {
    let input = SaveRecord {
        record_id: s.record.id.clone(),
        base_revision_id: Some(s.record.revision_id.clone()),
        base_content_version: Some(s.record.content_version),
        request_id: format!("save-{}-{}", s.session_id, s.record.content_version),
        session_id: s.session_id.clone(),
        edit_sequence: (s.record.content_version + 10) as u32,
        title: Some("图片合成资料".into()),
        record_date: "2026-10-19".into(),
        tag_ids: vec![],
        attachment_ids: ids(&document),
        document,
    };
    db.save_record(input).unwrap();
    EditingSession {
        record: db.read_record(s.record.id.clone()).unwrap(),
        session_id: s.session_id.clone(),
        recovered: None,
        recovered_tags: vec![],
    }
}
#[test]
fn import_preserves_original_deduplicates_and_reopens_with_three_formats() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let initial = begin(&db, "a");
    let first = import(&db, &initial, "import-1", PNG);
    let retry = import(&db, &initial, "import-1", PNG);
    assert_eq!(retry.attachment_id, first.attachment_id);
    assert_eq!(retry.editing.session_id, first.editing.session_id);
    let duplicate = import(&db, &first.editing, "import-2", PNG);
    assert_eq!(duplicate.editing.record.attachments.len(), 1);
    assert_eq!(duplicate.attachment_id, first.attachment_id);
    let mut one_position = duplicate.editing.record.document.clone();
    one_position["content"].as_array_mut().unwrap().pop();
    let kept = save(&db, &duplicate.editing, one_position);
    assert_eq!(kept.record.attachments.len(), 1);

    let second = import(&db, &kept, "import-3", JPG);
    let third = import(
        &db,
        &second.editing,
        "import-4",
        include_bytes!("../../tools/image-validation/fixtures/static.webp"),
    );
    assert_eq!(third.editing.record.attachments.len(), 3);
    assert_eq!(
        db.attachment_bytes("a".into(), first.attachment_id.clone(), None, true)
            .unwrap(),
        PNG
    );
    let preview = db
        .attachment_bytes("a".into(), first.attachment_id.clone(), None, false)
        .unwrap();
    assert_eq!(&preview[..8], b"\x89PNG\r\n\x1a\n");
    let other = begin(&db, "b");
    assert!(
        db.attachment_bytes("b".into(), first.attachment_id.clone(), None, true)
            .is_err()
    );
    let shared = import(&db, &other, "shared", PNG);
    let sql = root.sql();
    assert_eq!(
        sql.query_row("SELECT count(*) FROM image_objects", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        3
    );
    assert_eq!(shared.editing.record.attachments.len(), 1);
    drop(sql);
    drop(db);
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(db.read_record("a".into()).unwrap().attachments.len(), 3);
    assert_eq!(
        db.attachment_bytes("a".into(), first.attachment_id, None, true)
            .unwrap(),
        PNG
    );
}
#[test]
fn deletion_undo_and_history_follow_document_without_image_recycle() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let start = begin(&db, "a");
    let image = import(&db, &start, "add", PNG);
    let original = image.editing.record.document.clone();
    let aid = image.attachment_id.clone();
    let removed = save(
        &db,
        &image.editing,
        json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"继续写的新文字"}]}]}),
    );
    assert!(removed.record.attachments.is_empty());
    // Undo renders before its autosave; a history-protected image must already be readable.
    assert_eq!(
        db.attachment_bytes("a".into(), aid.clone(), None, true)
            .unwrap(),
        PNG
    );
    db.cleanup_attachments().unwrap();
    let history = db
        .history_list("a".into(), None)
        .unwrap()
        .items
        .into_iter()
        .find(|v| db.history_read("a".into(), v.id.clone()).unwrap().document == original)
        .unwrap();
    assert_eq!(
        db.attachment_bytes("a".into(), aid.clone(), Some(history.id.clone()), true)
            .unwrap(),
        PNG
    );
    let undone = save(&db, &removed, original.clone());
    assert_eq!(undone.record.attachments.len(), 1);
    let removed = save(
        &db,
        &undone,
        json!({"type":"doc","content":[{"type":"paragraph"}]}),
    );
    let restored = db
        .history_restore(RestoreHistory {
            record_id: "a".into(),
            revision_id: history.id,
            expected_content_version: removed.record.content_version,
            session_id: removed.session_id,
            request_id: "restore".into(),
        })
        .unwrap();
    assert_eq!(restored.record.document, original);
    assert_eq!(restored.record.attachments[0].id, aid);
    assert_eq!(root.sql().query_row("SELECT count(*) FROM attachment_links WHERE deleted_at IS NOT NULL OR purge_at IS NOT NULL",[],|r|r.get::<_,i64>(0)).unwrap(),0);
}
#[test]
fn invalid_input_stale_lease_and_transaction_failure_never_report_success_or_destroy_files() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let s = begin(&db, "a");
    for (i, bytes) in [
        b"bad".as_slice(),
        include_bytes!("../../tools/image-validation/fixtures/animated.png").as_slice(),
        include_bytes!("../../tools/image-validation/fixtures/oversize.png").as_slice(),
        include_bytes!("../../tools/image-validation/fixtures/overpixels.png").as_slice(),
    ]
    .into_iter()
    .enumerate()
    {
        assert!(
            db.import_image(
                ImportImage {
                    operation: op(&s, &format!("bad-{i}")),
                    name: "fake.png".into(),
                    document: appended(&s.record.document, "invalid")
                },
                bytes.to_vec()
            )
            .is_err()
        );
    }
    assert!(
        db.import_image(
            ImportImage {
                operation: op(&s, "too-large"),
                name: "large.png".into(),
                document: appended(&s.record.document, "too-large")
            },
            vec![0; lifestory_image_validation::MAX_BYTES + 1]
        )
        .is_err()
    );
    let mut invalid = op(&s, "stale");
    invalid.expected_content_version += 1;
    assert!(
        db.import_image(
            ImportImage {
                operation: invalid,
                name: "a.png".into(),
                document: appended(&s.record.document, "failure")
            },
            PNG.to_vec()
        )
        .is_err()
    );
    assert!(
        db.import_image(
            ImportImage {
                operation: op(&s, "path"),
                name: "../outside.png".into(),
                document: appended(&s.record.document, "path")
            },
            PNG.to_vec()
        )
        .is_err()
    );
    let sql = root.sql();
    sql.execute_batch("CREATE TRIGGER failed_attachment BEFORE INSERT ON attachment_receipts BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
    assert!(
        db.import_image(
            ImportImage {
                operation: op(&s, "failure"),
                name: "a.png".into(),
                document: appended(&s.record.document, "failure")
            },
            PNG.to_vec()
        )
        .is_err()
    );
    assert!(db.read_record("a".into()).unwrap().attachments.is_empty());
    assert_eq!(
        db.read_record("a".into()).unwrap().content_version,
        s.record.content_version
    );
    db.cleanup_attachments().unwrap();
    assert_eq!(
        sql.query_row("SELECT count(*) FROM image_objects", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    sql.execute_batch("DROP TRIGGER failed_attachment;")
        .unwrap();
    let imported = import(&db, &s, "ok", PNG);
    let fake = json!({"type":"doc","content":[{"type":"attachmentImage","attrs":{"attachmentId":"../../etc"}}]});
    let mut input = SaveRecord {
        record_id: "a".into(),
        base_revision_id: Some(imported.editing.record.revision_id.clone()),
        base_content_version: Some(imported.editing.record.content_version),
        request_id: "invalid-ref".into(),
        session_id: imported.editing.session_id.clone(),
        edit_sequence: (s.record.content_version + 10) as u32,
        title: None,
        record_date: "".into(),
        tag_ids: vec![],
        document: fake,
        attachment_ids: vec!["../../etc".into()],
    };
    assert!(db.save_record(input.clone()).is_err());
    input.attachment_ids = imported
        .editing
        .record
        .attachments
        .iter()
        .map(|a| a.id.clone())
        .collect();
    assert!(db.save_record(input).is_err());
}
#[test]
fn cleanup_has_no_image_deadline_and_keeps_shared_history() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let a = begin(&db, "a");
    let a = import(&db, &a, "add-a", PNG);
    let b = begin(&db, "b");
    let b = import(&db, &b, "add-b", PNG);
    save(
        &db,
        &a.editing,
        json!({"type":"doc","content":[{"type":"paragraph"}]}),
    );
    db.cleanup_attachments().unwrap();
    let sql = root.sql();
    sql.execute("DELETE FROM records WHERE id='a'", []).unwrap();
    db.cleanup_attachments().unwrap();
    assert_eq!(
        db.attachment_bytes("b".into(), b.attachment_id, None, true)
            .unwrap(),
        PNG
    );
    let hash: String = sql
        .query_row("SELECT sha256 FROM image_objects", [], |r| r.get(0))
        .unwrap();
    sql.execute("DELETE FROM records WHERE id='b'", []).unwrap();
    let original = root.0.join("objects").join(format!("{hash}.original"));
    fs::remove_file(&original).unwrap();
    fs::create_dir(&original).unwrap();
    assert!(db.cleanup_attachments().is_err());
    assert_eq!(
        sql.query_row("SELECT state FROM image_objects", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "pending_delete"
    );
    fs::remove_dir(&original).unwrap();
    db.cleanup_attachments().unwrap();
    assert_eq!(
        sql.query_row("SELECT count(*) FROM image_objects", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(fs::read_dir(root.0.join("objects")).unwrap().count(), 0);
}
#[test]
fn schema7_preserves_attachment_only_reference_and_recycled_images() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let start = begin(&db, "a");
    let first = import(&db, &start, "first", PNG);
    let second = import(&db, &first.editing, "second", JPG);
    let third = import(
        &db,
        &second.editing,
        "third",
        include_bytes!("../../tools/image-validation/fixtures/static.webp"),
    );
    drop(db);
    let sql = root.sql();
    let old = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"旧引用文字保留","marks":[{"type":"attachmentReference","attrs":{"attachmentId":first.attachment_id}},{"type":"bold"}]}]}]});
    sql.execute(
        "UPDATE records SET working_document=?1 WHERE id='a'",
        [old.to_string()],
    )
    .unwrap();
    sql.execute(
        "UPDATE attachment_links SET deleted_at=100,purge_at=2592000100 WHERE id=?1",
        [&third.attachment_id],
    )
    .unwrap();
    sql.execute_batch("ALTER TABLE attachment_links DROP COLUMN in_body; PRAGMA user_version=7;")
        .unwrap();
    drop(sql);
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let record = db.read_record("a".into()).unwrap();
    assert_eq!(record.attachments.len(), 2);
    assert_eq!(ids(&record.document).len(), 2);
    assert_eq!(
        record.document["content"][0]["content"][0]["marks"],
        json!([{"type":"bold"}])
    );
    let history = db.history_list("a".into(), None).unwrap().items;
    let archived = history
        .iter()
        .find(|h| {
            ids(&db.history_read("a".into(), h.id.clone()).unwrap().document)
                .contains(&third.attachment_id)
        })
        .unwrap();
    assert!(
        db.attachment_bytes(
            "a".into(),
            third.attachment_id.clone(),
            Some(archived.id.clone()),
            true
        )
        .is_ok()
    );
    db.cleanup_attachments().unwrap();
    drop(db);
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(
        db.read_record("a".into()).unwrap().document,
        record.document
    );
}
#[cfg(unix)]
#[test]
fn managed_storage_rejects_symlink_escape() {
    let root = Workspace::new();
    let outside = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    let s = begin(&db, "a");
    if root.0.join("objects").exists() {
        fs::remove_dir(root.0.join("objects")).unwrap();
    }
    std::os::unix::fs::symlink(&outside.0, root.0.join("objects")).unwrap();
    assert!(
        db.import_image(
            ImportImage {
                operation: op(&s, "escape"),
                name: "a.png".into(),
                document: appended(&s.record.document, "failure")
            },
            PNG.to_vec()
        )
        .is_err()
    );
    assert!(fs::read_dir(&outside.0).unwrap().next().is_none());
    fs::remove_file(root.0.join("objects")).unwrap();
}
