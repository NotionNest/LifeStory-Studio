use lifestory_studio_lib::storage::DatabaseWorker;
use rusqlite::{Connection, params};
use serde_json::json;
use std::{fs, time::Instant};
#[test]
#[ignore = "synthetic long-history measurement, run explicitly"]
fn measure_long_chat_window() {
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
            let workspace = worker
                .ai_chat_window(id.clone(), Default::default())
                .unwrap();
            let read = start.elapsed().as_secs_f64() * 1000.;
            assert_eq!(workspace.messages.len(), 100);
            assert_eq!(workspace.messages[0]["sequence"], count - 100);
            assert_eq!(workspace.messages[99]["sequence"], count - 1);
            assert_eq!(workspace.page.has_before, count > 100);
            let start = Instant::now();
            let payload = serde_json::to_vec(&workspace).unwrap();
            println!(
                "WINDOW_BENCH count={count} read_ms={read:.3} serialize_ms={:.3} bytes={}",
                start.elapsed().as_secs_f64() * 1000.,
                payload.len()
            );
        }
    }
    drop(worker);
    fs::remove_dir_all(root).unwrap();
}
