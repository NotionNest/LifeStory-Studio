use crate::{
    records::{fail, identifier},
    storage::StorageResult,
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MessageCursor {
    pub id: String,
    pub sequence: i64,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowRequest {
    pub before: Option<MessageCursor>,
    pub after: Option<MessageCursor>,
    pub around: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePage {
    pub has_before: bool,
    pub has_after: bool,
    pub latest: Option<MessageCursor>,
    pub has_user_text: bool,
}

pub(crate) fn window(
    db: &Connection,
    record: &str,
    input: WindowRequest,
) -> StorageResult<(Vec<Value>, MessagePage)> {
    if usize::from(input.before.is_some())
        + usize::from(input.after.is_some())
        + usize::from(input.around.is_some())
        > 1
    {
        return Err(fail("validation", "一次只能指定一个消息窗口方向"));
    }
    for cursor in [&input.before, &input.after].into_iter().flatten() {
        identifier(&cursor.id)?;
        let exists: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM conversation_messages WHERE record_id=?1 AND id=?2 AND sequence=?3)", params![record, cursor.id, cursor.sequence], |r| r.get(0))?;
        if !exists {
            return Err(fail("not_found", "消息游标不属于当前聊天"));
        }
    }
    let mut messages = if let Some(target) = input.around {
        identifier(&target)?;
        let sequence: i64 = db
            .query_row(
                "SELECT sequence FROM conversation_messages WHERE record_id=?1 AND id=?2",
                params![record, target],
                |r| r.get(0),
            )
            .optional()?
            .ok_or_else(|| fail("not_found", "命中的消息已不存在或不属于当前聊天"))?;
        let mut before = read(db, record, "<", sequence, true, 50)?;
        before.extend(read(db, record, ">=", sequence, false, 50)?);
        before
    } else if let Some(cursor) = input.before {
        read(db, record, "<", cursor.sequence, true, 100)?
    } else if let Some(cursor) = input.after {
        read(db, record, ">", cursor.sequence, false, 100)?
    } else {
        read(db, record, ">=", 0, true, 100)?
    };
    messages.sort_by_key(|message| message["sequence"].as_i64());
    let latest = db.query_row("SELECT id,sequence FROM conversation_messages WHERE record_id=?1 ORDER BY sequence DESC LIMIT 1", [record], |r| Ok(MessageCursor { id: r.get(0)?, sequence: r.get(1)? })).optional()?;
    let has_before = if let Some(first) = messages.first() {
        db.query_row(
            "SELECT EXISTS(SELECT 1 FROM conversation_messages WHERE record_id=?1 AND sequence<?2)",
            params![record, first["sequence"].as_i64()],
            |r| r.get(0),
        )?
    } else {
        false
    };
    let has_after = if let Some(last) = messages.last() {
        latest
            .as_ref()
            .is_some_and(|cursor| cursor.sequence > last["sequence"].as_i64().unwrap_or(-1))
    } else {
        false
    };
    let has_user_text = db.query_row(
        "SELECT has_user_text FROM ai_conversations WHERE record_id=?1",
        [record],
        |row| row.get(0),
    )?;
    Ok((
        messages,
        MessagePage {
            has_before,
            has_after,
            latest,
            has_user_text,
        },
    ))
}

fn read(
    db: &Connection,
    record: &str,
    comparison: &str,
    sequence: i64,
    descending: bool,
    limit: i64,
) -> StorageResult<Vec<Value>> {
    let order = if descending { "DESC" } else { "ASC" };
    // comparison/order are private fixed SQL fragments, never caller input.
    let sql = format!(
        "SELECT m.id,m.role,m.content_json,m.sequence,m.created_at,t.reasoning_summary,t.updated_at-t.created_at FROM (SELECT * FROM conversation_messages WHERE record_id=?1 AND sequence {comparison} ?2 ORDER BY sequence {order} LIMIT ?3) m LEFT JOIN ai_tasks t ON t.id=substr(m.request_id,11) AND m.request_id LIKE 'assistant:%' AND t.record_id=m.record_id ORDER BY m.sequence"
    );
    let mut statement = db.prepare(&sql)?;
    let rows = statement.query_map(params![record, sequence, limit], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, i64>(3)?,
            r.get::<_, i64>(4)?,
            r.get::<_, Option<String>>(5)?,
            r.get::<_, Option<i64>>(6)?,
        ))
    })?;
    rows.map(|row| {
        let (id, role, raw, sequence, created_at, reasoning_summary, duration_ms) = row?;
        let content: Value = serde_json::from_str(&raw)?;
        Ok(json!({
            "id": id, "role": role, "text": crate::ai::message_text(&content),
            "images": content["images"], "sequence": sequence, "createdAt": created_at,
            "reasoningSummary": reasoning_summary, "durationMs": duration_ms
        }))
    })
    .collect()
}
