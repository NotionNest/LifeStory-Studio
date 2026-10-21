use lifestory_studio_lib::{
    library_query::LibraryQuery, records::CreateRecord, storage::DatabaseWorker,
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
            "library-query-{}-{}",
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
fn add(db: &DatabaseWorker, root: &Workspace, id: &str, date: &str, title: &str, text: &str) {
    db.create_record(CreateRecord {
        request_id: id.into(),
        record_date: date.into(),
        created_timezone: "Asia/Shanghai".into(),
    })
    .unwrap();
    let document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]});
    root.sql()
        .execute(
            "UPDATE records SET title=?1,working_text=?2,working_document=?3 WHERE id=?4",
            params![title, text, document.to_string(), id],
        )
        .unwrap();
}
fn q(keyword: &str) -> LibraryQuery {
    LibraryQuery {
        keyword: keyword.into(),
        ..Default::default()
    }
}
#[test]
fn literal_search_tracks_only_current_content_and_deleted_records() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    add(
        &db,
        &root,
        "a",
        "2026-10-20",
        "春天工作坊",
        "中文工作 百分% 下划_ 引号\" OR MiXeD",
    );
    for word in ["工作", "工", "%", "_", "\"", "OR", "mixed", "春天工作坊"] {
        let page = db.query_library(q(word)).unwrap();
        assert_eq!(page.total, 1, "{word}");
    }
    assert_eq!(db.query_library(q("NOT unrelated")).unwrap().total, 0);
    let sql = root.sql();
    sql.execute(
        "UPDATE records SET title='新标题',working_text='今天只写旅行' WHERE id='a'",
        [],
    )
    .unwrap();
    assert_eq!(db.query_library(q("春天工作坊")).unwrap().total, 0);
    assert_eq!(db.query_library(q("旅行")).unwrap().total, 1);
    let revision: String = sql
        .query_row(
            "SELECT current_revision_id FROM records WHERE id='a'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    sql.execute(
        "UPDATE record_revisions SET searchable_text='历史秘密词' WHERE id=?1",
        [&revision],
    )
    .unwrap();
    assert_eq!(db.query_library(q("历史秘密词")).unwrap().total, 0);
    assert_eq!(
        sql.query_row(
            "SELECT count(*) FROM record_search WHERE record_id='a'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        1
    );
    sql.execute(
        "UPDATE records SET deleted_at=1,purge_at=2592000001 WHERE id='a'",
        [],
    )
    .unwrap();
    assert_eq!(db.query_library(q("旅行")).unwrap().total, 0);
    assert!(db.preview_library_content("a".into()).is_err());
    sql.execute("DELETE FROM records WHERE id='a'", []).unwrap();
    assert_eq!(
        sql.query_row("SELECT count(*) FROM record_search", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
}
#[test]
fn combined_filters_calendar_and_messages_have_the_same_scope() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    add(&db, &root, "a", "2026-10-20", "旅行甲", "旅行记录");
    add(&db, &root, "b", "2026-10-21", "旅行乙", "旅行记录");
    add(&db, &root, "c", "2026-10-21", "对话标题", "普通文字");
    let sql = root.sql();
    sql.execute_batch("INSERT INTO tags VALUES('t1','户外','户外'),('t2','生活','生活'); INSERT INTO record_tags VALUES('a','t1'),('a','t2'),('b','t1'); UPDATE records SET kind='conversation' WHERE id='c'; INSERT INTO image_objects VALUES('object','hash','objects/hash','image/png',10,1,1,'ready'); INSERT INTO attachment_links(id,record_id,object_id,original_name,in_body) VALUES('link','a','object','图.png',1);").unwrap();
    sql.execute("INSERT INTO conversation_messages(id,record_id,sequence,role,content_json,request_id,created_at) VALUES('m','c',1,'user',?1,'message',1)",[json!({"text":"旅行消息 命中这段对话","requestId":"不应搜索的身份"}).to_string()]).unwrap();
    let mut query = q("旅行");
    query.month = Some("2026-10".into());
    query.date_from = Some("2026-10-20".into());
    query.date_to = query.date_from.clone();
    let page = db.query_library(query.clone()).unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.days.iter().map(|d| d.count).sum::<u32>(), 3);
    query.date_from = None;
    query.date_to = None;
    query.tag_ids = vec!["t1".into(), "t2".into()];
    assert_eq!(db.query_library(query.clone()).unwrap().total, 1);
    query.tag_mode = "any".into();
    assert_eq!(db.query_library(query.clone()).unwrap().total, 2);
    query.has_images = Some(false);
    assert_eq!(db.query_library(query.clone()).unwrap().items[0].id, "b");
    query.tag_ids.clear();
    query.has_images = None;
    query.kinds = vec!["conversation".into()];
    let page = db.query_library(query).unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].match_field.as_deref(), Some("message"));
    assert!(page.items[0].excerpt.contains("旅行消息"));
    assert_eq!(db.query_library(q("不应搜索的身份")).unwrap().total, 0);
    let preview = db.preview_library_content("c".into()).unwrap();
    assert_eq!(preview.messages, vec!["旅行消息 命中这段对话"]);
    sql.execute("UPDATE records SET kind='draft' WHERE id='b'", [])
        .unwrap();
    assert_eq!(
        db.query_library(LibraryQuery {
            kinds: vec!["draft".into()],
            ..Default::default()
        })
        .unwrap()
        .items[0]
            .id,
        "b"
    );
}
#[test]
fn paging_validation_and_index_upgrade_do_not_lose_or_repeat_records() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    for i in 0..103 {
        add(
            &db,
            &root,
            &format!("r-{i:03}"),
            "2026-10-20",
            "相同标题",
            "需要分页的记录",
        );
    }
    let sql = root.sql();
    sql.execute("UPDATE records SET created_at=100", [])
        .unwrap();
    let page = db.query_library(LibraryQuery::default()).unwrap();
    assert_eq!(page.total, 103);
    assert_eq!(page.items.len(), 100);
    let next = db
        .query_library(LibraryQuery {
            offset: page.next_offset.unwrap(),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(next.items.len(), 3);
    assert!(next.next_offset.is_none());
    assert!(
        !page
            .items
            .iter()
            .any(|a| next.items.iter().any(|b| a.id == b.id))
    );
    for query in [
        LibraryQuery {
            date_from: Some("2026-02-30".into()),
            ..Default::default()
        },
        LibraryQuery {
            kinds: vec!["project".into()],
            ..Default::default()
        },
        LibraryQuery {
            date_from: Some("2026-10-21".into()),
            date_to: Some("2026-10-20".into()),
            ..Default::default()
        },
    ] {
        assert!(db.query_library(query).is_err());
    }
    drop(db);
    sql.execute_batch("DROP INDEX records_trash_due; ALTER TABLE record_relations DROP COLUMN unavailable_source_id; DROP TRIGGER library_search_insert;DROP TRIGGER library_search_update;DROP TRIGGER library_search_delete;DELETE FROM record_search;INSERT INTO record_search VALUES('r-000','过期残留');PRAGMA user_version=8;").unwrap();
    drop(sql);
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(db.query_library(q("过期残留")).unwrap().total, 0);
    assert_eq!(db.query_library(q("相同标题")).unwrap().total, 103);
}

#[test]
fn pending_empty_date_keeps_archive_date_consistent_in_results_and_calendar() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    add(
        &db,
        &root,
        "pending",
        "2026-10-20",
        "日期待补充",
        "合成正文",
    );
    root.sql()
        .execute("UPDATE records SET pending_date='' WHERE id='pending'", [])
        .unwrap();
    let page = db
        .query_library(LibraryQuery {
            date_from: Some("2026-10-20".into()),
            date_to: Some("2026-10-20".into()),
            month: Some("2026-10".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].record_date, "2026-10-20");
    assert_eq!(page.days[0].date, "2026-10-20");
}
