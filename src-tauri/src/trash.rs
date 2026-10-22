use crate::{
    records::{fail, identifier, now},
    storage::{DatabaseWorker, StorageResult},
};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::path::Path;
pub const RETENTION_MS: i64 = 30 * 24 * 60 * 60 * 1000;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub id: String,
    pub title: Option<String>,
    pub kind: String,
    pub record_date: String,
    pub deleted_at: i64,
    pub purge_at: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Impact {
    pub record_id: String,
    pub title: Option<String>,
    pub content_version: i64,
    pub references: Vec<Reference>,
    pub impact_token: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reference {
    pub id: String,
    pub title: Option<String>,
    pub kind: String,
}
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrashRequest {
    pub record_id: String,
    pub expected_content_version: i64,
    pub expected_impact: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashPage {
    pub items: Vec<TrashItem>,
    pub next_offset: Option<u32>,
    pub cleanup_error: Option<String>,
}
fn impact_token(db: &Connection, id: &str) -> StorageResult<String> {
    let mut stmt=db.prepare("SELECT x.id,r.id,r.title,r.kind FROM record_relations x JOIN records r ON r.id=x.owner_id WHERE x.source_id=?1 UNION ALL SELECT 'task:'||t.id,r.id,r.title,r.kind FROM ai_task_sources x JOIN ai_tasks t ON t.id=x.task_id JOIN records r ON r.id=t.record_id WHERE x.source_id=?1 ORDER BY 1")?;
    let rows = stmt
        .query_map([id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, String>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    use sha2::{Digest, Sha256};
    Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(&rows)?)))
}
fn purge_record(db: &Connection, id: &str) -> StorageResult<()> {
    crate::ai::invalidate_source(db, id)?;
    db.execute("UPDATE record_relations SET unavailable_source_id=source_id,source_id=NULL,source_revision_id=NULL,source_deleted=1 WHERE source_id=?1",[id])?;
    // Remove reverse references before versions/links: some legacy foreign keys do not cascade.
    db.execute("DELETE FROM record_relations WHERE owner_id=?1", [id])?;
    db.execute("DELETE FROM recovery_drafts WHERE record_id=?1", [id])?;
    db.execute("DELETE FROM revision_attachments WHERE record_id=?1", [id])?;
    db.execute("DELETE FROM message_attachments WHERE record_id=?1", [id])?;
    db.execute(
        "UPDATE records SET current_revision_id=NULL WHERE id=?1",
        [id],
    )?;
    db.execute("DELETE FROM record_search WHERE record_id=?1", [id])?;
    db.execute("DELETE FROM records WHERE id=?1", [id])?;
    Ok(())
}
pub(crate) fn cleanup(db: &mut Connection, root: &Path, time: i64) -> StorageResult<()> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let ids = {
        let mut stmt=tx.prepare("SELECT id FROM records WHERE deleted_at IS NOT NULL AND purge_at<=?1 ORDER BY purge_at,id")?;
        stmt.query_map([time], |r| r.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?
    };
    for id in ids {
        purge_record(&tx, &id)?;
    }
    tx.commit()?;
    crate::attachments::cleanup(db, root, time)
}
impl DatabaseWorker {
    pub fn trash_fence(
        &self,
        mut input: TrashRequest,
    ) -> StorageResult<(TrashRequest, Vec<String>)> {
        identifier(&input.record_id)?;
        self.call(move|db,_|{
        let tx=db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let version:Option<i64>=tx.query_row("SELECT content_version FROM records WHERE id=?1 AND deleted_at IS NULL",[&input.record_id],|r|r.get(0)).optional()?;
        if version!=Some(input.expected_content_version)||impact_token(&tx,&input.record_id)?!=input.expected_impact{return Err(fail("conflict","内容或引用影响已变化，请重新核对删除影响"))}
        let tasks={let mut stmt=tx.prepare("SELECT id FROM ai_tasks WHERE record_id=?1 OR id IN(SELECT task_id FROM ai_task_sources WHERE source_id=?1)")?;stmt.query_map([&input.record_id],|r|r.get::<_,String>(0))?.collect::<Result<Vec<_>,_>>()?};
        tx.execute("INSERT OR IGNORE INTO ai_source_blocks VALUES(?1)",[&input.record_id])?;
        crate::ai::invalidate_source(&tx,&input.record_id)?;
        input.expected_impact=impact_token(&tx,&input.record_id)?;
        tx.commit()?;Ok((input,tasks))
    })
    }

    pub fn trash_status(&self, id: String) -> StorageResult<String> {
        identifier(&id)?;
        self.call(move |db, _| {
            let deleted = db
                .query_row("SELECT deleted_at FROM records WHERE id=?1", [id], |r| {
                    r.get::<_, Option<i64>>(0)
                })
                .optional()?;
            Ok(match deleted {
                None => "missing",
                Some(None) => "active",
                Some(Some(_)) => "trash",
            }
            .into())
        })
    }

    pub fn trash_impact(&self, id: String) -> StorageResult<Impact> {
        identifier(&id)?;
        self.call(move|db,_|{
  let tx=db.transaction()?;
  let (title,content_version)=tx.query_row("SELECT title,content_version FROM records WHERE id=?1 AND deleted_at IS NULL",[&id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?.ok_or_else(||fail("not_found","记录不存在或已移入回收站"))?;
  let mut stmt=tx.prepare("SELECT DISTINCT r.id,r.title,r.kind FROM record_relations x JOIN records r ON r.id=x.owner_id WHERE x.source_id=?1 UNION SELECT r.id,r.title,r.kind FROM ai_task_sources x JOIN ai_tasks t ON t.id=x.task_id JOIN records r ON r.id=t.record_id WHERE x.source_id=?1 ORDER BY 1")?;
  let references=stmt.query_map([&id],|r|Ok(Reference{id:r.get(0)?,title:r.get(1)?,kind:r.get(2)?}))?.collect::<Result<Vec<_>,_>>()?;
  let impact_token=impact_token(&tx,&id)?;
  Ok(Impact{record_id:id,title,content_version,references,impact_token})
 })
    }
    pub fn trash_move(&self, input: TrashRequest) -> StorageResult<()> {
        identifier(&input.record_id)?;
        self.call(move|db,_|{
  let tx=db.transaction_with_behavior(TransactionBehavior::Immediate)?;let time:i64=tx.query_row("SELECT max(?1,updated_at+1) FROM records WHERE id=?2",params![now()?,input.record_id],|r|r.get(0)).optional()?.ok_or_else(||fail("not_found","记录不存在"))?;
  if impact_token(&tx,&input.record_id)?!=input.expected_impact{return Err(fail("conflict","引用影响已变化，请重新核对后删除"));}
  let changed=tx.execute("UPDATE records SET deleted_at=?1,purge_at=?2,content_version=content_version+1,updated_at=?1 WHERE id=?3 AND deleted_at IS NULL AND content_version=?4",params![time,time+RETENTION_MS,input.record_id,input.expected_content_version])?;
  if changed!=1{return Err(fail("conflict","内容或删除状态已变化，请重新核对删除影响"));}
  crate::ai::invalidate_source(&tx,&input.record_id)?;
  tx.execute("DELETE FROM ai_source_blocks WHERE source_id=?1",[&input.record_id])?;
  tx.execute("DELETE FROM edit_sessions WHERE record_id=?1",[&input.record_id])?;
  // An old uncertain save/import/restore cannot replay a stale success after deletion.
  for table in ["record_save_receipts","history_restore_receipts","attachment_receipts"]{tx.execute(&format!("DELETE FROM {table} WHERE record_id=?1"),[&input.record_id])?;}
  tx.commit()?;Ok(())
 })
    }
    pub fn trash_list(&self, offset: u32) -> StorageResult<TrashPage> {
        self.trash_list_domain(offset, "diary".into())
    }
    pub fn trash_list_domain(&self, offset: u32, domain: String) -> StorageResult<TrashPage> {
        if !["diary", "chat"].contains(&domain.as_str()) {
            return Err(fail("validation", "回收站领域无效"));
        }
        self.call(move|db,root|{
  let cleanup_error=cleanup(db,root,now()?).err().map(|_|"清理尚未完成，部分记录或图片仍待处理，请刷新重试。待清理图片保留重试状态。".to_owned());
  let mut stmt=db.prepare("SELECT id,title,kind,record_date,deleted_at,purge_at FROM records WHERE deleted_at IS NOT NULL AND kind=CASE WHEN ?2='chat' THEN 'conversation' ELSE 'text' END ORDER BY deleted_at DESC,id LIMIT 101 OFFSET ?1")?;
  let mut items=stmt.query_map(params![offset,domain],|r|Ok(TrashItem{id:r.get(0)?,title:r.get(1)?,kind:r.get(2)?,record_date:r.get(3)?,deleted_at:r.get(4)?,purge_at:r.get(5)?}))?.collect::<Result<Vec<_>,_>>()?;
  let next_offset=if items.len()>100{items.pop();Some(offset.saturating_add(100))}else{None};Ok(TrashPage{items,next_offset,cleanup_error})
 })
    }
    pub fn trash_restore(&self, id: String, deleted_at: i64) -> StorageResult<()> {
        identifier(&id)?;
        self.call(move|db,_|{
  let tx=db.transaction_with_behavior(TransactionBehavior::Immediate)?;
  let count=tx.execute("UPDATE records SET deleted_at=NULL,purge_at=NULL,content_version=content_version+1,updated_at=max(?1,updated_at+1) WHERE id=?2 AND deleted_at IS NOT NULL AND purge_at>?1 AND deleted_at=?3",params![now()?,id,deleted_at])?;
  if count!=1{return Err(fail("conflict","记录已到期、已清理或已恢复，请刷新回收站"));}
  tx.execute("DELETE FROM edit_sessions WHERE record_id=?1",[&id])?;tx.commit()?;Ok(())
 })
    }
    pub fn trash_purge(&self, id: String, deleted_at: i64) -> StorageResult<()> {
        identifier(&id)?;
        self.call(move |db, root| {
            let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM records WHERE id=?1 AND deleted_at=?2)",
                params![id, deleted_at],
                |r| r.get(0),
            )?;
            if exists {
                purge_record(&tx, &id)?;
            } else {
                let active: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM records WHERE id=?1)",
                    [&id],
                    |r| r.get(0),
                )?;
                if active {
                    return Err(fail("conflict", "记录已恢复，不能在回收站彻底删除"));
                }
            }
            tx.commit()?;
            crate::attachments::cleanup(db, root, now()?).map_err(|_| {
                fail(
                    "cleanup_pending",
                    "记录内容已清除，但图片清理尚未完成；请刷新回收站重试",
                )
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn expiry_uses_the_exact_absolute_deadline() {
        let root = std::env::temp_dir().join(format!("trash-boundary-{}", std::process::id()));
        let worker = DatabaseWorker::start(root.clone()).unwrap();
        worker
            .create_record(crate::records::CreateRecord {
                request_id: "boundary".into(),
                record_date: "2026-10-21".into(),
                created_timezone: "Asia/Shanghai".into(),
            })
            .unwrap();
        drop(worker);
        let mut db = Connection::open(root.join("lifestory.db")).unwrap();
        db.pragma_update(None, "foreign_keys", "ON").unwrap();
        db.execute(
            "UPDATE records SET deleted_at=100,purge_at=?1 WHERE id='boundary'",
            [100 + RETENTION_MS],
        )
        .unwrap();
        cleanup(&mut db, &root, 99 + RETENTION_MS).unwrap();
        assert_eq!(
            db.query_row("SELECT count(*) FROM records", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        cleanup(&mut db, &root, 100 + RETENTION_MS).unwrap();
        assert_eq!(
            db.query_row("SELECT count(*) FROM records", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        drop(db);
        std::fs::remove_dir_all(root).unwrap();
    }
}
