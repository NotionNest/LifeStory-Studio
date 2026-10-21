use crate::{
    records::{Record, document_text, fail, id, identifier, load, now},
    recovery::EditingSession,
    storage::{DatabaseWorker, StorageResult},
};
use lifestory_image_validation::{MAX_BYTES, prepare};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub name: String,
    pub media_type: String,
    pub byte_length: i64,
    pub width: u32,
    pub height: u32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAttachment {
    pub editing: EditingSession,
    pub attachment_id: String,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AttachmentOperation {
    pub record_id: String,
    pub session_id: String,
    pub expected_content_version: i64,
    pub request_id: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportImage {
    pub operation: AttachmentOperation,
    pub name: String,
    pub document: Value,
}
pub(crate) fn list(db: &Connection, record_id: &str) -> StorageResult<Vec<Attachment>> {
    let mut stmt=db.prepare("SELECT l.id,l.original_name,o.media_type,o.byte_length,o.width,o.height FROM attachment_links l JOIN image_objects o ON o.id=l.object_id WHERE l.record_id=?1 AND l.in_body=1 AND o.state='ready' ORDER BY l.created_at,l.id")?;
    Ok(stmt
        .query_map(params![record_id], |r| {
            Ok(Attachment {
                id: r.get(0)?,
                name: r.get(1)?,
                media_type: r.get(2)?,
                byte_length: r.get(3)?,
                width: r.get(4)?,
                height: r.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?)
}
pub(crate) fn document_ids(document: &Value) -> StorageResult<Vec<String>> {
    fn walk(node: &Value, ids: &mut Vec<String>) -> StorageResult<()> {
        if node.get("type").and_then(Value::as_str) == Some("attachmentImage") {
            ids.push(
                node["attrs"]["attachmentId"]
                    .as_str()
                    .ok_or_else(|| fail("validation", "图片节点缺少附件身份"))?
                    .into(),
            );
        }
        if let Some(marks) = node.get("marks").and_then(Value::as_array) {
            for mark in marks {
                if mark["type"] == "attachmentReference" {
                    ids.push(
                        mark["attrs"]["attachmentId"]
                            .as_str()
                            .ok_or_else(|| fail("validation", "图片引用缺少附件身份"))?
                            .into(),
                    );
                }
            }
        }
        if let Some(children) = node.get("content").and_then(Value::as_array) {
            for child in children {
                walk(child, ids)?;
            }
        }
        Ok(())
    }
    let mut ids = vec![];
    walk(document, &mut ids)?;
    ids.sort();
    ids.dedup();
    Ok(ids)
}
pub(crate) fn validate_current(
    db: &Connection,
    record_id: &str,
    document: &Value,
    ids: &[String],
) -> StorageResult<()> {
    let actual = document_ids(document)?;
    let mut requested = ids.to_vec();
    requested.sort();
    requested.dedup();
    if requested != actual {
        return Err(fail("validation", "正文与图片关系不一致"));
    }
    for attachment in actual {
        if !db.query_row("SELECT EXISTS(SELECT 1 FROM attachment_links l JOIN image_objects o ON o.id=l.object_id WHERE l.record_id=?1 AND l.id=?2 AND o.state='ready')",params![record_id,attachment],|r|r.get::<_,bool>(0))? {
            return Err(fail("validation", "正文图片不属于本记录或已不可用"));
        }
    }
    Ok(())
}
pub(crate) fn link_snapshot(
    db: &Connection,
    record_id: &str,
    revision_id: &str,
    ids: &[String],
) -> StorageResult<()> {
    for attachment_id in ids {
        db.execute("INSERT INTO revision_attachments(record_id,revision_id,attachment_id) VALUES(?1,?2,?3)",params![record_id,revision_id,attachment_id])?;
    }
    Ok(())
}
fn lease(db: &Connection, input: &AttachmentOperation) -> StorageResult<Record> {
    identifier(&input.request_id)?;
    identifier(&input.record_id)?;
    identifier(&input.session_id)?;
    let record = load(db, &input.record_id)?;
    let active: Option<String> = db
        .query_row(
            "SELECT session_id FROM edit_sessions WHERE record_id=?1",
            [&input.record_id],
            |r| r.get(0),
        )
        .optional()?;
    if active.as_deref() != Some(&input.session_id)
        || record.content_version != input.expected_content_version
    {
        return Err(fail("conflict", "记录或编辑会话已变化，未修改附件"));
    }
    if db.query_row(
        "SELECT EXISTS(SELECT 1 FROM recovery_drafts WHERE record_id=?1)",
        [&input.record_id],
        |r| r.get::<_, bool>(0),
    )? {
        return Err(fail("conflict", "请先处理恢复草稿再修改附件"));
    }
    Ok(record)
}
fn replay(
    db: &Connection,
    input: &AttachmentOperation,
    key: &str,
) -> StorageResult<Option<EditingSession>> {
    let receipt:Option<(String,String)>=db.query_row("SELECT input_json,response_json FROM attachment_receipts WHERE record_id=?1 AND request_id=?2",params![input.record_id,input.request_id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
    let Some((old, response)) = receipt else {
        return Ok(None);
    };
    let session: EditingSession = serde_json::from_str(&response)?;
    let current = load(db, &input.record_id)?;
    let active: Option<String> = db
        .query_row(
            "SELECT session_id FROM edit_sessions WHERE record_id=?1",
            [&input.record_id],
            |r| r.get(0),
        )
        .optional()?;
    if old != key
        || current.content_version != session.record.content_version
        || current.revision_id != session.record.revision_id
        || active.as_deref() != Some(&session.session_id)
    {
        return Err(fail("conflict", "附件操作请求已过期，请重新核对当前内容"));
    }
    Ok(Some(session))
}
fn finish(
    db: &Connection,
    input: &AttachmentOperation,
    key: &str,
) -> StorageResult<EditingSession> {
    let session_id = id(db)?;
    db.execute(
        "UPDATE edit_sessions SET session_id=?1,saved_sequence=0 WHERE record_id=?2",
        params![session_id, input.record_id],
    )?;
    db.execute(
        "DELETE FROM record_save_receipts WHERE record_id=?1",
        [&input.record_id],
    )?;
    let session = EditingSession {
        record: load(db, &input.record_id)?,
        session_id,
        recovered: None,
        recovered_tags: vec![],
    };
    db.execute(
        "DELETE FROM attachment_receipts WHERE record_id=?1",
        [&input.record_id],
    )?;
    db.execute(
        "INSERT INTO attachment_receipts VALUES(?1,?2,?3,?4,?5)",
        params![
            input.record_id,
            input.request_id,
            session.record.revision_id,
            key,
            serde_json::to_string(&session)?
        ],
    )?;
    Ok(session)
}
fn objects(root: &Path) -> StorageResult<PathBuf> {
    let directory = root.join("objects");
    if !directory.exists() {
        fs::create_dir(&directory)?;
        sync_directory(root)?;
    }
    if !fs::symlink_metadata(&directory)?.is_dir() {
        return Err(fail("storage_permission", "图片目录不是受管理的本地目录"));
    }
    Ok(directory)
}
fn object_path(root: &Path, hash: &str, preview: bool) -> StorageResult<PathBuf> {
    if hash.len() != 64 || !hash.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(fail("corrupt_content", "图片对象身份无效"));
    }
    let path = objects(root)?.join(format!(
        "{hash}.{}",
        if preview { "preview.png" } else { "original" }
    ));
    if path.exists() && !fs::symlink_metadata(&path)?.is_file() {
        return Err(fail("storage_permission", "图片对象不是受管理文件"));
    }
    Ok(path)
}
fn sync_directory(path: &Path) -> StorageResult<()> {
    #[cfg(unix)]
    {
        fs::File::open(path)?.sync_all()?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}
fn publish_file(pending: &Path, path: &Path) -> StorageResult<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{MOVEFILE_WRITE_THROUGH, MoveFileExW};
        let from: Vec<u16> = pending.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        // Both UTF-16 buffers remain alive for this synchronous OS call.
        if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), MOVEFILE_WRITE_THROUGH) } == 0 {
            return Err(std::io::Error::last_os_error().into());
        }
    }
    #[cfg(not(windows))]
    {
        fs::rename(pending, path)?;
    }
    sync_directory(
        path.parent()
            .ok_or_else(|| fail("validation", "图片发布目录无效"))?,
    )?;
    Ok(())
}
fn read_bounded(path: &Path, limit: usize) -> StorageResult<Vec<u8>> {
    let mut file = fs::File::open(path)?;
    if file.metadata()?.len() > limit as u64 {
        return Err(fail("corrupt_content", "图片对象超过限制"));
    }
    let mut bytes = vec![];
    Read::by_ref(&mut file)
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(fail("corrupt_content", "图片对象超过限制"));
    }
    Ok(bytes)
}
fn write_object(root: &Path, hash: &str, preview: bool, bytes: &[u8]) -> StorageResult<()> {
    let path = object_path(root, hash, preview)?;
    if path.exists() {
        if read_bounded(&path, MAX_BYTES)? != bytes {
            return Err(fail(
                "corrupt_content",
                "同一图片对象的文件内容不一致，未覆盖原文件",
            ));
        }
        fs::OpenOptions::new().write(true).open(&path)?.sync_all()?;
        sync_directory(
            path.parent()
                .ok_or_else(|| fail("storage_permission", "图片对象目录无效"))?,
        )?;
        return Ok(());
    }
    let pending = objects(root)?.join(format!(
        "{hash}.{}.partial",
        if preview { "preview" } else { "original" }
    ));
    if pending.exists() {
        if !fs::symlink_metadata(&pending)?.is_file() {
            return Err(fail("storage_permission", "图片暂存文件无效"));
        }
        fs::remove_file(&pending)?;
    }
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&pending)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    publish_file(&pending, &path)?;
    Ok(())
}
pub(crate) fn restore_links(db: &Connection, record_id: &str, ids: &[String]) -> StorageResult<()> {
    for id in ids {
        if !db.query_row("SELECT EXISTS(SELECT 1 FROM attachment_links l JOIN image_objects o ON o.id=l.object_id WHERE l.record_id=?1 AND l.id=?2 AND o.state='ready')",params![record_id,id],|r|r.get::<_,bool>(0))? {return Err(fail("not_found","历史图片已不可用，未恢复任何内容"));}
    }
    db.execute(
        "UPDATE attachment_links SET in_body=0 WHERE record_id=?1",
        [record_id],
    )?;
    for id in ids {
        db.execute(
            "UPDATE attachment_links SET in_body=1 WHERE record_id=?1 AND id=?2",
            params![record_id, id],
        )?;
    }
    Ok(())
}
/// Upgrade legacy presentations without losing text or attachment-only images.
pub(crate) fn normalize_legacy(document: &mut Value, ids: &[String]) -> StorageResult<()> {
    fn strip(node: &mut Value) {
        if let Some(marks) = node.get_mut("marks").and_then(Value::as_array_mut) {
            marks.retain(|m| m["type"] != "attachmentReference");
            if marks.is_empty() {
                node.as_object_mut().unwrap().remove("marks");
            }
        }
        if let Some(children) = node.get_mut("content").and_then(Value::as_array_mut) {
            for child in children {
                strip(child);
            }
        }
    }
    strip(document);
    let existing = document_ids(document)?;
    let content = document
        .as_object_mut()
        .and_then(|o| o.get_mut("content"))
        .and_then(Value::as_array_mut)
        .ok_or_else(|| fail("corrupt_content", "旧图片记录正文无效"))?;
    for id in ids {
        if !existing.contains(id) {
            content.push(serde_json::json!({"type":"attachmentImage","attrs":{"attachmentId":id}}));
        }
    }
    Ok(())
}
pub(crate) fn migrate_inline(db: &Connection) -> StorageResult<()> {
    let records = {
        let mut stmt = db.prepare("SELECT id FROM records WHERE kind='text'")?;
        stmt.query_map([], |r| r.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?
    };
    for record_id in records {
        // load rejects trashed records, so read their documents through a temporary in-memory value instead.
        let (working, revision, title, date):(Option<String>,Option<String>,Option<String>,String)=db.query_row("SELECT working_document,current_revision_id,title,COALESCE(pending_date,record_date) FROM records WHERE id=?1",[&record_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))?;
        let json = match working {
            Some(s) => s,
            None => match &revision {
                Some(id) => db.query_row(
                    "SELECT document_json FROM record_revisions WHERE id=?1",
                    [id],
                    |r| r.get(0),
                )?,
                None => r#"{"type":"doc","content":[{"type":"paragraph"}]}"#.into(),
            },
        };
        let mut document: Value = serde_json::from_str(&json)?;
        let active: Vec<String> = list(db, &record_id)?.into_iter().map(|a| a.id).collect();
        normalize_legacy(&mut document, &active)?;
        let text = document_text(&document)?;
        db.execute(
            "UPDATE records SET working_document=?1,working_text=?2 WHERE id=?3",
            params![serde_json::to_string(&document)?, text, record_id],
        )?;
        db.execute("DELETE FROM record_search WHERE record_id=?1", [&record_id])?;
        db.execute(
            "INSERT INTO record_search(record_id,content) VALUES(?1,?2)",
            params![
                record_id,
                format!("{}\n{}", title.as_deref().unwrap_or(""), text)
            ],
        )?;
        let removed = {
            let mut stmt =
                db.prepare("SELECT id FROM attachment_links WHERE record_id=?1 AND in_body=0")?;
            stmt.query_map([&record_id], |r| r.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?
        };
        if !removed.is_empty() {
            let mut historical = document.clone();
            normalize_legacy(&mut historical, &removed)?;
            let ids = document_ids(&historical)?;
            let tags = {
                let mut stmt=db.prepare("SELECT t.id,t.display_name FROM tags t JOIN record_tags r ON r.tag_id=t.id WHERE r.record_id=?1")?;
                stmt.query_map([&record_id], |r| {
                    Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?}))
                })?
                .collect::<Result<Vec<_>, _>>()?
            };
            let checkpoint = id(db)?;
            let snapshot = serde_json::json!({"document":historical,"title":title,"recordDate":date,"tags":tags,"attachmentIds":ids});
            db.execute("INSERT INTO record_revisions(id,record_id,document_json,searchable_text,created_at,request_id,snapshot_json,checkpoint_kind) VALUES(?1,?2,?3,?4,?5,?6,?7,'editing_entry')",params![checkpoint,record_id,serde_json::to_string(&historical)?,document_text(&historical)?,now()?,format!("inline-upgrade:{checkpoint}"),serde_json::to_string(&snapshot)?])?;
            link_snapshot(db, &record_id, &checkpoint, &ids)?;
        }
    }
    let drafts = {
        let mut stmt = db.prepare("SELECT record_id,payload_json FROM recovery_drafts")?;
        stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<Result<Vec<_>, _>>()?
    };
    for (record_id, json) in drafts {
        let mut input: crate::records::SaveRecord = serde_json::from_str(&json)?;
        normalize_legacy(&mut input.document, &input.attachment_ids)?;
        db.execute(
            "UPDATE recovery_drafts SET payload_json=?1 WHERE record_id=?2",
            params![serde_json::to_string(&input)?, record_id],
        )?;
    }
    db.execute(
        "UPDATE attachment_links SET deleted_at=NULL,purge_at=NULL",
        [],
    )?;
    Ok(())
}
fn replace_pending(node: &mut Value, pending: &str, actual: &str) -> usize {
    let mut count = 0;
    if node["type"] == "attachmentImage" && node["attrs"]["attachmentId"] == pending {
        node["attrs"]["attachmentId"] = actual.into();
        count += 1;
    }
    if let Some(children) = node.get_mut("content").and_then(Value::as_array_mut) {
        for child in children {
            count += replace_pending(child, pending, actual);
        }
    }
    count
}
impl DatabaseWorker {
    pub fn cleanup_attachments(&self) -> StorageResult<()> {
        self.call(|db, root| cleanup(db, root, now()?))
    }
    pub fn import_image(
        &self,
        input: ImportImage,
        bytes: Vec<u8>,
    ) -> StorageResult<ImportedAttachment> {
        if bytes.len() > MAX_BYTES {
            return Err(fail("validation", "图片超过 25 MiB"));
        }
        self.call(move|db,root| {
            if input.name.is_empty()||input.name.chars().count()>255||input.name.chars().any(char::is_control)||input.name.contains(['/', '\\']){return Err(fail("validation","图片文件名无效"));}
            let hash=format!("{:x}",Sha256::digest(&bytes));
            let key=serde_json::to_string(&(&input,&hash))?;
            if let Some(editing)=replay(db,&input.operation,&key)? {
                let attachment_id=db.query_row("SELECT l.id FROM attachment_links l JOIN image_objects o ON o.id=l.object_id WHERE l.record_id=?1 AND o.sha256=?2",params![input.operation.record_id,hash],|r|r.get(0))?;
                return Ok(ImportedAttachment{editing,attachment_id});
            }
            lease(db,&input.operation)?;
            let prepared=prepare(&bytes).map_err(|message|fail("validation",&format!("无法导入图片：{message}")))?;
            // A committed staged row owns files across failures; only a later transaction exposes the link.
            let object=id(db)?;
            db.execute("INSERT INTO image_objects(id,sha256,relative_path,media_type,byte_length,width,height,state) VALUES(?1,?2,?3,?4,?5,?6,?7,'staged') ON CONFLICT(sha256) DO NOTHING",params![object,hash,format!("objects/{hash}.original"),prepared.media_type,bytes.len() as i64,prepared.width,prepared.height])?;
            let tx=db.transaction_with_behavior(TransactionBehavior::Immediate)?;lease(&tx,&input.operation)?;
            let object:String=tx.query_row("SELECT id FROM image_objects WHERE sha256=?1",[&hash],|r|r.get(0))?;
            write_object(root,&hash,false,&bytes)?;write_object(root,&hash,true,&prepared.preview)?;
            let existing:Option<(String,bool)>=tx.query_row("SELECT id,in_body FROM attachment_links WHERE record_id=?1 AND object_id=?2",params![input.operation.record_id,object],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
            let timestamp=now()?;
            tx.execute("UPDATE image_objects SET state='ready' WHERE id=?1",[&object])?;
            if existing.is_none() {let link=id(&tx)?;tx.execute("INSERT INTO attachment_links(id,record_id,object_id,original_name,created_at) VALUES(?1,?2,?3,?4,?5)",params![link,input.operation.record_id,object,input.name,timestamp])?;}
            let attachment_id:String=tx.query_row("SELECT id FROM attachment_links WHERE record_id=?1 AND object_id=?2",params![input.operation.record_id,object],|r|r.get(0))?;
            let mut document=input.document;
            if replace_pending(&mut document,&input.operation.request_id,&attachment_id)!=1 {return Err(fail("validation","图片插入位置无效"));}
            let text=document_text(&document)?;
            let ids=document_ids(&document)?;validate_current(&tx,&input.operation.record_id,&document,&ids)?;
            restore_links(&tx,&input.operation.record_id,&ids)?;
            tx.execute("UPDATE records SET working_document=?1,working_text=?2,content_version=content_version+1,updated_at=?3 WHERE id=?4",params![serde_json::to_string(&document)?,text,timestamp,input.operation.record_id])?;
            tx.execute("DELETE FROM record_search WHERE record_id=?1",[&input.operation.record_id])?;
            let current=load(&tx,&input.operation.record_id)?;
            tx.execute("INSERT INTO record_search(record_id,content) VALUES(?1,?2)",params![input.operation.record_id,format!("{}\n{}",current.title.as_deref().unwrap_or(""),text)])?;
            let editing=finish(&tx,&input.operation,&key)?;
            tx.commit()?;Ok(ImportedAttachment{editing,attachment_id})
        })
    }
    pub fn attachment_bytes(
        &self,
        record_id: String,
        attachment_id: String,
        revision_id: Option<String>,
        original: bool,
    ) -> StorageResult<Vec<u8>> {
        self.call(move|db,root| {
            load(db,&record_id)?;
            let hash:Option<String>=db.query_row("SELECT o.sha256 FROM attachment_links l JOIN image_objects o ON o.id=l.object_id WHERE l.record_id=?1 AND l.id=?2 AND o.state='ready' AND ((?3 IS NULL AND (l.in_body=1 OR EXISTS(SELECT 1 FROM revision_attachments h WHERE h.record_id=l.record_id AND h.attachment_id=l.id))) OR EXISTS(SELECT 1 FROM revision_attachments v WHERE v.record_id=?1 AND v.attachment_id=l.id AND v.revision_id=?3))",params![record_id,attachment_id,revision_id],|r|r.get(0)).optional()?;
            let hash=hash.ok_or_else(||fail("not_found","图片不属于当前记录或指定历史版本"))?;
            let bytes=read_bounded(&object_path(root,&hash,!original)?,MAX_BYTES)?;
            if original && format!("{:x}",Sha256::digest(&bytes))!=hash {return Err(fail("corrupt_content","原图校验失败，请保留资料并检查文件"));}Ok(bytes)
        })
    }
}
pub(crate) fn cleanup(db: &mut Connection, root: &Path, _timestamp: i64) -> StorageResult<()> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    tx.execute("DELETE FROM attachment_links AS l WHERE l.in_body=0 AND NOT EXISTS(SELECT 1 FROM revision_attachments v WHERE v.attachment_id=l.id) AND NOT EXISTS(SELECT 1 FROM message_attachments m WHERE m.attachment_id=l.id) AND NOT EXISTS(SELECT 1 FROM recovery_drafts d WHERE d.record_id=l.record_id AND instr(d.payload_json,l.id)>0)",[])?;
    tx.execute("UPDATE image_objects AS o SET state='pending_delete' WHERE NOT EXISTS(SELECT 1 FROM attachment_links l WHERE l.object_id=o.id)",[])?;
    let pending = {
        let mut stmt =
            tx.prepare("SELECT id,sha256 FROM image_objects WHERE state='pending_delete'")?;
        stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<Result<Vec<_>, _>>()?
    };
    tx.commit()?;
    for (object, hash) in pending {
        let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let unused:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM image_objects WHERE id=?1 AND state='pending_delete' AND NOT EXISTS(SELECT 1 FROM attachment_links WHERE object_id=?1))",[&object],|r|r.get(0))?;
        if !unused {
            continue;
        }
        for preview in [false, true] {
            let path = object_path(root, &hash, preview)?;
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.into()),
            }
        }
        for suffix in ["preview", "original"] {
            let path = objects(root)?.join(format!("{hash}.{suffix}.partial"));
            if path.exists() {
                if !fs::symlink_metadata(&path)?.is_file() {
                    return Err(fail("storage_permission", "暂存图片不是普通文件"));
                }
                fs::remove_file(path)?;
            }
        }
        tx.execute("DELETE FROM image_objects WHERE id=?1 AND state='pending_delete' AND NOT EXISTS(SELECT 1 FROM attachment_links WHERE object_id=?1)",[object])?;
        tx.commit()?;
    }
    Ok(())
}
