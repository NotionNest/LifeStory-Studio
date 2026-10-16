use crate::{
    records::{Record, SaveRecord, Tag, document_text, fail, id, load, now},
    storage::{DatabaseWorker, StorageResult},
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryDraft {
    pub session_id: String,
    pub edit_sequence: u32,
    pub written_at: i64,
    pub input: SaveRecord,
    pub tags: Vec<Tag>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySummary {
    pub record_id: String,
    pub title: Option<String>,
    pub written_at: i64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryChoice {
    pub session_id: String,
    pub edit_sequence: u32,
    pub action: RecoveryAction,
}
#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryAction {
    Restore,
    Discard,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BeginEdit {
    pub record_id: String,
    pub expected_revision_id: String,
    pub recovery: Option<RecoveryChoice>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditingSession {
    pub record: Record,
    pub session_id: String,
    pub recovered: Option<SaveRecord>,
    pub recovered_tags: Vec<Tag>,
}

fn read_draft(db: &Connection, record_id: &str) -> StorageResult<Option<RecoveryDraft>> {
    let row=db.query_row("SELECT session_id,edit_sequence,written_at,payload_json FROM recovery_drafts WHERE record_id=?1",[record_id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,u32>(1)?,r.get::<_,i64>(2)?,r.get::<_,String>(3)?))).optional()?;
    row.map(|(session_id, edit_sequence, written_at, json)| {
        let input: SaveRecord = serde_json::from_str(&json)
            .map_err(|_| fail("corrupt_content", "恢复草稿无法读取，尚未清理该草稿"))?;
        if input.record_id != record_id
            || input.session_id != session_id
            || input.edit_sequence != edit_sequence
        {
            return Err(fail("corrupt_content", "恢复草稿身份不一致，尚未清理"));
        }
        let tags = input
            .tag_ids
            .iter()
            .map(|id| {
                db.query_row("SELECT id,display_name FROM tags WHERE id=?1", [id], |r| {
                    Ok(Tag {
                        id: r.get(0)?,
                        name: r.get(1)?,
                    })
                })
                .map_err(Into::into)
            })
            .collect::<StorageResult<Vec<Tag>>>()?;
        Ok(RecoveryDraft {
            session_id,
            edit_sequence,
            written_at,
            tags,
            input,
        })
    })
    .transpose()
}
fn changed(record: &Record, input: &SaveRecord) -> bool {
    let mut a: Vec<_> = record.tags.iter().map(|t| t.id.as_str()).collect();
    a.sort();
    let mut b: Vec<_> = input.tag_ids.iter().map(String::as_str).collect();
    b.sort();
    b.dedup();
    record.document != input.document
        || record.record_date != input.record_date
        || record.title.as_deref()
            != input
                .title
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
        || a != b
}
fn draft_for_record(db: &Connection, record: &Record) -> StorageResult<Option<RecoveryDraft>> {
    let Some(draft) = read_draft(db, &record.id)? else {
        return Ok(None);
    };
    if changed(record, &draft.input) {
        return Ok(Some(draft));
    }
    db.execute(
        "DELETE FROM recovery_drafts WHERE record_id=?1 AND session_id=?2 AND edit_sequence=?3",
        params![record.id, draft.session_id, draft.edit_sequence],
    )?;
    Ok(None)
}
fn validate(db: &Connection, input: &SaveRecord) -> StorageResult<()> {
    document_text(&input.document)?;
    if input
        .title
        .as_ref()
        .is_some_and(|s| s.chars().count() > 240)
        || input.record_date.len() > 10
        || input.tag_ids.len() > 50
        || !input.attachment_ids.is_empty()
    {
        return Err(fail("validation", "恢复草稿的字段超过支持范围"));
    }
    for tag in &input.tag_ids {
        if db
            .query_row("SELECT 1 FROM tags WHERE id=?1", [tag], |r| {
                r.get::<_, i64>(0)
            })
            .optional()?
            .is_none()
        {
            return Err(fail("validation", "恢复草稿关联的标签不存在"));
        }
    }
    Ok(())
}
fn put_draft(db: &Connection, input: &SaveRecord) -> StorageResult<()> {
    db.execute("INSERT INTO recovery_drafts(record_id,base_revision_id,session_id,edit_sequence,payload_json,written_at) VALUES (?1,?2,?3,?4,?5,?6)
        ON CONFLICT(record_id) DO UPDATE SET base_revision_id=excluded.base_revision_id,session_id=excluded.session_id,edit_sequence=excluded.edit_sequence,payload_json=excluded.payload_json,written_at=excluded.written_at",
        params![input.record_id,input.base_revision_id,input.session_id,input.edit_sequence,serde_json::to_string(input)?,now()?])?;
    Ok(())
}
impl DatabaseWorker {
    pub fn recovery_list(&self) -> StorageResult<Vec<RecoverySummary>> {
        self.call(|db,_| {
            let mut stmt=db.prepare("SELECT d.record_id,r.title,d.written_at FROM recovery_drafts d JOIN records r ON r.id=d.record_id WHERE r.deleted_at IS NULL AND r.kind='text' ORDER BY d.written_at DESC,d.record_id")?;
            Ok(stmt.query_map([],|r|Ok(RecoverySummary{record_id:r.get(0)?,title:r.get(1)?,written_at:r.get(2)?}))?.collect::<Result<Vec<_>,_>>()?)
        })
    }
    pub fn recovery_read(&self, record_id: String) -> StorageResult<Option<RecoveryDraft>> {
        self.call(move |db, _| {
            let record = load(db, &record_id)?;
            draft_for_record(db, &record)
        })
    }
    pub fn begin_edit(&self, input: BeginEdit) -> StorageResult<EditingSession> {
        self.call(move|db,_| {
            let tx=db.transaction()?;let record=load(&tx,&input.record_id)?;
            if record.revision_id!=input.expected_revision_id {return Err(fail("conflict","正式内容已更新，请重新打开预览后选择"));}
            let draft=draft_for_record(&tx,&record)?;
            match (&draft,&input.recovery) {
                (Some(d),Some(c)) if d.session_id==c.session_id && d.edit_sequence==c.edit_sequence=>{},
                (Some(_),None)=>return Err(fail("conflict","存在未处理的恢复草稿，请先预览")),
                (None,None)=>{},
                _=>return Err(fail("conflict","恢复草稿已变化，请重新预览")),
            }
            let session_id=id(&tx)?;let mut recovered=None;let mut recovered_tags=vec![];
            if let (Some(draft),Some(choice))=(draft,input.recovery) {
                if matches!(choice.action,RecoveryAction::Restore) {
                    let mut restored=draft.input;
                    restored.session_id=session_id.clone();restored.edit_sequence=1;
                    restored.base_revision_id=Some(record.revision_id.clone());restored.request_id=id(&tx)?;
                    validate(&tx,&restored)?;
                    for tag_id in &restored.tag_ids {recovered_tags.push(tx.query_row("SELECT id,display_name FROM tags WHERE id=?1",[tag_id],|r|Ok(Tag{id:r.get(0)?,name:r.get(1)?}))?);}
                    recovered=Some(restored);
                }
                tx.execute("DELETE FROM recovery_drafts WHERE record_id=?1",[&input.record_id])?;
            }
            tx.execute("INSERT INTO edit_sessions VALUES (?1,?2,0) ON CONFLICT(record_id) DO UPDATE SET session_id=excluded.session_id,saved_sequence=0",params![input.record_id,session_id])?;
            // The restored copy is durable under the new lease until a formal save commits.
            if let Some(ref restored)=recovered {put_draft(&tx,restored)?;}
            tx.commit()?;Ok(EditingSession{record,session_id,recovered,recovered_tags})
        })
    }
    pub fn recovery_write(&self, input: SaveRecord) -> StorageResult<bool> {
        self.call(move |db, _| {
            let tx = db.transaction()?;
            load(&tx, &input.record_id)?;
            let active: Option<(String, u32)> = tx
                .query_row(
                    "SELECT session_id,saved_sequence FROM edit_sessions WHERE record_id=?1",
                    [&input.record_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?;
            let Some((session, saved)) = active else {
                return Err(fail("conflict", "编辑会话已结束，不能再写入恢复草稿"));
            };
            if session != input.session_id {
                return Err(fail("conflict", "编辑会话已变化，当前内容仍保留"));
            }
            if input.edit_sequence <= saved {
                return Ok(false);
            }
            if let Some(old) = read_draft(&tx, &input.record_id)? {
                if old.session_id != session {
                    return Err(fail("conflict", "存在其他会话的恢复草稿"));
                }
                if old.edit_sequence >= input.edit_sequence {
                    return Ok(false);
                }
            }
            validate(&tx, &input)?;
            put_draft(&tx, &input)?;
            tx.commit()?;
            Ok(true)
        })
    }
    pub fn end_edit(&self, record_id: String, session_id: String) -> StorageResult<()> {
        self.call(move |db, _| {
            let tx = db.transaction()?;
            let active: Option<String> = tx
                .query_row(
                    "SELECT session_id FROM edit_sessions WHERE record_id=?1",
                    [&record_id],
                    |r| r.get(0),
                )
                .optional()?;
            if active.as_deref() != Some(&session_id) {
                return Err(fail("conflict", "编辑会话已变化，未清理其他会话的草稿"));
            }
            tx.execute(
                "DELETE FROM recovery_drafts WHERE record_id=?1 AND session_id=?2",
                params![record_id, session_id],
            )?;
            tx.execute(
                "DELETE FROM edit_sessions WHERE record_id=?1 AND session_id=?2",
                params![record_id, session_id],
            )?;
            tx.commit()?;
            Ok(())
        })
    }
}
