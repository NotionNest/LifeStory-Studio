use rusqlite::Connection;

fn database() -> Connection {
    let db = Connection::open_in_memory().unwrap();
    db.pragma_update(None, "foreign_keys", "ON").unwrap();
    db.execute_batch(include_str!("../migrations/002_records.sql"))
        .unwrap();
    db
}

fn record(db: &Connection, id: &str) {
    db.execute("INSERT INTO records (id,kind,record_date,created_timezone,created_at,updated_at) VALUES (?1,'text','2026-10-15','Asia/Shanghai',0,0)", [id]).unwrap();
}

#[test]
fn current_revision_cannot_point_to_another_records_content() {
    let db = database();
    record(&db, "one");
    record(&db, "two");
    db.execute(
        "INSERT INTO record_revisions VALUES ('revision','one','{}','source',0,0,'request')",
        [],
    )
    .unwrap();
    assert!(
        db.execute(
            "UPDATE records SET current_revision_id='revision' WHERE id='two'",
            []
        )
        .is_err()
    );
    db.execute(
        "UPDATE records SET current_revision_id='revision' WHERE id='one'",
        [],
    )
    .unwrap();
    db.execute("DELETE FROM records WHERE id='one'", [])
        .unwrap();
    let count: i64 = db
        .query_row("SELECT count(*) FROM record_revisions", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn shared_image_survives_record_deletion_but_remains_referenced() {
    let db = database();
    record(&db, "one");
    record(&db, "two");
    db.execute("INSERT INTO image_objects VALUES ('image','hash','objects/hash','image/png',10,8,6,'ready')", []).unwrap();
    db.execute(
        "INSERT INTO attachment_links VALUES ('link-one','one','image','a.png',NULL,NULL)",
        [],
    )
    .unwrap();
    db.execute(
        "INSERT INTO attachment_links VALUES ('link-two','two','image','a.png',NULL,NULL)",
        [],
    )
    .unwrap();
    db.execute("DELETE FROM records WHERE id='one'", [])
        .unwrap();
    assert!(
        db.execute("DELETE FROM image_objects WHERE id='image'", [])
            .is_err()
    );
    let count: i64 = db
        .query_row(
            "SELECT count(*) FROM attachment_links WHERE object_id='image'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn invalid_recycle_deadline_and_duplicate_request_are_rejected() {
    let db = database();
    record(&db, "one");
    assert!(
        db.execute(
            "UPDATE records SET deleted_at=0,purge_at=1 WHERE id='one'",
            []
        )
        .is_err()
    );
    db.execute(
        "INSERT INTO record_revisions VALUES ('revision','one','{}','source',0,0,'request')",
        [],
    )
    .unwrap();
    assert!(
        db.execute(
            "INSERT INTO record_revisions VALUES ('other','one','{}','source',0,0,'request')",
            []
        )
        .is_err()
    );
}
