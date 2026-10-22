//! Chat is a separate domain. Generated text is a persisted proposal until explicitly adopted.
use crate::{
    ai::StartInput,
    records::{date, fail, id, identifier, now},
    storage::{DatabaseWorker, StorageResult},
};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewChat {
    pub record_date: String,
    pub timezone: String,
    pub linked_diary_id: Option<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewSpec {
    pub mode: String,
    pub target_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatSend {
    pub request_id: String,
    pub conversation_id: Option<String>,
    pub profile_id: String,
    pub text: String,
    pub source_ids: Vec<String>,
    pub record_date: String,
    pub timezone: String,
}
impl ChatSend {
    pub fn into_start(self) -> StartInput {
        let new_chat = self.conversation_id.is_none().then(|| NewChat {
            record_date: self.record_date,
            timezone: self.timezone,
            linked_diary_id: if self.source_ids.len() == 1 {
                self.source_ids.first().cloned()
            } else {
                None
            },
        });
        StartInput {
            request_id: self.request_id,
            record_id: self.conversation_id.unwrap_or_default(),
            profile_id: self.profile_id,
            kind: "chat".into(),
            text: self.text,
            source_ids: self.source_ids,
            new_chat,
            preview: None,
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewGenerate {
    pub request_id: String,
    pub record_id: String,
    pub profile_id: String,
    pub mode: String,
    pub target_id: Option<String>,
    pub source_ids: Vec<String>,
}
impl PreviewGenerate {
    pub fn into_start(self) -> StartInput {
        StartInput{request_id:self.request_id,record_id:self.record_id,profile_id:self.profile_id,kind:"draft".into(),text:"只输出可采用的日记正文，不输出解释或推理。只写用户明确讲述的事实、感受，不能将 AI 的话当作用户经历。".into(),source_ids:self.source_ids,new_chat:None,preview:Some(PreviewSpec{mode:self.mode,target_id:self.target_id})}
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatQuery {
    #[serde(default)]
    pub keyword: String,
    #[serde(default)]
    pub offset: u32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatItem {
    pub id: String,
    pub title: Option<String>,
    pub updated_at: i64,
    pub profile_id: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPage {
    pub items: Vec<ChatItem>,
    pub next_offset: Option<u32>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCheck {
    pub profile_id: String,
    pub tested_at: i64,
    pub text_streaming: bool,
    pub error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub default_profile_id: Option<String>,
    pub checks: Vec<ProviderCheck>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub task_id: String,
    pub text: String,
    pub title: String,
    pub record_date: String,
    pub mode: String,
    pub target_id: Option<String>,
    pub target_version: Option<i64>,
    pub target_text: Option<String>,
    pub adopted_id: Option<String>,
    pub can_undo: bool,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Adopt {
    pub task_id: String,
    pub request_id: String,
    pub title: String,
    pub record_date: String,
    pub text: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Adopted {
    pub record_id: String,
}
fn preview_range(db: &Connection, record: &str, spec: &PreviewSpec) -> StorageResult<(i64, i64)> {
    if !["create", "append", "rewrite"].contains(&spec.mode.as_str())
        || (spec.mode == "create") != spec.target_id.is_none()
    {
        return Err(fail("validation", "预览方式与目标日记不匹配"));
    }
    let kind: String = db
        .query_row(
            "SELECT kind FROM records WHERE id=?1 AND deleted_at IS NULL",
            [record],
            |r| r.get(0),
        )
        .optional()?
        .ok_or_else(|| fail("not_found", "对话已删除"))?;
    if kind != "conversation" {
        return Err(fail("validation", "请从聊天生成日记"));
    }
    let start = if spec.mode == "append" {
        db.query_row(
            "SELECT end_sequence FROM ai_adopted_ranges WHERE conversation_id=?1 AND diary_id=?2",
            params![record, spec.target_id],
            |r| r.get(0),
        )
        .optional()?
        .unwrap_or(-1)
    } else {
        -1
    };
    let end: i64 = db.query_row(
        "SELECT COALESCE(max(sequence),-1) FROM conversation_messages WHERE record_id=?1",
        [record],
        |r| r.get(0),
    )?;
    let count:i64=db.query_row("SELECT count(*) FROM conversation_messages WHERE record_id=?1 AND role='user' AND sequence>?2 AND sequence<=?3 AND EXISTS(SELECT 1 FROM json_tree(content_json) j WHERE j.key='text' AND j.type='text' AND trim(j.atom)<>'')",params![record,start,end],|r|r.get(0))?;
    if count == 0 {
        return Err(fail("validation", "没有尚可整理的用户讲述，请先继续聊天"));
    }
    Ok((start, end))
}
pub(crate) fn preview_prompt(
    db: &Connection,
    record: &str,
    spec: &PreviewSpec,
) -> StorageResult<String> {
    let (start, end) = preview_range(db, record, spec)?;
    let mut stmt=db.prepare("SELECT content_json FROM conversation_messages WHERE record_id=?1 AND role='user' AND sequence>?2 AND sequence<=?3 ORDER BY sequence")?;
    let lines = stmt
        .query_map(params![record, start, end], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    let mut text = vec![];
    for raw in lines {
        let v: Value = serde_json::from_str(&raw)?;
        let s = crate::ai::message_text(&v);
        if !s.trim().is_empty() {
            text.push(s)
        }
    }
    Ok(format!(
        "{}\n以下是用户实际讲述：\n{}",
        match spec.mode.as_str() {
            "append" => "仅整理这些新增讲述为文末补充段落，不重复日记原文，不改写原有内容。",
            "rewrite" => "结合目标日记与用户讲述重新整理全文，保留明确事实。",
            _ => "把用户讲述整理成一篇日记。",
        },
        text.join("\n")
    ))
}
pub(crate) fn insert_preview(
    db: &Connection,
    task: &str,
    record: &str,
    spec: &PreviewSpec,
) -> StorageResult<()> {
    let (start, end) = preview_range(db, record, spec)?;
    let (title, day): (Option<String>, String) = db.query_row(
        "SELECT title,record_date FROM records WHERE id=?1",
        [record],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let (version, title, day, target_text) = if let Some(target) = &spec.target_id {
        identifier(target)?;
        let r = crate::records::load(db, target)?;
        (
            Some(r.content_version),
            r.title.unwrap_or_default(),
            r.record_date,
            Some(crate::records::document_text(&r.document)?),
        )
    } else {
        (None, title.unwrap_or_else(|| "新的日记".into()), day, None)
    };
    db.execute("INSERT INTO ai_previews(task_id,mode,target_id,target_version,end_sequence,start_sequence,title,record_date,target_text) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![task,spec.mode,spec.target_id,version,end,start,title,day,target_text])?;
    Ok(())
}
type AdoptionRow = (
    String,
    Option<String>,
    Option<i64>,
    i64,
    i64,
    Option<String>,
    Option<String>,
    String,
    String,
);
fn paragraphs(text: &str) -> Vec<Value> {
    text.lines()
        .map(|line| {
            if line.is_empty() {
                json!({"type":"paragraph"})
            } else {
                json!({"type":"paragraph","content":[{"type":"text","text":line}]})
            }
        })
        .collect()
}
fn image_nodes(node: &Value, out: &mut Vec<Value>) {
    if matches!(
        node.get("type").and_then(Value::as_str),
        Some("image" | "attachmentImage")
    ) {
        out.push(node.clone());
        return;
    }
    if let Some(a) = node.get("content").and_then(Value::as_array) {
        for child in a {
            image_nodes(child, out)
        }
    }
}
impl DatabaseWorker {
    pub fn ai_preferences(&self) -> StorageResult<Preferences> {
        self.call(|db, _| {
            let default_profile_id = db.query_row(
                "SELECT default_profile_id FROM ai_preferences WHERE id=1",
                [],
                |r| r.get(0),
            )?;
            let mut stmt = db.prepare(
                "SELECT profile_id,tested_at,text_streaming,error FROM ai_provider_checks",
            )?;
            let checks = stmt
                .query_map([], |r| {
                    Ok(ProviderCheck {
                        profile_id: r.get(0)?,
                        tested_at: r.get(1)?,
                        text_streaming: r.get(2)?,
                        error: r.get(3)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Preferences {
                default_profile_id,
                checks,
            })
        })
    }
    pub fn ai_set_default(&self, profile: Option<String>) -> StorageResult<()> {
        self.call(move|db,_|{if let Some(id)=&profile{identifier(id)?;let active:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM ai_profiles WHERE id=?1 AND json_extract(profile_json,'$.label') NOT LIKE '[已停用]%')",[id],|r|r.get(0))?;if !active{return Err(fail("not_found","服务不存在或已停用"))}}db.execute("UPDATE ai_preferences SET default_profile_id=?1 WHERE id=1",[profile])?;Ok(())})
    }
    pub fn ai_chat_list(&self, input: ChatQuery) -> StorageResult<ChatPage> {
        if input.keyword.chars().count() > 200 {
            return Err(fail("validation", "搜索词过长"));
        }
        self.call(move|db,_|{let mut stmt=db.prepare("SELECT r.id,r.title,r.updated_at,c.profile_id FROM records r LEFT JOIN ai_conversations c ON c.record_id=r.id WHERE r.kind='conversation' AND r.deleted_at IS NULL AND (?1='' OR instr(lower(COALESCE(r.title,'')),lower(?1))>0 OR EXISTS(SELECT 1 FROM conversation_messages m WHERE m.record_id=r.id AND EXISTS(SELECT 1 FROM json_tree(m.content_json) j WHERE j.key='text' AND j.type='text' AND instr(lower(j.atom),lower(?1))>0))) ORDER BY r.updated_at DESC,r.id LIMIT 101 OFFSET ?2")?;let mut items=stmt.query_map(params![input.keyword.trim(),input.offset],|r|Ok(ChatItem{id:r.get(0)?,title:r.get(1)?,updated_at:r.get(2)?,profile_id:r.get(3)?}))?.collect::<Result<Vec<_>,_>>()?;let next_offset=if items.len()>100{items.pop();Some(input.offset.saturating_add(100))}else{None};Ok(ChatPage{items,next_offset})})
    }
    pub fn ai_chat_rename(&self, record: String, title: String) -> StorageResult<()> {
        identifier(&record)?;
        let title = title.trim().to_owned();
        if title.is_empty() || title.chars().count() > 240 || title.contains(['\n', '\r']) {
            return Err(fail("validation", "标题须为 1～240 字单行文字"));
        }
        self.call(move|db,_|{let n=db.execute("UPDATE records SET title=?2,updated_at=?3,content_version=content_version+1 WHERE id=?1 AND kind='conversation' AND deleted_at IS NULL",params![record,title,now()?])?;if n!=1{return Err(fail("not_found","对话不存在或已删除"))}Ok(())})
    }
    pub fn ai_preview(&self, task_id: String) -> StorageResult<Preview> {
        identifier(&task_id)?;
        self.call(move|db,_|{db.query_row("SELECT p.task_id,p.text,p.title,p.record_date,p.mode,p.target_id,p.target_version,p.adopted_id,p.target_text,COALESCE((p.adopted_version=(SELECT r.content_version FROM records r WHERE r.id=p.adopted_id AND r.deleted_at IS NULL) AND p.undone=0 AND p.mode<>'create'),0) FROM ai_previews p JOIN ai_tasks t ON t.id=p.task_id JOIN records r ON r.id=t.record_id WHERE p.task_id=?1 AND t.status='completed' AND r.deleted_at IS NULL",[task_id],|r|Ok(Preview{task_id:r.get(0)?,text:r.get(1)?,title:r.get(2)?,record_date:r.get(3)?,mode:r.get(4)?,target_id:r.get(5)?,target_version:r.get(6)?,adopted_id:r.get(7)?,target_text:r.get(8)?,can_undo:r.get(9)?})).optional()?.ok_or_else(||fail("not_found","完整预览尚不可用，或来源已删除"))})
    }
    pub fn ai_adopt(&self, input: Adopt) -> StorageResult<Adopted> {
        identifier(&input.task_id)?;
        identifier(&input.request_id)?;
        date(&input.record_date)?;
        if input.title.chars().count() > 240
            || input.title.contains(['\n', '\r'])
            || input.text.trim().is_empty()
            || input.text.chars().count() > 200_000
        {
            return Err(fail("validation", "日记标题或正文无效"));
        }
        self.call(move|db,_|{
 let tx=db.transaction_with_behavior(TransactionBehavior::Immediate)?;let request=serde_json::to_string(&input)?;
 let(mode,target,version,end,start,adopted,adopted_json,conversation,status):AdoptionRow=tx.query_row("SELECT p.mode,p.target_id,p.target_version,p.end_sequence,p.start_sequence,p.adopted_id,p.adopted_json,t.record_id,t.status FROM ai_previews p JOIN ai_tasks t ON t.id=p.task_id JOIN records r ON r.id=t.record_id WHERE p.task_id=?1 AND r.deleted_at IS NULL",[&input.task_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?,r.get(8)?))).optional()?.ok_or_else(||fail("not_found","预览不存在或对话已删除"))?;
 if let Some(record_id)=adopted{let previous:Option<Adopt>=adopted_json.as_deref().map(serde_json::from_str).transpose()?;if !previous.is_some_and(|p|p.title==input.title&&p.record_date==input.record_date&&p.text==input.text){return Err(fail("conflict","这份预览已采用，不能再次写入；请生成新的预览"))}return Ok(Adopted{record_id})}
 if adopted_json.is_some() || tx.query_row("SELECT adopted_request IS NOT NULL FROM ai_previews WHERE task_id=?1",[&input.task_id],|r|r.get::<_,bool>(0))? {return Err(fail("not_found","此预览已经采用，其日记已删除；不会重复创建"))}
 if status!="completed"{return Err(fail("conflict","任务尚未完成或已失效，不能采用"))}
 let blocked:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM ai_task_sources s JOIN records r ON r.id=s.source_id WHERE s.task_id=?1 AND (r.deleted_at IS NOT NULL OR EXISTS(SELECT 1 FROM ai_source_blocks b WHERE b.source_id=r.id))) OR EXISTS(SELECT 1 FROM ai_source_blocks WHERE source_id=?2)",params![input.task_id,conversation],|r|r.get(0))?;if blocked{return Err(fail("conflict","来源正删除或已不可用"))}
 let record_id=if mode=="create" {
  let record=id(&tx)?;let rev=id(&tx)?;let timestamp=now()?;let timezone:String=tx.query_row("SELECT created_timezone FROM records WHERE id=?1",[&conversation],|r|r.get(0))?;let document=json!({"type":"doc","content":paragraphs(&input.text)});
  tx.execute("INSERT INTO records(id,kind,title,record_date,created_timezone,created_at,updated_at,current_revision_id) VALUES(?1,'text',?2,?3,?4,?5,?5,?6)",params![record,input.title.trim(),input.record_date,timezone,timestamp,rev])?;
  tx.execute("INSERT INTO record_revisions(id,record_id,document_json,searchable_text,created_at,request_id) VALUES(?1,?2,?3,?4,?5,?6)",params![rev,record,document.to_string(),input.text,timestamp,format!("adopt:{}",input.task_id)])?;record
 }else{
  let target=target.ok_or_else(||fail("not_found","关联日记已删除"))?;let current=crate::records::load(&tx,&target)?;
  if Some(current.content_version)!=version{return Err(fail("conflict","日记在生成预览后已修改，请重新核对并生成预览；未覆盖新内容"))}
  if mode=="append" {let adopted:i64=tx.query_row("SELECT end_sequence FROM ai_adopted_ranges WHERE conversation_id=?1 AND diary_id=?2",params![conversation,target],|r|r.get(0)).optional()?.unwrap_or(-1);if adopted>start{return Err(fail("conflict","这段讲述已采用，请重新生成新增内容"))}}
  let previous_watermark:i64=tx.query_row("SELECT end_sequence FROM ai_adopted_ranges WHERE conversation_id=?1 AND diary_id=?2",params![conversation,target],|r|r.get(0)).optional()?.unwrap_or(-1);
  tx.execute("UPDATE ai_previews SET before_snapshot_json=?2,adopted_version=?3,previous_watermark=?4 WHERE task_id=?1",params![input.task_id,serde_json::to_string(&current)?,current.content_version+1,previous_watermark])?;
  crate::recovery::checkpoint_on_entry(&tx,&current)?;
  let mut nodes=if mode=="append"{current.document.get("content").and_then(Value::as_array).cloned().unwrap_or_default()}else{vec![]};if mode=="append"{nodes.extend(paragraphs(&input.text));}else{let mut replacement=paragraphs(&input.text).into_iter();if let Some(original)=current.document.get("content").and_then(Value::as_array){for block in original{let mut images=vec![];image_nodes(block,&mut images);if images.is_empty(){if let Some(next)=replacement.next(){nodes.push(next)}}else{nodes.extend(images)}}}nodes.extend(replacement);}let document=json!({"type":"doc","content":nodes});let text=crate::records::document_text(&document)?;
  tx.execute("UPDATE records SET title=?2,record_date=?3,pending_date=NULL,working_document=?4,working_text=?5,content_version=content_version+1,updated_at=?6 WHERE id=?1",params![target,input.title.trim(),input.record_date,document.to_string(),text,now()?])?;
  // The editor's version guard rejects stale autosaves; retained checkpoints allow restoration.
  target
 };
 tx.execute("UPDATE ai_previews SET title=?2,record_date=?3,text=?4,adopted_id=?5,adopted_request=?6,adopted_json=?7 WHERE task_id=?1",params![input.task_id,input.title.trim(),input.record_date,input.text,record_id,input.request_id,request])?;
 tx.execute("UPDATE ai_conversations SET linked_diary_id=?2,adopted_sequence=?3 WHERE record_id=?1",params![conversation,record_id,end])?;
 tx.execute("INSERT INTO ai_adopted_ranges VALUES(?1,?2,?3) ON CONFLICT(conversation_id,diary_id) DO UPDATE SET end_sequence=max(end_sequence,excluded.end_sequence)",params![conversation,record_id,end])?;
 let mut stmt=tx.prepare("SELECT source_id,revision_id FROM ai_task_sources WHERE task_id=?1")?;let sources=stmt.query_map([&input.task_id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?)))?.collect::<Result<Vec<_>,_>>()?;drop(stmt);for(source,revision)in sources {if source!=record_id{tx.execute("INSERT INTO record_relations(id,owner_id,source_id,source_revision_id,relation_kind) VALUES(?1,?2,?3,?4,'draft_source')",params![id(&tx)?,record_id,source,revision])?;}}
 tx.commit()?;Ok(Adopted{record_id})
 })
    }
}

impl DatabaseWorker {
    /// Editing creates an immutable profile revision. Existing task provenance is unchanged.
    pub fn ai_update_profile(
        &self,
        mut profile: crate::ai_providers::Profile,
        key: String,
    ) -> StorageResult<crate::ai_providers::Profile> {
        crate::ai_providers::validate(&profile).map_err(|e| fail("validation", &e))?;
        let old = profile.id.clone();
        identifier(&old)?;
        if profile.protocol != "codex" && key.trim().is_empty() {
            return Err(fail(
                "validation",
                "修改服务配置须重新输入凭据；不会自动复用旧目的地的密钥",
            ));
        }
        self.call(move|db,_|{
 let tx=db.transaction_with_behavior(TransactionBehavior::Immediate)?;
 let raw:String=tx.query_row("SELECT profile_json FROM ai_profiles WHERE id=?1",[&old],|r|r.get(0)).optional()?.ok_or_else(||fail("not_found","服务配置不存在"))?;let previous:crate::ai_providers::Profile=serde_json::from_str(&raw)?;
 if previous.label.starts_with("[已停用]"){return Err(fail("conflict","该配置已停用，请添加新服务"))}
 let running:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM ai_tasks WHERE profile_id=?1 AND status='running')",[&old],|r|r.get(0))?;if running{return Err(fail("conflict","请先完成或取消该服务的任务，再修改配置"))}
 profile.id=id(&tx)?;if profile.protocol!="codex"{crate::ai_providers::store_key(&profile.id,&key).map_err(|e|fail("credential_error",&e))?;}
 let saved=(||->StorageResult<()>{tx.execute("INSERT INTO ai_profiles VALUES(?1,?2,?3)",params![profile.id,serde_json::to_string(&profile)?,now()?])?;tx.execute("UPDATE ai_profiles SET profile_json=json_set(profile_json,'$.label',?2) WHERE id=?1",params![old,format!("[已停用] {}",previous.label)])?;tx.execute("UPDATE ai_preferences SET default_profile_id=?2 WHERE default_profile_id=?1",params![old,profile.id])?;tx.commit()?;Ok(())})();
 if let Err(e)=saved{if profile.protocol!="codex"{let _=crate::ai_providers::delete_key(&profile.id);}return Err(e)}
 if previous.protocol!="codex"{crate::ai_providers::delete_key(&old).map_err(|_|fail("credential_error","新配置已保存并替换旧配置，但旧凭据未能清理，请在系统凭据库中核对清理"))?;}Ok(profile)
 })
    }
}

pub(crate) fn request_hash(request: &str) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(request.as_bytes()))
}
impl DatabaseWorker {
    pub fn ai_undo_adoption(&self, task_id: String) -> StorageResult<Adopted> {
        identifier(&task_id)?;
        self.call(move|db,_|{
 let tx=db.transaction_with_behavior(TransactionBehavior::Immediate)?;
 let(mode,diary,version,snapshot,previous,undone,conversation):(String,Option<String>,Option<i64>,Option<String>,i64,bool,String)=tx.query_row("SELECT p.mode,p.adopted_id,p.adopted_version,p.before_snapshot_json,p.previous_watermark,p.undone,t.record_id FROM ai_previews p JOIN ai_tasks t ON t.id=p.task_id WHERE p.task_id=?1",[&task_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?))).optional()?.ok_or_else(||fail("not_found","采用记录不存在"))?;
 let diary=diary.ok_or_else(||fail("validation","尚未采用预览"))?;if undone{return Ok(Adopted{record_id:diary})}
 if mode=="create"{return Err(fail("validation","新建日记请通过日记回收站管理"))}
 let current=crate::records::load(&tx,&diary)?;if version!=Some(current.content_version){return Err(fail("conflict","日记已有后续修改，不能撤销覆盖；可在版本历史中核对恢复"))}
 let blocked:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM ai_source_blocks WHERE source_id=?1)",[&diary],|r|r.get(0))?;if blocked{return Err(fail("conflict","日记正移入回收站，请稍后核对"))}
 let before:crate::records::Record=serde_json::from_str(&snapshot.ok_or_else(||fail("not_found","撤销快照已不可用"))?)?;
 crate::recovery::checkpoint_on_entry(&tx,&current)?;
 let ids=before.attachments.iter().map(|a|a.id.clone()).collect::<Vec<_>>();crate::attachments::restore_links(&tx,&diary,&ids)?;
 tx.execute("UPDATE records SET title=?2,record_date=?3,pending_date=NULL,working_document=?4,working_text=?5,content_version=content_version+1,updated_at=?6 WHERE id=?1",params![diary,before.title,before.record_date,before.document.to_string(),crate::records::document_text(&before.document)?,now()?])?;
 tx.execute("DELETE FROM record_tags WHERE record_id=?1",[&diary])?;for tag in before.tags {tx.execute("INSERT INTO record_tags VALUES(?1,?2)",params![diary,tag.id])?;}
 tx.execute("UPDATE ai_previews SET undone=1 WHERE task_id=?1",[&task_id])?;
 if previous<0{tx.execute("DELETE FROM ai_adopted_ranges WHERE conversation_id=?1 AND diary_id=?2",params![conversation,diary])?;}else{tx.execute("UPDATE ai_adopted_ranges SET end_sequence=?3 WHERE conversation_id=?1 AND diary_id=?2",params![conversation,diary,previous])?;}
 tx.execute("UPDATE ai_conversations SET adopted_sequence=?3 WHERE record_id=?1 AND linked_diary_id=?2",params![conversation,diary,previous])?;
 tx.commit()?;Ok(Adopted{record_id:diary})
 })
    }
}
