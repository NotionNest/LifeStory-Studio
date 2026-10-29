use lifestory_studio_lib::storage::DatabaseWorker;
use rusqlite::{Connection, params};
use serde_json::json;
use std::{fs, time::Instant};
#[test]
#[ignore = "synthetic long-history measurement, run explicitly"]
fn measure_long_chat_workspace() {
    let root = std::env::temp_dir().join(format!("lifestory-chat-bench-{}", std::process::id()));
    fs::create_dir(&root).unwrap();
    let worker = DatabaseWorker::start(root.clone()).unwrap();
    let text = "合成测量内容。".repeat(147);
    for count in [100, 1000, 5000] {
        let id = worker
            .ai_create_conversation("2026-10-28".into(), "Asia/Shanghai".into())
            .unwrap();
        let mut sql = Connection::open(root.join("lifestory.db")).unwrap();
        let tx = sql.transaction().unwrap();
        for i in 0..count {
            tx.execute("INSERT INTO conversation_messages(id,record_id,role,content_json,sequence,created_at,request_id) VALUES(?1,?2,?3,?4,?5,1,?6)", params![format!("{id}-{i}"), id, if i%2==0 {"user"} else {"assistant"}, json!({"text":text}).to_string(), i, format!("bench-{id}-{i}")]).unwrap();
        }
        tx.commit().unwrap();
        for _ in 0..5 {
            let start = Instant::now();
            let workspace = worker.ai_workspace(id.clone()).unwrap();
            let read = start.elapsed().as_secs_f64() * 1000.;
            let start = Instant::now();
            let payload = serde_json::to_vec(&workspace).unwrap();
            println!(
                "CHAT_BENCH count={count} read_ms={read:.3} serialize_ms={:.3} bytes={}",
                start.elapsed().as_secs_f64() * 1000.,
                payload.len()
            );
        }
        for _ in 0..5 {
            let start = Instant::now();
            let mut query = sql.prepare("SELECT sequence,content_json FROM conversation_messages WHERE record_id=?1 ORDER BY sequence DESC LIMIT 100").unwrap();
            let messages = query.query_map([&id], |row| Ok((row.get::<_,i64>(0)?, row.get::<_,String>(1)?))).unwrap()
                .map(|row| { let (sequence, raw) = row.unwrap(); json!({"sequence":sequence,"content":serde_json::from_str::<serde_json::Value>(&raw).unwrap()}) })
                .collect::<Vec<_>>();
            let read = start.elapsed().as_secs_f64() * 1000.;
            assert_eq!(messages.len(), 100);
            assert_eq!(messages[0]["sequence"], count - 1);
            let start = Instant::now();
            let payload = serde_json::to_vec(&messages).unwrap();
            println!(
                "PAGE_BENCH count={count} read_ms={read:.3} serialize_ms={:.3} bytes={}",
                start.elapsed().as_secs_f64() * 1000.,
                payload.len()
            );
        }
    }
    drop(worker);
    fs::remove_dir_all(root).unwrap();
}
