use lifestory_studio_lib::{
    ai::StartInput, ai_providers::Profile, records::CreateRecord, storage::DatabaseWorker,
    trash::TrashRequest,
};
use rusqlite::Connection;
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
            "ai-test-{}-{}",
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
fn setup() -> (Workspace, DatabaseWorker, String) {
    let root = Workspace::new();
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    db.create_record(CreateRecord {
        request_id: "source".into(),
        record_date: "2026-10-21".into(),
        created_timezone: "Asia/Shanghai".into(),
    })
    .unwrap();
    let sql = root.sql();
    sql.execute("UPDATE records SET title='合成原文',working_text='公园散步',working_document=?1 WHERE id='source'",[r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"公园散步"}]}]}"#]).unwrap();
    let profile = Profile {
        id: "test-profile".into(),
        label: "合成测试".into(),
        service: "custom".into(),
        protocol: "chat".into(),
        base_url: "https://invalid.example/v1".into(),
        model: "synthetic-model".into(),
        context_chars: 32000,
        max_output_tokens: 1000,
        downstream: None,
        codex_path: None,
        output_token_parameter: None,
        cli_model_mode: None,
        reasoning_effort: None,
        cli_version: None,
    };
    sql.execute(
        "INSERT INTO ai_profiles VALUES('test-profile',?1,0)",
        [serde_json::to_string(&profile).unwrap()],
    )
    .unwrap();
    let conversation = db
        .ai_create_conversation("2026-10-21".into(), "Asia/Shanghai".into())
        .unwrap();
    (root, db, conversation)
}
fn input(record: &str, request: &str, kind: &str) -> StartInput {
    StartInput {
        request_id: request.into(),
        record_id: record.into(),
        profile_id: "test-profile".into(),
        kind: kind.into(),
        text: "合成消息".into(),
        source_ids: vec!["source".into()],
        new_chat: None,
        preview: (kind == "draft").then(|| lifestory_studio_lib::ai_experience::PreviewSpec {
            mode: "create".into(),
            target_id: None,
        }),
    }
}
#[test]
fn messages_and_previews_are_independent_and_sources_point_to_selected_versions() {
    let (root, db, conversation) = setup();
    let (t, _, messages) = db
        .ai_prepare(input(&conversation, "chat-request", "chat"))
        .unwrap();
    assert!(messages.iter().any(|m| m.text.contains("公园散步")));
    root.sql()
        .execute(
            "UPDATE records SET working_text='后来改写' WHERE id='source'",
            [],
        )
        .unwrap();
    db.ai_finish(t.id, Ok("合成回应".into())).unwrap();
    let w = db.ai_workspace(conversation.clone()).unwrap();
    assert_eq!(w.messages.len(), 2);
    assert_eq!(w.messages[1]["text"], "合成回应");
    let source = &w.sources[0];
    assert_eq!(
        db.ai_compare(
            conversation.clone(),
            source.id.clone(),
            source.revision_id.clone().unwrap()
        )
        .unwrap(),
        "公园散步"
    );
    let (t, _, _) = db
        .ai_prepare(input(&conversation, "draft-request", "draft"))
        .unwrap();
    db.ai_finish(t.id.clone(), Ok("一篇合成整理稿".into()))
        .unwrap();
    assert!(db.ai_task(t.id.clone()).unwrap().result_id.is_none());
    let preview = db.ai_preview(t.id.clone()).unwrap();
    assert_eq!(preview.text, "一篇合成整理稿");
    let result = db
        .ai_adopt(lifestory_studio_lib::ai_experience::Adopt {
            task_id: t.id,
            request_id: "adopt".into(),
            title: "日记".into(),
            record_date: "2026-10-21".into(),
            text: preview.text,
        })
        .unwrap()
        .record_id;
    assert_eq!(
        root.sql()
            .query_row("SELECT kind FROM records WHERE id=?1", [&result], |r| {
                r.get::<_, String>(0)
            })
            .unwrap(),
        "text"
    );
    assert_eq!(
        db.read_record("source".into()).unwrap().title.as_deref(),
        Some("合成原文")
    );
    assert_eq!(db.ai_workspace(result).unwrap().sources.len(), 2);
}
#[test]
fn cancellation_deletion_and_restart_reject_late_completion() {
    let (root, db, conversation) = setup();
    let (t, _, _) = db
        .ai_prepare(input(&conversation, "first", "chat"))
        .unwrap();
    let (retried, _, messages) = db
        .ai_prepare(input(&conversation, "first", "chat"))
        .unwrap();
    assert_eq!(retried.id, t.id);
    assert!(messages.is_empty());
    db.ai_cancel(t.id.clone()).unwrap();
    db.ai_finish(t.id, Ok("不应保存的晚到结果".into())).unwrap();
    assert_eq!(
        db.ai_workspace(conversation.clone())
            .unwrap()
            .messages
            .len(),
        1
    );
    let (t, _, _) = db
        .ai_prepare(input(&conversation, "second", "chat"))
        .unwrap();
    let impact = db.trash_impact("source".into()).unwrap();
    assert!(!impact.references.is_empty());
    db.trash_move(TrashRequest {
        record_id: "source".into(),
        expected_content_version: impact.content_version,
        expected_impact: impact.impact_token,
    })
    .unwrap();
    assert_eq!(db.ai_task(t.id.clone()).unwrap().status, "cancelled");
    db.ai_finish(t.id, Ok("删除后晚到".into())).unwrap();
    assert_eq!(
        root.sql()
            .query_row("SELECT count(*) FROM ai_task_sources", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
    let mut request = input(&conversation, "third", "chat");
    request.source_ids.clear();
    let (t, _, _) = db.ai_prepare(request).unwrap();
    drop(db);
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(db.ai_task(t.id).unwrap().status, "interrupted");
    assert_eq!(db.ai_workspace(conversation).unwrap().messages.len(), 3);
}
#[test]
fn capacity_and_deleted_sources_fail_before_sending_or_writing_user_message() {
    let (root, db, conversation) = setup();
    root.sql()
        .execute(
            "UPDATE ai_profiles SET profile_json=json_set(profile_json,'$.contextChars',2)",
            [],
        )
        .unwrap();
    assert!(
        db.ai_prepare(input(&conversation, "budget", "chat"))
            .is_err()
    );
    assert!(
        db.ai_workspace(conversation.clone())
            .unwrap()
            .messages
            .is_empty()
    );
    assert_eq!(
        root.sql()
            .query_row("SELECT count(*) FROM ai_task_sources", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
    root.sql()
        .execute(
            "UPDATE ai_profiles SET profile_json=json_set(profile_json,'$.contextChars',32000)",
            [],
        )
        .unwrap();
    let impact = db.trash_impact("source".into()).unwrap();
    db.trash_move(TrashRequest {
        record_id: "source".into(),
        expected_content_version: impact.content_version,
        expected_impact: impact.impact_token,
    })
    .unwrap();
    assert!(
        db.ai_prepare(input(&conversation, "deleted", "chat"))
            .is_err()
    );
    assert!(db.ai_workspace(conversation).unwrap().messages.is_empty());
}

#[test]
fn deleting_fence_blocks_new_material_and_rejects_prepared_results_before_recycle() {
    let (root, db, conversation) = setup();
    let (t, _, _) = db
        .ai_prepare(input(&conversation, "fenced", "chat"))
        .unwrap();
    let impact = db.trash_impact("source".into()).unwrap();
    let (delete, affected) = db
        .trash_fence(TrashRequest {
            record_id: "source".into(),
            expected_content_version: impact.content_version,
            expected_impact: impact.impact_token,
        })
        .unwrap();
    assert!(affected.contains(&t.id));
    assert_eq!(db.ai_task(t.id.clone()).unwrap().status, "cancelled");
    assert!(
        db.ai_prepare(input(&conversation, "blocked", "chat"))
            .is_err()
    );
    assert!(db.read_record("source".into()).is_ok());
    db.ai_finish(t.id, Ok("not saved after fence".into()))
        .unwrap();
    assert_eq!(db.ai_workspace(conversation).unwrap().messages.len(), 1);
    db.trash_move(delete).unwrap();
    assert!(db.read_record("source".into()).is_err());
    assert_eq!(
        root.sql()
            .query_row("SELECT count(*) FROM ai_source_blocks", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn conversation_images_are_local_deduplicated_and_excluded_from_model_messages() {
    let (root, db, conversation) = setup();
    let bytes = include_bytes!("../../tools/image-validation/fixtures/static.png").to_vec();
    let request = || lifestory_studio_lib::attachments::ConversationImage {
        record_id: conversation.clone(),
        request_id: "photo-request".into(),
        name: "synthetic.png".into(),
    };
    db.import_conversation_image(request(), bytes.clone())
        .unwrap();
    db.import_conversation_image(request(), bytes.clone())
        .unwrap();
    let w = db.ai_workspace(conversation.clone()).unwrap();
    assert_eq!(w.messages.len(), 1);
    let aid = w.messages[0]["images"][0].as_str().unwrap();
    assert!(
        !db.attachment_bytes(conversation.clone(), aid.into(), None, false)
            .unwrap()
            .is_empty()
    );
    let (_, _, messages) = db
        .ai_prepare(input(&conversation, "image-context", "chat"))
        .unwrap();
    assert!(messages.iter().all(|m| !m.text.trim().is_empty()));
    assert!(!messages.iter().any(|m| m.text.contains(aid)
        || m.text.contains("synthetic.png")
        || m.text.contains("data:image")));
    assert_eq!(
        root.sql()
            .query_row("SELECT count(*) FROM image_objects", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
}

fn preview_input(record: &str, request: &str, mode: &str, target: Option<&str>) -> StartInput {
    let mut value = input(record, request, "draft");
    value.source_ids.clear();
    value.preview = Some(lifestory_studio_lib::ai_experience::PreviewSpec {
        mode: mode.into(),
        target_id: target.map(str::to_owned),
    });
    value
}
fn adopt_request(task: &str, text: &str) -> lifestory_studio_lib::ai_experience::Adopt {
    lifestory_studio_lib::ai_experience::Adopt {
        task_id: task.into(),
        request_id: format!("adopt-{task}"),
        title: "采用的日记".into(),
        record_date: "2026-10-21".into(),
        text: text.into(),
    }
}
#[test]
fn lazy_chat_and_validation_are_atomic_and_never_create_diaries() {
    let (root, db, _) = setup();
    let make = |request: &str| {
        lifestory_studio_lib::ai_experience::ChatSend {
            request_id: request.into(),
            conversation_id: None,
            profile_id: "test-profile".into(),
            text: "首条讲述".into(),
            source_ids: vec![],
            record_date: "2026-10-21".into(),
            timezone: "Asia/Shanghai".into(),
        }
        .into_start()
    };
    let before: i64 = root
        .sql()
        .query_row("SELECT count(*) FROM records", [], |r| r.get(0))
        .unwrap();
    root.sql()
        .execute(
            "UPDATE ai_profiles SET profile_json=json_set(profile_json,'$.contextChars',2)",
            [],
        )
        .unwrap();
    assert!(db.ai_prepare(make("invalid-budget")).is_err());
    assert_eq!(
        root.sql()
            .query_row("SELECT count(*) FROM records", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        before
    );
    root.sql()
        .execute(
            "UPDATE ai_profiles SET profile_json=json_set(profile_json,'$.contextChars',32000)",
            [],
        )
        .unwrap();
    let (t, _, messages) = db.ai_prepare(make("lazy-send")).unwrap();
    assert!(!messages.iter().any(|m| m.text.contains("公园散步")));
    assert_eq!(
        db.ai_workspace(t.record_id.clone()).unwrap().messages.len(),
        1
    );
    let page = db.query_library(Default::default()).unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].id, "source");
    assert!(db.preview_library_content(t.record_id).is_err());
}
#[test]
fn preview_is_not_a_diary_and_adoption_is_idempotent_and_preserves_chat() {
    let (root, db, chat) = setup();
    let (t, _, _) = db.ai_prepare(input(&chat, "tell", "chat")).unwrap();
    db.ai_finish(t.id, Ok("AI 猜测不可当作经历".into()))
        .unwrap();
    let (t, _, messages) = db
        .ai_prepare(preview_input(&chat, "preview", "create", None))
        .unwrap();
    assert!(
        !messages
            .iter()
            .any(|m| m.text.contains("AI 猜测不可当作经历"))
    );
    let before: i64 = root
        .sql()
        .query_row("SELECT count(*) FROM records WHERE kind='text'", [], |r| {
            r.get(0)
        })
        .unwrap();
    db.ai_finish(t.id.clone(), Ok("生成的合成正文".into()))
        .unwrap();
    assert_eq!(
        root.sql()
            .query_row("SELECT count(*) FROM records WHERE kind='text'", [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap(),
        before
    );
    let result = db
        .ai_adopt(adopt_request(&t.id, "用户修改后的日记"))
        .unwrap();
    let mut retry = adopt_request(&t.id, "用户修改后的日记");
    retry.request_id = "new-transport-retry".into();
    assert_eq!(db.ai_adopt(retry).unwrap().record_id, result.record_id);
    assert!(
        db.ai_adopt(adopt_request(&t.id, "不能第二次换正文"))
            .is_err()
    );
    assert_eq!(
        db.read_record(result.record_id.clone()).unwrap().document["content"][0]["content"][0]["text"],
        "用户修改后的日记"
    );
    assert_eq!(
        db.ai_workspace(chat).unwrap().linked_diary_id,
        Some(result.record_id)
    );
}
#[test]
fn append_uses_only_new_user_messages_and_conflicts_never_overwrite() {
    let (root, db, chat) = setup();
    let (t, _, _) = db.ai_prepare(input(&chat, "first-tell", "chat")).unwrap();
    db.ai_finish(t.id, Ok("回应".into())).unwrap();
    let (t, _, _) = db
        .ai_prepare(preview_input(&chat, "create-preview", "create", None))
        .unwrap();
    db.ai_finish(t.id.clone(), Ok("旧讲述".into())).unwrap();
    let diary = db
        .ai_adopt(adopt_request(&t.id, "旧讲述"))
        .unwrap()
        .record_id;
    assert!(
        db.ai_prepare(preview_input(&chat, "no-new", "append", Some(&diary)))
            .is_err()
    );
    let mut tell = input(&chat, "next-tell", "chat");
    tell.text = "新补充讲述".into();
    tell.source_ids.clear();
    let (t, _, _) = db.ai_prepare(tell).unwrap();
    db.ai_finish(t.id, Ok("AI 的建议".into())).unwrap();
    let (t, _, messages) = db
        .ai_prepare(preview_input(
            &chat,
            "append-preview",
            "append",
            Some(&diary),
        ))
        .unwrap();
    assert!(messages.iter().any(|m| m.text.contains("新补充讲述")));
    assert!(!messages.iter().any(|m| m.text.contains("AI 的建议")));
    db.ai_finish(t.id.clone(), Ok("补充段落".into())).unwrap();
    let preview = db.ai_preview(t.id.clone()).unwrap();
    assert_eq!(preview.target_text.as_deref(), Some("旧讲述"));
    root.sql().execute("UPDATE records SET working_text='较新编辑',content_version=content_version+1 WHERE id=?1",[&diary]).unwrap();
    assert!(db.ai_adopt(adopt_request(&t.id, "补充段落")).is_err());
    assert_eq!(
        root.sql()
            .query_row(
                "SELECT working_text FROM records WHERE id=?1",
                [diary],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
        "较新编辑"
    );
}
#[test]
fn source_deletion_invalidates_preview_and_domain_trash_is_separate() {
    let (root, db, chat) = setup();
    let (t, _, _) = db.ai_prepare(input(&chat, "chat-tell", "chat")).unwrap();
    db.ai_finish(t.id, Ok("回应".into())).unwrap();
    let (t, _, _) = db
        .ai_prepare(preview_input(&chat, "append", "append", Some("source")))
        .unwrap();
    db.ai_finish(t.id.clone(), Ok("预览".into())).unwrap();
    let impact = db.trash_impact("source".into()).unwrap();
    db.trash_move(TrashRequest {
        record_id: "source".into(),
        expected_content_version: impact.content_version,
        expected_impact: impact.impact_token,
    })
    .unwrap();
    assert!(db.ai_adopt(adopt_request(&t.id, "不该保存")).is_err());
    assert!(db.ai_preview(t.id.clone()).is_err());
    assert_eq!(
        root.sql()
            .query_row(
                "SELECT text FROM ai_previews WHERE task_id=?1",
                [t.id],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
        ""
    );
    let impact = db.trash_impact(chat.clone()).unwrap();
    db.trash_move(TrashRequest {
        record_id: chat.clone(),
        expected_content_version: impact.content_version,
        expected_impact: impact.impact_token,
    })
    .unwrap();
    assert_eq!(db.trash_list(0).unwrap().items.len(), 1);
    let trash = db.trash_list_domain(0, "chat".into()).unwrap();
    assert_eq!(trash.items[0].id, chat);
    db.trash_restore(chat.clone(), trash.items[0].deleted_at)
        .unwrap();
    assert!(db.ai_workspace(chat).is_ok());
}
#[test]
fn schema_twelve_upgrade_preserves_drafts_chats_and_preferences_persist() {
    let (root, db, chat) = setup();
    db.ai_set_default(Some("test-profile".into())).unwrap();
    assert_eq!(
        db.ai_preferences().unwrap().default_profile_id.as_deref(),
        Some("test-profile")
    );
    drop(db);
    let sql = root.sql();
    sql.execute("UPDATE records SET kind='draft' WHERE id='source'", [])
        .unwrap();
    sql.execute_batch("ALTER TABLE ai_tasks DROP COLUMN effective_profile_json; DROP TABLE ai_request_receipts; DROP TABLE ai_adopted_ranges; DROP TABLE ai_previews; DROP TABLE ai_conversations; DROP TABLE ai_preferences; PRAGMA user_version=12;").unwrap();
    drop(sql);
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    assert!(db.read_record("source".into()).is_ok());
    assert!(db.ai_workspace(chat).is_ok());
    assert_eq!(db.query_library(Default::default()).unwrap().items.len(), 1);
    db.ai_set_default(Some("test-profile".into())).unwrap();
    drop(db);
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(
        db.ai_preferences().unwrap().default_profile_id.as_deref(),
        Some("test-profile")
    );
}

#[test]
fn rewrite_preserves_image_position_original_bytes_and_restore_history() {
    use lifestory_studio_lib::{
        attachments::{AttachmentOperation, ImportImage},
        recovery::BeginEdit,
    };
    use serde_json::json;
    let (root, db, chat) = setup();
    let source = db.read_record("source".into()).unwrap();
    let session = db
        .begin_edit(BeginEdit {
            record_id: "source".into(),
            expected_content_version: source.content_version,
            recovery: None,
        })
        .unwrap();
    let document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"原来的第一段"}]},{"type":"attachmentImage","attrs":{"attachmentId":"image"}},{"type":"paragraph","content":[{"type":"text","text":"原来的第二段"}]}]});
    let imported = db
        .import_image(
            ImportImage {
                operation: AttachmentOperation {
                    record_id: "source".into(),
                    session_id: session.session_id,
                    expected_content_version: session.record.content_version,
                    request_id: "image".into(),
                },
                name: "synthetic.png".into(),
                document,
            },
            include_bytes!("../../tools/image-validation/fixtures/static.png").to_vec(),
        )
        .unwrap();
    let (t, _, _) = db
        .ai_prepare(input(&chat, "tell-for-rewrite", "chat"))
        .unwrap();
    db.ai_finish(t.id, Ok("回应".into())).unwrap();
    let (t, _, _) = db
        .ai_prepare(preview_input(&chat, "rewrite", "rewrite", Some("source")))
        .unwrap();
    db.ai_finish(t.id.clone(), Ok("新的第一段\n新的第二段".into()))
        .unwrap();
    db.ai_adopt(adopt_request(&t.id, "新的第一段\n新的第二段"))
        .unwrap();
    let current = db.read_record("source".into()).unwrap();
    assert_eq!(current.document["content"][1]["type"], "attachmentImage");
    assert_eq!(
        current.document["content"][1]["attrs"]["attachmentId"],
        imported.attachment_id
    );
    assert_eq!(
        current.document["content"][2]["content"][0]["text"],
        "新的第二段"
    );
    assert_eq!(
        db.attachment_bytes("source".into(), imported.attachment_id, None, true)
            .unwrap(),
        include_bytes!("../../tools/image-validation/fixtures/static.png")
    );
    assert!(root.sql().query_row("SELECT EXISTS(SELECT 1 FROM record_revisions WHERE record_id='source' AND searchable_text LIKE '%原来的第一段%')",[],|r|r.get::<_,bool>(0)).unwrap());
    assert!(db.ai_preview(t.id.clone()).unwrap().can_undo);
    db.ai_undo_adoption(t.id.clone()).unwrap();
    let before = db.read_record("source".into()).unwrap();
    assert_eq!(
        before.document["content"][0]["content"][0]["text"],
        "原来的第一段"
    );
    assert_eq!(before.document["content"][1]["type"], "attachmentImage");
    let version = before.content_version;
    db.ai_undo_adoption(t.id.clone()).unwrap();
    assert_eq!(
        db.read_record("source".into()).unwrap().content_version,
        version
    );
    assert!(!db.ai_preview(t.id).unwrap().can_undo);
}

#[test]
fn purged_adopted_diary_cannot_be_recreated_from_the_same_preview() {
    let (root, db, chat) = setup();
    let (t, _, _) = db.ai_prepare(input(&chat, "purge-tell", "chat")).unwrap();
    db.ai_finish(t.id, Ok("回应".into())).unwrap();
    let (preview, _, _) = db
        .ai_prepare(preview_input(&chat, "purge-preview", "create", None))
        .unwrap();
    db.ai_finish(preview.id.clone(), Ok("合成日记".into()))
        .unwrap();
    let result = db.ai_adopt(adopt_request(&preview.id, "合成日记")).unwrap();
    let impact = db.trash_impact(result.record_id.clone()).unwrap();
    db.trash_move(TrashRequest {
        record_id: result.record_id.clone(),
        expected_content_version: impact.content_version,
        expected_impact: impact.impact_token,
    })
    .unwrap();
    let deleted = root
        .sql()
        .query_row(
            "SELECT deleted_at FROM records WHERE id=?1",
            [&result.record_id],
            |r| r.get::<_, i64>(0),
        )
        .unwrap();
    db.trash_purge(result.record_id, deleted).unwrap();
    assert!(db.ai_adopt(adopt_request(&preview.id, "合成日记")).is_err());
    let mut another = adopt_request(&preview.id, "合成日记");
    another.request_id = "another-adopt-attempt".into();
    assert!(db.ai_adopt(another).is_err());
    assert!(db.ai_workspace(chat).unwrap().preview_task_id.is_none());
    assert_eq!(
        root.sql()
            .query_row("SELECT count(*) FROM records WHERE kind='text'", [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap(),
        1
    );
}
#[test]
fn chosen_chat_context_is_persisted_and_removal_does_not_readd_old_sources() {
    let (root, db, chat) = setup();
    db.create_record(CreateRecord {
        request_id: "second-source".into(),
        record_date: "2026-10-22".into(),
        created_timezone: "Asia/Shanghai".into(),
    })
    .unwrap();
    let mut tell = input(&chat, "multi-context", "chat");
    tell.source_ids = vec!["source".into(), "second-source".into()];
    let (task, _, _) = db.ai_prepare(tell).unwrap();
    db.ai_finish(task.id, Ok("回应".into())).unwrap();
    assert_eq!(db.ai_workspace(chat.clone()).unwrap().context_ids.len(), 2);
    drop(db);
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(db.ai_workspace(chat.clone()).unwrap().context_ids.len(), 2);
    let mut tell = input(&chat, "clear-context", "chat");
    tell.source_ids.clear();
    let (task, _, _) = db.ai_prepare(tell).unwrap();
    db.ai_finish(task.id, Ok("回应".into())).unwrap();
    let w = db.ai_workspace(chat).unwrap();
    assert!(w.context_ids.is_empty());
    assert!(!w.sources.is_empty());
}

#[test]
fn cli_effective_model_is_frozen_per_conversation_and_survives_restart() {
    let (root, db, chat) = setup();
    let mut preferred = db.ai_profiles().unwrap().remove(0);
    preferred.protocol = "codex".into();
    preferred.service = "codex".into();
    preferred.codex_path = Some("/synthetic/codex".into());
    preferred.model = String::new();
    preferred.cli_model_mode = Some("inherit".into());
    root.sql()
        .execute(
            "UPDATE ai_profiles SET profile_json=?1 WHERE id='test-profile'",
            [serde_json::to_string(&preferred).unwrap()],
        )
        .unwrap();
    assert!(db.ai_prepare(input(&chat, "unresolved", "chat")).is_err());
    let mut first = preferred.clone();
    first.model = "first-model".into();
    first.reasoning_effort = Some("medium".into());
    first.cli_version = Some("codex-cli 0.163.0".into());
    let (task, used, _) = db
        .ai_prepare_resolved(input(&chat, "resolved-first", "chat"), Some(first))
        .unwrap();
    assert_eq!(used.model, "first-model");
    db.ai_finish(task.id, Ok("合成回应".into())).unwrap();
    let mut changed = preferred;
    changed.model = "changed-default".into();
    changed.reasoning_effort = Some("high".into());
    let (task, used, _) = db
        .ai_prepare_resolved(input(&chat, "resolved-next", "chat"), Some(changed.clone()))
        .unwrap();
    assert_eq!(used.model, "first-model");
    assert_eq!(used.reasoning_effort.as_deref(), Some("medium"));
    db.ai_finish(task.id, Ok("合成回应".into())).unwrap();
    let other = db
        .ai_create_conversation("2026-10-22".into(), "Asia/Shanghai".into())
        .unwrap();
    let (task, used, _) = db
        .ai_prepare_resolved(input(&other, "new-chat-default", "chat"), Some(changed))
        .unwrap();
    assert_eq!(used.model, "changed-default");
    db.ai_finish(task.id, Ok("合成回应".into())).unwrap();
    drop(db);
    let db = DatabaseWorker::start(root.0.clone()).unwrap();
    assert_eq!(
        db.ai_workspace(chat.clone())
            .unwrap()
            .effective_model
            .as_deref(),
        Some("first-model")
    );
    let (snapshot, frozen) = db
        .ai_cli_profile(chat, "test-profile".into(), "resolved-first".into())
        .unwrap();
    assert!(frozen);
    assert_eq!(snapshot.model, "first-model");
    assert_eq!(snapshot.cli_version.as_deref(), Some("codex-cli 0.163.0"));
}
