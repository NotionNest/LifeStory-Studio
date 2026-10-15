use serde::Serialize;
use tauri::State;

use crate::storage::{DatabaseWorker, StorageInfo};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    app_version: &'static str,
    platform: &'static str,
    architecture: &'static str,
    storage: StorageInfo,
}

#[tauri::command]
pub async fn runtime_info(database: State<'_, DatabaseWorker>) -> Result<RuntimeInfo, String> {
    let database = database.inner().clone();
    let storage = tauri::async_runtime::spawn_blocking(move || database.inspect())
        .await
        .map_err(|error| format!("环境检查任务未完成：{error}"))?
        .map_err(|error| format!("本地资料库检查失败：{error}"))?;

    Ok(RuntimeInfo {
        app_version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
        storage,
    })
}
