use crate::{
    records::{Tag, date, fail, identifier},
    storage::{DatabaseWorker, StorageResult},
};
use rusqlite::{OptionalExtension, params_from_iter, types::Value as SqlValue};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct LibraryQuery {
    pub keyword: String,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub kinds: Vec<String>,
    pub tag_ids: Vec<String>,
    pub tag_mode: String,
    pub has_images: Option<bool>,
    pub month: Option<String>,
    pub offset: u32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchItem {
    pub id: String,
    pub title: Option<String>,
    pub record_date: String,
    pub kind: String,
    pub excerpt: String,
    pub has_images: bool,
    pub tags: Vec<Tag>,
    pub match_field: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayCount {
    pub date: String,
    pub count: u32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryPage {
    pub items: Vec<SearchItem>,
    pub total: u32,
    pub next_offset: Option<u32>,
    pub days: Vec<DayCount>,
    pub tags: Vec<Tag>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentPreview {
    pub id: String,
    pub title: Option<String>,
    pub record_date: String,
    pub kind: String,
    pub document: Option<Value>,
    pub messages: Vec<String>,
    pub sources: Vec<SourceStatus>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStatus {
    pub id: String,
    pub title: Option<String>,
    pub unavailable: bool,
}
const BASE:&str="WITH base AS (SELECT r.*,COALESCE(r.working_text,v.searchable_text,'') AS body,
COALESCE((SELECT group_concat(j.atom,char(10)) FROM conversation_messages m,json_tree(m.content_json) j WHERE m.record_id=r.id AND j.key='text' AND j.type='text'),'') AS messages,
(EXISTS(SELECT 1 FROM attachment_links l WHERE l.record_id=r.id AND l.in_body=1) OR EXISTS(SELECT 1 FROM message_attachments a WHERE a.record_id=r.id)) AS images
FROM records r LEFT JOIN record_revisions v ON v.id=r.current_revision_id WHERE r.deleted_at IS NULL) ";
fn validate(q: &LibraryQuery) -> StorageResult<()> {
    if q.keyword.chars().count() > 200
        || q.kinds.len() > 3
        || q.tag_ids.len() > 50
        || !q
            .kinds
            .iter()
            .all(|s| ["text", "conversation", "draft"].contains(&s.as_str()))
        || !["", "all", "any"].contains(&q.tag_mode.as_str())
    {
        return Err(fail("validation", "查询条件无效或超过限制"));
    }
    for id in &q.tag_ids {
        identifier(id)?;
    }
    if let Some(d) = &q.date_from {
        date(d)?;
    }
    if let Some(d) = &q.date_to {
        date(d)?;
    }
    if let (Some(a), Some(b)) = (&q.date_from, &q.date_to)
        && a > b
    {
        return Err(fail("validation", "开始日期不能晚于结束日期"));
    }
    if let Some(m) = &q.month {
        date(&format!("{m}-01"))?;
    }
    Ok(())
}
fn excerpt(text: &str, needle: &str) -> String {
    let lowered = text.to_ascii_lowercase();
    let index = if needle.is_empty() {
        0
    } else {
        lowered.find(&needle.to_ascii_lowercase()).unwrap_or(0)
    };
    let before = text[..index].chars().count().saturating_sub(25);
    format!(
        "{}{}",
        if before > 0 { "…" } else { "" },
        text.chars().skip(before).take(140).collect::<String>()
    )
}
impl DatabaseWorker {
    pub fn query_library(&self, query: LibraryQuery) -> StorageResult<QueryPage> {
        validate(&query)?;
        self.call(move|db,_|{
      let tx=db.transaction()?;let db=&tx;
      let keyword=query.keyword.trim();let mut values=vec![];let mut conditions=vec!["1=1".to_owned()];
      let mut bind=|v:SqlValue|{values.push(v);format!("?{}",values.len())};
      if !query.kinds.is_empty(){let p=bind(serde_json::to_string(&query.kinds)?.into());conditions.push(format!("kind IN (SELECT value FROM json_each({p}))"));}
      if let Some(images)=query.has_images {let p=bind(i64::from(images).into());conditions.push(format!("images={p}"));}
      let mut tags=query.tag_ids.clone();tags.sort();tags.dedup();
      if !tags.is_empty(){let p=bind(serde_json::to_string(&tags)?.into());let count=if query.tag_mode=="any"{">0".into()}else{format!("={}",tags.len())};conditions.push(format!("(SELECT count(*) FROM record_tags t WHERE t.record_id=base.id AND t.tag_id IN (SELECT value FROM json_each({p}))){count}"));}
      if !keyword.is_empty(){
        let p=bind(keyword.to_owned().into());
        let exact=format!("(instr(lower(COALESCE(title,'')),lower({p}))>0 OR instr(lower(body),lower({p}))>0 OR instr(lower(messages),lower({p}))>0)");
        if keyword.chars().count()>=3 && keyword.chars().all(char::is_alphanumeric){
          let f=bind(format!("\"{}\"",keyword).into());
          conditions.push(format!("(id IN (SELECT record_id FROM record_search WHERE record_search MATCH {f}) OR instr(lower(messages),lower({p}))>0) AND {exact}"));
        }else{conditions.push(exact);}
      }
      let where_base=conditions.join(" AND ");
      // Month counts deliberately use all non-date filters; selecting a day replaces the date range.
      let days=if let Some(month)=&query.month {
        let mut params=values.clone();params.push(month.clone().into());
        let sql=format!("{BASE} SELECT record_date,count(*) FROM base WHERE {where_base} AND substr(record_date,1,7)=?{} GROUP BY record_date ORDER BY record_date",params.len());
        let mut statement=db.prepare(&sql)?;statement.query_map(params_from_iter(params),|r|Ok(DayCount{date:r.get(0)?,count:r.get(1)?}))?.collect::<Result<Vec<_>,_>>()?
      }else{vec![]};
      if let Some(from)=&query.date_from {values.push(from.clone().into());conditions.push(format!("record_date>=?{}",values.len()));}
      if let Some(to)=&query.date_to {values.push(to.clone().into());conditions.push(format!("record_date<=?{}",values.len()));}
      let filter=conditions.join(" AND ");
      let total:u32=db.query_row(&format!("{BASE} SELECT count(*) FROM base WHERE {filter}"),params_from_iter(&values),|r|r.get(0))?;
      values.push(i64::from(query.offset).into());
      let sql=format!("{BASE} SELECT id,title,record_date,kind,body,messages,images FROM base WHERE {filter} ORDER BY record_date DESC,created_at DESC,id LIMIT 100 OFFSET ?{}",values.len());
      let mut stmt=db.prepare(&sql)?;
      let rows=stmt.query_map(params_from_iter(&values),|r|Ok((r.get::<_,String>(0)?,r.get::<_,Option<String>>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,String>(5)?,r.get::<_,bool>(6)?)))?.collect::<Result<Vec<_>,_>>()?;
      let mut items=vec![];
      for (id,title,record_date,kind,body,messages,has_images) in rows {
        let needle=keyword.to_ascii_lowercase();
        let match_field=if keyword.is_empty(){None}else if title.as_deref().unwrap_or("").to_ascii_lowercase().contains(&needle){Some("title".into())}else if body.to_ascii_lowercase().contains(&needle){Some("body".into())}else{Some("message".into())};
        let text=if match_field.as_deref()==Some("message") || body.is_empty(){&messages}else{&body};
        let mut stmt=db.prepare("SELECT t.id,t.display_name FROM tags t JOIN record_tags a ON a.tag_id=t.id WHERE a.record_id=?1 ORDER BY t.normalized_key")?;
        let tags=stmt.query_map([&id],|r|Ok(Tag{id:r.get(0)?,name:r.get(1)?}))?.collect::<Result<Vec<_>,_>>()?;
        items.push(SearchItem{id,title,record_date,kind,excerpt:excerpt(text,keyword),has_images,tags,match_field});
      }
      let next=query.offset.saturating_add(items.len() as u32);let next_offset=(next<total).then_some(next);
      let mut stmt=db.prepare("SELECT t.id,t.display_name FROM tags t WHERE EXISTS(SELECT 1 FROM record_tags a JOIN records r ON r.id=a.record_id WHERE a.tag_id=t.id AND r.deleted_at IS NULL) ORDER BY t.normalized_key")?;
      let tags=stmt.query_map([],|r|Ok(Tag{id:r.get(0)?,name:r.get(1)?}))?.collect::<Result<Vec<_>,_>>()?;
      Ok(QueryPage{items,total,next_offset,days,tags})
    })
    }
    pub fn preview_library_content(&self, id: String) -> StorageResult<ContentPreview> {
        identifier(&id)?;
        self.call(move|db,_|{
      let row=db.query_row("SELECT r.title,COALESCE(r.pending_date,r.record_date),r.kind,COALESCE(r.working_document,v.document_json) FROM records r LEFT JOIN record_revisions v ON v.id=r.current_revision_id WHERE r.id=?1 AND r.deleted_at IS NULL",[&id],|r|Ok((r.get::<_,Option<String>>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,Option<String>>(3)?))).optional()?.ok_or_else(||fail("not_found","内容不存在或已删除"))?;
      let mut stmt=db.prepare("SELECT content_json FROM conversation_messages WHERE record_id=?1 ORDER BY sequence,id")?;
      let json=stmt.query_map([&id],|r|r.get::<_,String>(0))?.collect::<Result<Vec<_>,_>>()?;
      fn text(v:&Value,out:&mut Vec<String>){if let Some(t)=v.get("text").and_then(Value::as_str){out.push(t.into());}match v {Value::Array(a)=>for v in a{text(v,out)},Value::Object(o)=>for (k,v) in o{if k!="text"{text(v,out)}},_=>{}}}
      let messages=json.iter().map(|s|{let v:Value=serde_json::from_str(s)?;let mut out=vec![];text(&v,&mut out);Ok(out.join("\n"))}).collect::<StorageResult<Vec<_>>>()?;
      let mut stmt=db.prepare("SELECT COALESCE(x.source_id,x.unavailable_source_id,x.id),CASE WHEN r.deleted_at IS NULL THEN r.title ELSE NULL END,(x.source_deleted=1 OR r.id IS NULL OR r.deleted_at IS NOT NULL) FROM record_relations x LEFT JOIN records r ON r.id=x.source_id WHERE x.owner_id=?1 ORDER BY x.id")?;
      let sources=stmt.query_map([&id],|r|Ok(SourceStatus{id:r.get(0)?,title:r.get(1)?,unavailable:r.get(2)?}))?.collect::<Result<Vec<_>,_>>()?;
      Ok(ContentPreview{id,title:row.0,record_date:row.1,kind:row.2,document:row.3.map(|s|serde_json::from_str(&s)).transpose()?,messages,sources})
    })
    }
}
