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
fn diary_filters_calendar_and_chat_search_keep_separate_scopes() {
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
    assert_eq!(page.days.iter().map(|d| d.count).sum::<u32>(), 2);
    query.date_from = None;
    query.date_to = None;
    query.tag_ids = vec!["t1".into(), "t2".into()];
    assert_eq!(db.query_library(query.clone()).unwrap().total, 1);
    query.tag_mode = "any".into();
    assert_eq!(db.query_library(query.clone()).unwrap().total, 2);
    query.has_images = Some(false);
    assert_eq!(db.query_library(query.clone()).unwrap().items[0].id, "b");
    let mut calendar_filters = query.clone();
    calendar_filters.month = None;
    for (images, mode, expected) in [
        (Some(false), "any", vec!["b"]),
        (Some(true), "all", vec!["a"]),
        (None, "any", vec!["a", "b"]),
    ] {
        calendar_filters.has_images = images;
        calendar_filters.tag_mode = mode.into();
        let calendar = db
            .query_calendar(lifestory_studio_lib::library_query::CalendarQuery {
                filters: calendar_filters.clone(),
                from: "2026-10-19".into(),
                to: "2026-10-25".into(),
            })
            .unwrap();
        assert_eq!(
            calendar.days.iter().map(|day| day.count).sum::<u32>(),
            expected.len() as u32
        );
        let ids: Vec<_> = calendar
            .days
            .iter()
            .flat_map(|day| &day.items)
            .map(|item| item.id.as_str())
            .collect();
        assert_eq!(ids, expected);
    }
    query.tag_ids.clear();
    query.has_images = None;
    query.kinds = vec!["conversation".into()];
    let page = db.query_library(query).unwrap();
    assert_eq!(page.total, 0);
    assert!(db.preview_library_content("c".into()).is_err());
    let chats = db
        .ai_chat_list(lifestory_studio_lib::ai_experience::ChatQuery {
            keyword: "旅行消息".into(),
            offset: 0,
        })
        .unwrap();
    assert_eq!(chats.items.len(), 1);
    assert_eq!(chats.items[0].id, "c");
    assert_eq!(db.query_library(q("不应搜索的身份")).unwrap().total, 0);
    assert!(
        db.ai_chat_list(lifestory_studio_lib::ai_experience::ChatQuery {
            keyword: "不应搜索的身份".into(),
            offset: 0
        })
        .unwrap()
        .items
        .is_empty()
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
    sql.execute_batch("DROP TABLE ai_request_receipts; DROP TABLE ai_adopted_ranges; DROP TABLE ai_previews; DROP TABLE ai_conversations; DROP TABLE ai_preferences; DROP TABLE ai_source_blocks; DROP TABLE ai_provider_checks; DROP TABLE ai_task_sources; DROP TABLE ai_tasks; DROP TABLE ai_profiles; DROP INDEX records_trash_due; ALTER TABLE record_relations DROP COLUMN unavailable_source_id; DROP TRIGGER library_search_insert;DROP TRIGGER library_search_update;DROP TRIGGER library_search_delete;DELETE FROM record_search;INSERT INTO record_search VALUES('r-000','过期残留');PRAGMA user_version=8;").unwrap();
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

#[test]
fn calendar_previews_cover_every_day_without_the_list_page_limit() {
    use lifestory_studio_lib::library_query::CalendarQuery;
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    for i in 0..103 {
        add(
            &db,
            &root,
            &format!("calendar-{i:03}"),
            "2026-10-20",
            "同日合成记录",
            "月历查询",
        );
    }
    add(
        &db,
        &root,
        "later-day",
        "2026-10-21",
        "其他日期",
        "月历查询",
    );
    root.sql()
        .execute("UPDATE records SET created_at=100", [])
        .unwrap();
    let page = db
        .query_calendar(CalendarQuery {
            filters: q("月历"),
            from: "2026-10-01".into(),
            to: "2026-11-01".into(),
        })
        .unwrap();
    assert_eq!(page.days.len(), 32);
    let day = page.days.iter().find(|d| d.date == "2026-10-20").unwrap();
    assert_eq!(day.count, 103);
    assert_eq!(day.items.len(), 3);
    assert_eq!(day.items[0].id, "calendar-000");
    assert_eq!(
        page.days
            .iter()
            .find(|d| d.date == "2026-10-21")
            .unwrap()
            .items[0]
            .id,
        "later-day"
    );
    assert_eq!(page.days[0].count, 0);
    let tail = db
        .query_library(LibraryQuery {
            date_from: Some("2026-10-20".into()),
            date_to: Some("2026-10-20".into()),
            offset: 100,
            ..q("月历")
        })
        .unwrap();
    assert_eq!(tail.items.len(), 3);
}

#[test]
fn calendar_filters_intersect_dates_and_validate_grid_boundaries() {
    use lifestory_studio_lib::library_query::CalendarQuery;
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    add(&db, &root, "leap-day", "2024-02-29", "闰日", "匹配");
    add(&db, &root, "outside", "2024-03-01", "下个月", "匹配");
    add(&db, &root, "removed", "2024-02-29", "已移除", "匹配");
    root.sql()
        .execute("UPDATE records SET deleted_at=1 WHERE id='removed'", [])
        .unwrap();
    let page = db
        .query_calendar(CalendarQuery {
            filters: LibraryQuery {
                date_to: Some("2024-02-29".into()),
                ..q("匹配")
            },
            from: "2024-02-26".into(),
            to: "2024-03-03".into(),
        })
        .unwrap();
    assert_eq!(page.days.iter().map(|d| d.count).sum::<u32>(), 1);
    assert_eq!(page.days[3].items[0].id, "leap-day");
    for (from, to) in [
        ("2026-01-01", "2026-02-12"),
        ("2026-02-30", "2026-03-01"),
        ("2026-12-31", "2026-01-01"),
    ] {
        assert!(
            db.query_calendar(CalendarQuery {
                filters: q(""),
                from: from.into(),
                to: to.into()
            })
            .is_err()
        );
    }
    assert_eq!(
        db.query_calendar(CalendarQuery {
            filters: q(""),
            from: "2025-12-29".into(),
            to: "2026-01-04".into()
        })
        .unwrap()
        .days
        .len(),
        7
    );
}

#[test]
fn global_chat_search_returns_message_hits_and_title_only_fallback_with_stable_paging() {
    use lifestory_studio_lib::ai_experience::ChatQuery;
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    for (id, title) in [
        ("chat", "旅行会话"),
        ("title", "旅行标题"),
        ("gone", "旅行已删除"),
        ("diary", "旅行日记"),
    ] {
        add(&db, &root, id, "2026-10-23", title, "");
    }
    let sql = root.sql();
    sql.execute(
        "UPDATE records SET kind='conversation',updated_at=10 WHERE id!='diary'",
        [],
    )
    .unwrap();
    sql.execute("UPDATE records SET deleted_at=1 WHERE id='gone'", [])
        .unwrap();
    for n in 0..103 {
        sql.execute("INSERT INTO conversation_messages(id,record_id,sequence,role,content_json,request_id,created_at) VALUES(?1,'chat',?2,'user',?3,?1,1)",params![format!("message-{n}"),n,json!({"text":format!("前文 旅行 %{n}_ 后文"),"requestId":"不应命中"}).to_string()]).unwrap();
    }
    let first = db
        .ai_chat_search(ChatQuery {
            keyword: "旅行".into(),
            offset: 0,
        })
        .unwrap();
    assert_eq!(first.items.len(), 100);
    assert_eq!(first.items[0].message_id.as_deref(), Some("message-102"));
    assert_eq!(first.items[0].role.as_deref(), Some("user"));
    assert!(first.items[0].excerpt.contains("旅行"));
    let next = db
        .ai_chat_search(ChatQuery {
            keyword: "旅行".into(),
            offset: first.next_offset.unwrap(),
        })
        .unwrap();
    assert_eq!(next.items.len(), 4);
    assert!(next.next_offset.is_none());
    assert!(
        next.items
            .iter()
            .any(|item| item.chat_id == "title" && item.message_id.is_none())
    );
    assert!(!next.items.iter().any(|item| {
        first
            .items
            .iter()
            .any(|old| old.chat_id == item.chat_id && old.message_id == item.message_id)
    }));
    assert_eq!(
        db.ai_chat_search(ChatQuery {
            keyword: "%102_".into(),
            offset: 0
        })
        .unwrap()
        .items
        .len(),
        1
    );
    assert!(
        db.ai_chat_search(ChatQuery {
            keyword: "不应命中".into(),
            offset: 0
        })
        .unwrap()
        .items
        .is_empty()
    );
    for keyword in [" ".to_string(), "字".repeat(201)] {
        assert!(db.ai_chat_search(ChatQuery { keyword, offset: 0 }).is_err());
    }
}

#[test]
fn tag_catalog_counts_only_active_diaries_and_keeps_unused_tags() {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    for id in ["current", "other", "deleted", "chat"] {
        add(&db, &root, id, "2026-10-26", "合成标签日记", "合成正文");
    }
    let used = db.create_tag("生活".into()).unwrap();
    let unused = db.create_tag("未使用".into()).unwrap();
    assert_eq!(db.create_tag(" 生活 ".into()).unwrap().id, used.id);
    let sql = root.sql();
    for id in ["current", "other", "deleted", "chat"] {
        sql.execute(
            "INSERT INTO record_tags VALUES(?1,?2)",
            params![id, used.id],
        )
        .unwrap();
    }
    sql.execute("UPDATE records SET deleted_at=1 WHERE id='deleted'", [])
        .unwrap();
    sql.execute("UPDATE records SET kind='conversation' WHERE id='chat'", [])
        .unwrap();
    let tags = db.tag_catalog("current".into()).unwrap();
    let usage = tags.iter().find(|tag| tag.id == used.id).unwrap();
    assert_eq!(usage.count, 2);
    assert!(usage.current);
    let zero = tags.iter().find(|tag| tag.id == unused.id).unwrap();
    assert_eq!(zero.count, 0);
    assert!(!zero.current);
    sql.execute("DELETE FROM record_tags WHERE record_id='current'", [])
        .unwrap();
    let tags = db.tag_catalog("current".into()).unwrap();
    let usage = tags.iter().find(|tag| tag.id == used.id).unwrap();
    assert_eq!(usage.count, 1);
    assert!(!usage.current);
    for id in ["missing", "deleted", "chat", "invalid/id"] {
        assert!(db.tag_catalog(id.into()).is_err());
    }
}
