use crate::{
    records::{Tag, document_text, fail, id, identifier, load, now},
    recovery::{EditingSession, checkpoint_on_entry},
    storage::{DatabaseWorker, StorageResult},
};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const HISTORY_RETENTION_MS: i64 = 90 * 24 * 60 * 60 * 1000;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySummary {
    pub id: String,
    pub created_at: i64,
    pub important: bool,
    pub referenced: bool,
    pub current_checkpoint: bool,
    pub restorable: bool,
    pub restored_from_id: Option<String>,
    pub excerpt: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub document: Value,
    pub title: Option<String>,
    pub record_date: String,
    pub tags: Vec<Tag>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryVersion {
    pub summary: HistorySummary,
    pub document: Value,
    pub snapshot: Option<Snapshot>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub items: Vec<HistorySummary>,
    pub next_before: Option<HistoryCursor>,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HistoryCursor {
    pub created_at: i64,
    pub id: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestoreHistory {
    pub record_id: String,
    pub revision_id: String,
    pub expected_content_version: i64,
    pub session_id: String,
    pub request_id: String,
}
const SUMMARY_COLUMNS: &str = "v.id,v.created_at,v.important,
    (EXISTS(SELECT 1 FROM revision_pins p WHERE p.revision_id=v.id)
     OR EXISTS(SELECT 1 FROM record_relations x WHERE x.source_revision_id=v.id)),
    v.id=r.current_revision_id,v.snapshot_json IS NOT NULL,v.restored_from_id,v.searchable_text";
fn summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<HistorySummary> {
    Ok(HistorySummary {
        id: row.get(0)?,
        created_at: row.get(1)?,
        important: row.get(2)?,
        referenced: row.get(3)?,
        current_checkpoint: row.get(4)?,
        restorable: row.get(5)?,
        restored_from_id: row.get(6)?,
        excerpt: row.get::<_, String>(7)?.chars().take(120).collect(),
    })
}
fn version(db: &Connection, record_id: &str, revision_id: &str) -> StorageResult<HistoryVersion> {
    load(db, record_id)?;
    let sql = format!(
        "SELECT {SUMMARY_COLUMNS},v.document_json,v.snapshot_json FROM record_revisions v JOIN records r ON r.id=v.record_id WHERE v.record_id=?1 AND v.id=?2"
    );
    let row = db
        .query_row(&sql, params![record_id, revision_id], |row| {
            Ok((
                summary(row)?,
                row.get::<_, String>(8)?,
                row.get::<_, Option<String>>(9)?,
            ))
        })
        .optional()?
        .ok_or_else(|| fail("not_found", "历史版本不存在或已清理，请刷新列表"))?;
    let document = serde_json::from_str(&row.1)?;
    document_text(&document)?;
    let snapshot: Option<Snapshot> = row
        .2
        .map(|json| serde_json::from_str(&json))
        .transpose()
        .map_err(|_| fail("corrupt_content", "历史快照不完整，未改动当前内容"))?;
    if snapshot.as_ref().is_some_and(|s| s.document != document) {
        return Err(fail(
            "corrupt_content",
            "历史正文与快照不一致，未改动当前内容",
        ));
    }
    Ok(HistoryVersion {
        summary: row.0,
        document,
        snapshot,
    })
}

// Recheck all owners in the DELETE transaction; a reference is never removed to permit pruning.
pub(crate) fn prune(db: &mut Connection, timestamp: i64) -> StorageResult<usize> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let count = tx.execute(
        "DELETE FROM record_revisions AS v WHERE v.created_at<=?1 AND v.important=0
        AND NOT EXISTS(SELECT 1 FROM records r WHERE r.current_revision_id=v.id)
        AND NOT EXISTS(SELECT 1 FROM revision_pins p WHERE p.revision_id=v.id)
        AND NOT EXISTS(SELECT 1 FROM record_relations x WHERE x.source_revision_id=v.id)
        AND NOT EXISTS(SELECT 1 FROM recovery_drafts d WHERE d.base_revision_id=v.id)",
        [timestamp.saturating_sub(HISTORY_RETENTION_MS)],
    )?;
    tx.commit()?;
    Ok(count)
}
impl DatabaseWorker {
    pub fn history_list(
        &self,
        record_id: String,
        before: Option<HistoryCursor>,
    ) -> StorageResult<HistoryPage> {
        self.call(move |db, _| {
            identifier(&record_id)?;
            prune(db, now()?)?;
            load(db, &record_id)?;
            let sql = format!("SELECT {SUMMARY_COLUMNS} FROM record_revisions v JOIN records r ON r.id=v.record_id WHERE v.record_id=?1
                AND (v.snapshot_json IS NOT NULL OR v.searchable_text<>'')
                AND (?2 IS NULL OR v.created_at<?2 OR (v.created_at=?2 AND v.id<?3)) ORDER BY v.created_at DESC,v.id DESC LIMIT 51");
            let mut stmt = db.prepare(&sql)?;
            let mut items = stmt.query_map(params![record_id, before.as_ref().map(|c| c.created_at), before.as_ref().map(|c| &c.id)], summary)?.collect::<Result<Vec<_>,_>>()?;
            let next_before = if items.len()>50 {
                items.truncate(50);
                items.last().map(|s| HistoryCursor {created_at:s.created_at,id:s.id.clone()})
            } else { None };
            Ok(HistoryPage {items, next_before})
        })
    }
    pub fn history_read(
        &self,
        record_id: String,
        revision_id: String,
    ) -> StorageResult<HistoryVersion> {
        self.call(move |db, _| version(db, &record_id, &revision_id))
    }
    pub fn history_mark(
        &self,
        record_id: String,
        revision_id: String,
        important: bool,
    ) -> StorageResult<()> {
        self.call(move |db, _| {
            let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
            version(&tx, &record_id, &revision_id)?;
            tx.execute(
                "UPDATE record_revisions SET important=?1 WHERE record_id=?2 AND id=?3",
                params![important, record_id, revision_id],
            )?;
            tx.commit()?;
            Ok(())
        })
    }
    pub fn history_restore(&self, input: RestoreHistory) -> StorageResult<EditingSession> {
        self.call(move |db, _| {
            identifier(&input.request_id)?;
            identifier(&input.record_id)?;
            identifier(&input.revision_id)?;
            identifier(&input.session_id)?;
            let request_json = serde_json::to_string(&input)?;
            let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let current = load(&tx, &input.record_id)?;
            let active: Option<String> = tx.query_row("SELECT session_id FROM edit_sessions WHERE record_id=?1", [&input.record_id], |r| r.get(0)).optional()?;
            if let Some((request, response)) = tx.query_row("SELECT request_json,response_json FROM history_restore_receipts WHERE request_id=?1", [&input.request_id], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).optional()? {
                let editing: EditingSession = serde_json::from_str(&response)?;
                if request!=request_json || current.content_version!=editing.record.content_version || current.revision_id!=editing.record.revision_id || active.as_deref()!=Some(&editing.session_id) {
                    return Err(fail("conflict", "恢复请求已过期或身份不一致，请重新核对当前内容"));
                }
                return Ok(editing);
            }
            if current.content_version!=input.expected_content_version || active.as_deref()!=Some(&input.session_id) {
                return Err(fail("conflict", "当前内容或编辑会话已变化，未恢复历史版本；请重新打开记录核对"));
            }
            let has_draft: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM recovery_drafts WHERE record_id=?1)", [&input.record_id], |r| r.get(0))?;
            if has_draft { return Err(fail("conflict", "请先处理恢复草稿，再恢复历史版本")); }
            let old = version(&tx, &input.record_id, &input.revision_id)?;
            let snapshot = old.snapshot.ok_or_else(|| fail("validation", "旧版历史仅保存正文，缺少标题、日期与标签快照，不能完整恢复"))?;
            let text = document_text(&snapshot.document)?;
            for tag in &snapshot.tags {
                if !tx.query_row("SELECT EXISTS(SELECT 1 FROM tags WHERE id=?1)", [&tag.id], |r| r.get::<_,bool>(0))? {
                    return Err(fail("conflict", "历史标签已不存在，未恢复或修改当前内容"));
                }
            }
            checkpoint_on_entry(&tx, &current)?;
            let checkpoint = id(&tx)?;
            let timestamp = now()?;
            tx.execute("INSERT INTO record_revisions(id,record_id,document_json,searchable_text,created_at,request_id,snapshot_json,checkpoint_kind,restored_from_id) VALUES(?1,?2,?3,?4,?5,?6,?7,'editing_entry',?8)", params![checkpoint,input.record_id,serde_json::to_string(&snapshot.document)?,text,timestamp,format!("restore:{}",input.request_id),serde_json::to_string(&snapshot)?,input.revision_id])?;
            tx.execute("UPDATE records SET current_revision_id=?1,title=?2,record_date=CASE WHEN ?3='' THEN record_date ELSE ?3 END,pending_date=CASE WHEN ?3='' THEN '' ELSE NULL END,working_document=?4,working_text=?5,content_version=content_version+1,updated_at=?6 WHERE id=?7", params![checkpoint,snapshot.title,snapshot.record_date,serde_json::to_string(&snapshot.document)?,text,timestamp,input.record_id])?;
            tx.execute("DELETE FROM record_tags WHERE record_id=?1", [&input.record_id])?;
            for tag in &snapshot.tags { tx.execute("INSERT INTO record_tags VALUES(?1,?2)", params![input.record_id,tag.id])?; }
            tx.execute("DELETE FROM record_search WHERE record_id=?1", [&input.record_id])?;
            tx.execute("INSERT INTO record_search(record_id,content) VALUES(?1,?2)", params![input.record_id,format!("{}\n{}",snapshot.title.as_deref().unwrap_or(""),text)])?;
            let session_id = id(&tx)?;
            tx.execute("UPDATE edit_sessions SET session_id=?1,saved_sequence=0 WHERE record_id=?2", params![session_id,input.record_id])?;
            tx.execute("DELETE FROM record_save_receipts WHERE record_id=?1", [&input.record_id])?;
            let editing = EditingSession {record:load(&tx,&input.record_id)?,session_id,recovered:None,recovered_tags:vec![]};
            tx.execute("INSERT INTO history_restore_receipts VALUES(?1,?2,?3,?4,?5)", params![input.request_id,input.record_id,checkpoint,request_json,serde_json::to_string(&editing)?])?;
            tx.commit()?;
            Ok(editing)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn expiry_is_exact_and_a_failed_delete_rolls_back_its_receipts() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("../migrations/002_records.sql"))
            .unwrap();
        db.execute_batch(include_str!("../migrations/003_recovery_sessions.sql"))
            .unwrap();
        db.execute_batch(include_str!("../migrations/004_current_content.sql"))
            .unwrap();
        db.execute_batch(include_str!("../migrations/005_editing_history.sql"))
            .unwrap();
        db.execute_batch(include_str!("../migrations/006_history_management.sql"))
            .unwrap();
        db.pragma_update(None, "foreign_keys", "ON").unwrap();
        db.execute("INSERT INTO records(id,kind,record_date,created_timezone,created_at,updated_at) VALUES('r','text','2026-10-19','UTC',0,0)",[]).unwrap();
        for (id, time) in [("at-boundary", 100), ("one-ms-younger", 101)] {
            db.execute("INSERT INTO record_revisions(id,record_id,document_json,searchable_text,created_at,request_id) VALUES(?1,'r','{}','',?2,?1)",params![id,time]).unwrap();
        }
        db.execute(
            "INSERT INTO record_save_receipts VALUES('receipt','r','at-boundary','{}','{}')",
            [],
        )
        .unwrap();
        db.execute_batch("CREATE TRIGGER fail_prune BEFORE DELETE ON record_revisions BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
        assert!(prune(&mut db, HISTORY_RETENTION_MS + 100).is_err());
        assert_eq!(
            db.query_row("SELECT count(*) FROM record_revisions", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            db.query_row("SELECT count(*) FROM record_save_receipts", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        db.execute_batch("DROP TRIGGER fail_prune;").unwrap();
        assert_eq!(prune(&mut db, HISTORY_RETENTION_MS + 100).unwrap(), 1);
        assert_eq!(
            db.query_row("SELECT id FROM record_revisions", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            "one-ms-younger"
        );
        assert_eq!(
            db.query_row("SELECT count(*) FROM record_save_receipts", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}
