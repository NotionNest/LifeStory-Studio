use crate::storage::{DatabaseWorker, StorageResult};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fmt,
    time::{SystemTime, UNIX_EPOCH},
};
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordError {
    pub code: &'static str,
    pub message: String,
}
impl fmt::Display for RecordError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for RecordError {}
pub(crate) fn fail(code: &'static str, message: &str) -> Box<dyn std::error::Error + Send + Sync> {
    Box::new(RecordError {
        code,
        message: message.into(),
    })
}
pub(crate) fn now() -> StorageResult<i64> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_millis()
        .try_into()?)
}
pub(crate) fn id(db: &Connection) -> StorageResult<String> {
    Ok(db.query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))?)
}
pub(crate) fn identifier(value: &str) -> StorageResult<()> {
    if value.is_empty() || value.len() > 128 || value.chars().any(char::is_control) {
        return Err(fail("validation", "记录或请求标识无效"));
    }
    Ok(())
}
fn date(value: &str) -> StorageResult<()> {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(i, b)| i != 4 && i != 7 && !b.is_ascii_digit())
    {
        return Err(fail("validation", "记录日期须为有效的 YYYY-MM-DD"));
    }
    let year: u32 = value[..4].parse()?;
    let month: usize = value[5..7].parse()?;
    let day: u32 = value[8..].parse()?;
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let days = [
        0,
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    if year == 0 || month == 0 || month > 12 || day == 0 || day > days[month] {
        return Err(fail("validation", "记录日期无效"));
    }
    Ok(())
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateRecord {
    pub request_id: String,
    pub record_date: String,
    pub created_timezone: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveRecord {
    pub record_id: String,
    #[serde(rename = "baseCheckpointId", alias = "baseRevisionId")]
    pub base_revision_id: Option<String>,
    #[serde(default)]
    pub base_content_version: Option<i64>,
    pub request_id: String,
    pub session_id: String,
    pub edit_sequence: u32,
    pub title: Option<String>,
    pub record_date: String,
    pub tag_ids: Vec<String>,
    pub document: Value,
    pub attachment_ids: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub record_id: String,
    #[serde(rename = "checkpointId", alias = "revisionId")]
    pub revision_id: String,
    #[serde(default)]
    pub content_version: i64,
    pub request_id: String,
    pub session_id: String,
    pub edit_sequence: u32,
    pub saved_at: i64,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub id: String,
    pub title: Option<String>,
    pub record_date: String,
    pub created_timezone: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(rename = "checkpointId", alias = "revisionId")]
    pub revision_id: String,
    #[serde(default)]
    pub content_version: i64,
    pub document: Value,
    pub tags: Vec<Tag>,
    #[serde(default)]
    pub attachments: Vec<crate::attachments::Attachment>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordSummary {
    pub id: String,
    pub title: Option<String>,
    pub record_date: String,
    pub excerpt: String,
}

pub(crate) fn load(db: &Connection, record_id: &str) -> StorageResult<Record> {
    let value = db.query_row("SELECT r.id,r.title,COALESCE(r.pending_date,r.record_date),r.created_timezone,r.created_at,r.updated_at,v.id,COALESCE(r.working_document,v.document_json),r.content_version
                 FROM records r
                 JOIN record_revisions v ON v.id=r.current_revision_id
                 WHERE r.id=?1 AND r.kind='text' AND r.deleted_at IS NULL", [record_id], |r| Ok((r.get::<_,String>(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get::<_,String>(7)?,r.get::<_,i64>(8)?))).optional()?;
    let Some((
        id,
        title,
        record_date,
        created_timezone,
        created_at,
        updated_at,
        revision_id,
        json,
        content_version,
    )) = value
    else {
        return Err(fail("not_found", "记录不存在或已删除"));
    };
    let mut statement = db.prepare(
        "SELECT t.id,t.display_name
                 FROM tags t
                 JOIN record_tags rt ON rt.tag_id=t.id
                 WHERE rt.record_id=?1
                 ORDER BY t.normalized_key",
    )?;
    let tags = statement
        .query_map([record_id], |r| {
            Ok(Tag {
                id: r.get(0)?,
                name: r.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Record {
        id,
        title,
        record_date,
        created_timezone,
        created_at,
        updated_at,
        revision_id,
        content_version,
        attachments: crate::attachments::list(db, record_id)?,
        document: serde_json::from_str(&json)
            .map_err(|_| fail("corrupt_content", "记录正文无法读取，未改动资料"))?,
        tags,
    })
}

// Validate the installed StarterKit schema instead of persisting arbitrary editor nodes or URLs.
pub(crate) fn document_text(document: &Value) -> StorageResult<String> {
    if document.to_string().len() > 2 * 1024 * 1024 {
        return Err(fail("validation", "正文超过 2 MiB，请拆分记录"));
    }
    let mut text = String::new();
    let mut count = 0;
    fn visit(
        node: &Value,
        parent: &str,
        depth: usize,
        count: &mut usize,
        text: &mut String,
    ) -> StorageResult<()> {
        *count += 1;
        if depth > 64 || *count > 50_000 {
            return Err(fail("validation", "正文结构过深或节点过多"));
        }
        let obj = node
            .as_object()
            .ok_or_else(|| fail("validation", "正文节点无效"))?;
        let kind = obj
            .get("type")
            .and_then(Value::as_str)
            .ok_or_else(|| fail("validation", "正文缺少节点类型"))?;
        let block = matches!(
            kind,
            "paragraph"
                | "heading"
                | "blockquote"
                | "bulletList"
                | "orderedList"
                | "codeBlock"
                | "horizontalRule"
                | "attachmentImage"
        );
        let allowed = match parent {
            "" => kind == "doc",
            "doc" | "blockquote" | "listItem" => block,
            "bulletList" | "orderedList" => kind == "listItem",
            "paragraph" | "heading" => matches!(kind, "text" | "hardBreak"),
            "codeBlock" => kind == "text",
            _ => false,
        };
        let children = obj.get("content").and_then(Value::as_array);
        if matches!(
            kind,
            "doc" | "blockquote" | "bulletList" | "orderedList" | "listItem"
        ) && children.is_none_or(Vec::is_empty)
        {
            return Err(fail("validation", "正文缺少必要的子节点"));
        }
        if kind == "listItem"
            && children
                .and_then(|c| c.first())
                .and_then(|n| n.get("type"))
                .and_then(Value::as_str)
                != Some("paragraph")
        {
            return Err(fail("validation", "列表项必须以段落开始"));
        }
        if matches!(kind, "hardBreak" | "horizontalRule" | "attachmentImage")
            && obj.contains_key("content")
        {
            return Err(fail("validation", "叶节点不能有子内容"));
        }
        if !allowed
            || obj
                .keys()
                .any(|k| !matches!(k.as_str(), "type" | "content" | "attrs" | "marks" | "text"))
        {
            return Err(fail("validation", "正文含不支持的节点"));
        }
        if let Some(attrs) = obj.get("attrs") {
            let attrs = attrs
                .as_object()
                .ok_or_else(|| fail("validation", "正文属性无效"))?;
            for (key, v) in attrs {
                let valid = match (kind, key.as_str()) {
                    ("attachmentImage", "attachmentId") => {
                        v.as_str().is_some_and(|s| identifier(s).is_ok())
                    }
                    ("heading", "level") => v.as_i64().is_some_and(|n| (1..=6).contains(&n)),
                    ("orderedList", "type") => {
                        v.is_null()
                            || v.as_str()
                                .is_some_and(|s| ["1", "a", "A", "i", "I"].contains(&s))
                    }
                    ("orderedList", "start") => {
                        v.as_i64().is_some_and(|n| (1..=1_000_000).contains(&n))
                    }
                    ("codeBlock", "language") => {
                        v.is_null() || v.as_str().is_some_and(|s| s.len() <= 64)
                    }
                    _ => false,
                };
                if !valid {
                    return Err(fail("validation", "正文含不支持的属性"));
                }
            }
        }
        if let Some(marks) = obj.get("marks") {
            for mark in marks
                .as_array()
                .ok_or_else(|| fail("validation", "正文标记无效"))?
            {
                let m = mark
                    .as_object()
                    .ok_or_else(|| fail("validation", "正文标记无效"))?;
                let ty = m.get("type").and_then(Value::as_str).unwrap_or("");
                let formatting = matches!(ty, "bold" | "italic" | "strike" | "code" | "underline")
                    && m.keys().all(|k| k == "type");
                if kind != "text" || !formatting {
                    return Err(fail("validation", "正文含不支持的文本标记"));
                }
            }
        }
        if kind == "text" {
            let value = obj
                .get("text")
                .and_then(Value::as_str)
                .ok_or_else(|| fail("validation", "文本节点无效"))?;
            if value.is_empty() || obj.contains_key("content") {
                return Err(fail("validation", "文本节点无效"));
            }
            text.push_str(value);
        } else if obj.contains_key("text") {
            return Err(fail("validation", "节点不能包含文本字段"));
        }
        if kind == "hardBreak" {
            text.push('\n');
        }
        if let Some(children) = obj.get("content") {
            for child in children
                .as_array()
                .ok_or_else(|| fail("validation", "正文子节点无效"))?
            {
                visit(child, kind, depth + 1, count, text)?;
            }
        }
        if block || kind == "listItem" {
            text.push('\n');
        }
        Ok(())
    }
    visit(document, "", 0, &mut count, &mut text)?;
    Ok(text.trim_end_matches('\n').into())
}

impl DatabaseWorker {
    pub fn create_record(&self, input: CreateRecord) -> StorageResult<Record> {
        self.call(move|db,_| {
            identifier(&input.request_id)?; date(&input.record_date)?;
            if input.created_timezone.is_empty() || input.created_timezone.len()>128 || input.created_timezone.chars().any(char::is_control) {return Err(fail("validation","创建时区无效"));}
            // The caller's stable creation UUID is the record identity, making retry safe.
            if db.query_row("SELECT 1 FROM records WHERE id=?1",[&input.request_id],|r|r.get::<_,i64>(0)).optional()?.is_some() {return load(db,&input.request_id);}
            let timestamp=now()?; let revision=id(db)?; let tx=db.transaction()?;
            tx.execute("INSERT INTO records(id,kind,record_date,created_timezone,created_at,updated_at,current_revision_id)
                 VALUES (?1,'text',?2,?3,?4,?4,?5)",params![input.request_id,input.record_date,input.created_timezone,timestamp,revision])?;
            tx.execute("INSERT INTO record_revisions(id,record_id,document_json,searchable_text,created_at,request_id)
                 VALUES (?1,?2,?3,'',?4,?5)",params![revision,input.request_id,r#"{"type":"doc","content":[{"type":"paragraph"}]}"#,timestamp,format!("create:{}",input.request_id)])?;
            tx.execute("INSERT INTO record_search(record_id,content) VALUES (?1,'')",[&input.request_id])?; tx.commit()?; load(db,&input.request_id)
        })
    }
    pub fn read_record(&self, record_id: String) -> StorageResult<Record> {
        self.call(move |db, _| {
            identifier(&record_id)?;
            load(db, &record_id)
        })
    }
    pub fn list_records(&self, offset: u32) -> StorageResult<Vec<RecordSummary>> {
        self.call(move |db, _| {
            let mut stmt = db.prepare(
                "SELECT r.id,r.title,r.record_date,substr(COALESCE(r.working_text,v.searchable_text),1,120)
                 FROM records r
                 JOIN record_revisions v ON v.id=r.current_revision_id
                 WHERE r.kind='text' AND r.deleted_at IS NULL
                 ORDER BY r.record_date DESC,r.created_at DESC,r.id LIMIT 100 OFFSET ?1",
            )?;
            Ok(stmt
                .query_map([offset], |r| {
                    Ok(RecordSummary {
                        id: r.get(0)?,
                        title: r.get(1)?,
                        record_date: r.get(2)?,
                        excerpt: r.get(3)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?)
        })
    }
    pub fn create_tag(&self, name: String) -> StorageResult<Tag> {
        self.call(move |db, _| {
            let name = name.trim().to_string();
            let key: String = name.nfc().collect();
            if name.is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control) {
                return Err(fail("validation", "标签须为 1～64 个字符"));
            }
            let tag_id = id(db)?;
            db.execute(
                "INSERT INTO tags(id,display_name,normalized_key)
                 VALUES (?1,?2,?3)
                 ON CONFLICT(normalized_key) DO NOTHING",
                params![tag_id, name, key],
            )?;
            Ok(db.query_row(
                "SELECT id,display_name FROM tags WHERE normalized_key=?1",
                [key],
                |r| {
                    Ok(Tag {
                        id: r.get(0)?,
                        name: r.get(1)?,
                    })
                },
            )?)
        })
    }
    pub fn save_record(&self, input: SaveRecord) -> StorageResult<SaveResult> {
        self.call(move|db,_| {
            identifier(&input.record_id)?; identifier(&input.request_id)?; identifier(&input.session_id)?; if !input.record_date.is_empty() { date(&input.record_date)?; }
            if input.title.as_ref().is_some_and(|s|s.chars().count()>240||s.contains(['\n','\r'])) || input.tag_ids.len()>50 {return Err(fail("validation","标题或标签数量超过限制"));}
            let text=document_text(&input.document)?;
            let request_json=serde_json::to_string(&input)?;
            let tx=db.transaction()?;
            let current=load(&tx,&input.record_id)?;
            crate::attachments::validate_current(&tx,&input.record_id,&input.document,&input.attachment_ids)?;
            let active: Option<(String,u32)> = tx.query_row("SELECT session_id,saved_sequence FROM edit_sessions WHERE record_id=?1",[&input.record_id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
            let Some((active_session,saved_sequence)) = active else { return Err(fail("conflict","编辑会话已结束，请重新打开记录")); };
            if active_session != input.session_id { return Err(fail("conflict","记录已在其他会话中打开，当前修改仍保留")); }

            if let Some((request,response))=tx.query_row("SELECT request_json,response_json FROM record_save_receipts WHERE request_id=?1",[&input.request_id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).optional()? {
                if request!=request_json {return Err(fail("conflict","同一请求标识不能用于不同修改"));} return Ok(serde_json::from_str(&response)?);
            }
            if input.edit_sequence <= saved_sequence { return Err(fail("conflict","保存序号已过期，不能覆盖较新的修改")); }
            if input.base_content_version!=Some(current.content_version) {return Err(fail("conflict","当前内容已变化，请重新核对，未覆盖任何修改"));}
            if input.base_revision_id.as_deref()!=Some(&current.revision_id) {return Err(fail("conflict","记录已在其他操作中更新，当前修改已保留，请重新核对版本"));}
            let title=input.title.as_deref().map(str::trim).filter(|s|!s.is_empty());
            let mut tags=input.tag_ids.clone(); tags.sort(); tags.dedup();
            for tag in &tags {
                if tx.query_row("SELECT 1 FROM tags WHERE id=?1",[tag],|r|r.get::<_,i64>(0)).optional()?.is_none() {return Err(fail("validation","标签不存在"));}
            }
            let mut old_tags:Vec<_>=current.tags.iter().map(|t|t.id.clone()).collect(); old_tags.sort();
            let document_changed=current.document!=input.document;
            let unchanged=!document_changed && current.title.as_deref()==title && current.record_date==input.record_date && old_tags==tags;
            let timestamp=if unchanged {current.updated_at} else {now()?};
            if current.attachments.iter().any(|a|!input.attachment_ids.contains(&a.id)) {
                crate::recovery::checkpoint_on_entry(&tx,&current)?;
            }
            let revision=load(&tx,&input.record_id)?.revision_id;
            crate::attachments::restore_links(&tx,&input.record_id,&input.attachment_ids)?;
            let content_version=current.content_version+i64::from(!unchanged);
            if !unchanged {
                tx.execute("UPDATE records SET title=?1,record_date=CASE WHEN ?2='' THEN record_date ELSE ?2 END,pending_date=CASE WHEN ?2='' THEN '' ELSE NULL END,updated_at=?3,content_version=?4 WHERE id=?5",params![title,input.record_date,timestamp,content_version,input.record_id])?;
                if document_changed {
                    tx.execute("UPDATE records SET working_document=?1,working_text=?2 WHERE id=?3",params![serde_json::to_string(&input.document)?,text,input.record_id])?;
                }
                if old_tags!=tags {
                tx.execute("DELETE FROM record_tags WHERE record_id=?1",[&input.record_id])?;
                for tag in tags {tx.execute("INSERT INTO record_tags VALUES (?1,?2)",params![input.record_id,tag])?;}
                }
                if current.document!=input.document || current.title.as_deref()!=title {
                tx.execute("DELETE FROM record_search WHERE record_id=?1",[&input.record_id])?;
                tx.execute("INSERT INTO record_search(record_id,content) VALUES (?1,?2)",params![input.record_id,format!("{}\n{}",title.unwrap_or(""),text)])?;
                }
            }
            let result=SaveResult{record_id:input.record_id.clone(),revision_id:revision.clone(),content_version,request_id:input.request_id.clone(),session_id:input.session_id.clone(),edit_sequence:input.edit_sequence,saved_at:timestamp};
            // Only the newest request can be uncertain in this serialized editor pipeline.
            tx.execute("DELETE FROM record_save_receipts WHERE record_id=?1",[&input.record_id])?;
            tx.execute("DELETE FROM attachment_receipts WHERE record_id=?1",[&input.record_id])?;
            tx.execute("INSERT INTO record_save_receipts VALUES (?1,?2,?3,?4,?5)",params![input.request_id,input.record_id,revision,request_json,serde_json::to_string(&result)?])?;
            tx.execute("UPDATE edit_sessions SET saved_sequence=?1 WHERE record_id=?2 AND session_id=?3",params![input.edit_sequence,input.record_id,input.session_id])?;
            tx.execute("DELETE FROM recovery_drafts WHERE record_id=?1 AND session_id=?2 AND edit_sequence<=?3",params![input.record_id,input.session_id,input.edit_sequence])?;
            tx.commit()?; Ok(result)
        })
    }
}

pub fn export_document(input: &SaveRecord) -> StorageResult<String> {
    document_text(&input.document)?;
    if input.title.as_ref().is_some_and(|s| s.len() > 4096) {
        return Err(fail("validation", "标题过长"));
    }
    Ok(serde_json::to_string_pretty(input)?)
}
