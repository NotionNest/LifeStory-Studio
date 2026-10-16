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

use crate::records::{
    CreateRecord, Record, RecordError, RecordSummary, SaveRecord, SaveResult, Tag,
};

async fn record_task<T: Send + 'static>(
    database: &DatabaseWorker,
    action: impl FnOnce(DatabaseWorker) -> crate::storage::StorageResult<T> + Send + 'static,
) -> Result<T, RecordError> {
    let database = database.clone();
    tauri::async_runtime::spawn_blocking(move || action(database))
        .await
        .map_err(|_| RecordError {code:"write_failed",message:"资料库任务未完成，编辑内容仍保留".into()})?
        .map_err(|error| {
            if let Some(error) = error.downcast_ref::<RecordError>() {
                return RecordError {code:error.code,message:error.message.clone()};
            }
            let full=error.downcast_ref::<rusqlite::Error>().is_some_and(|e| matches!(e,rusqlite::Error::SqliteFailure(code,_) if code.code==rusqlite::ErrorCode::DiskFull));
            RecordError {code:if full {"storage_full"} else {"write_failed"},message:if full {"磁盘空间不足，未保存修改仍保留"} else {"本地资料库操作失败，请重试；编辑内容仍保留"}.into()}
        })
}
#[tauri::command]
pub async fn record_create(
    database: State<'_, DatabaseWorker>,
    input: CreateRecord,
) -> Result<Record, RecordError> {
    record_task(&database, move |db| db.create_record(input)).await
}
#[tauri::command]
pub async fn record_read(
    database: State<'_, DatabaseWorker>,
    record_id: String,
) -> Result<Record, RecordError> {
    record_task(&database, move |db| db.read_record(record_id)).await
}
#[tauri::command]
pub async fn record_list(
    database: State<'_, DatabaseWorker>,
    offset: u32,
) -> Result<Vec<RecordSummary>, RecordError> {
    record_task(&database, move |db| db.list_records(offset)).await
}
#[tauri::command]
pub async fn record_save(
    database: State<'_, DatabaseWorker>,
    input: SaveRecord,
) -> Result<SaveResult, RecordError> {
    record_task(&database, move |db| db.save_record(input)).await
}
#[tauri::command]
pub async fn tag_create(
    database: State<'_, DatabaseWorker>,
    name: String,
) -> Result<Tag, RecordError> {
    record_task(&database, move |db| db.create_tag(name)).await
}

#[tauri::command]
pub async fn record_export(app: tauri::AppHandle, input: SaveRecord) -> Result<bool, RecordError> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let content = crate::records::export_document(&input).map_err(|_| RecordError {
            code: "validation",
            message: "未保存内容格式无效，无法另存".into(),
        })?;
        let Some(path) = app
            .dialog()
            .file()
            .set_file_name("lifestory-unsaved.json")
            .add_filter("LifeStory 编辑内容", &["json"])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = path.into_path().map_err(|_| RecordError {
            code: "validation",
            message: "只能另存到本地文件".into(),
        })?;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|_| RecordError {
                code: "write_failed",
                message: "无法新建文件，请选择可写位置及未使用的文件名".into(),
            })?;
        use std::io::Write;
        if file
            .write_all(content.as_bytes())
            .and_then(|_| file.sync_all())
            .is_err()
        {
            drop(file);
            let _ = std::fs::remove_file(path);
            return Err(RecordError {
                code: "write_failed",
                message: "另存失败，编辑内容仍保留".into(),
            });
        }
        Ok(true)
    })
    .await
    .map_err(|_| RecordError {
        code: "write_failed",
        message: "另存未完成，编辑内容仍保留".into(),
    })?
}

#[tauri::command]
pub(crate) fn record_exit(app: tauri::AppHandle, gate: State<'_, crate::ExitGate>) {
    gate.0.store(true, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
}

use crate::recovery::{BeginEdit, EditingSession, RecoveryDraft, RecoverySummary};
#[tauri::command]
pub async fn recovery_list(
    database: State<'_, DatabaseWorker>,
) -> Result<Vec<RecoverySummary>, RecordError> {
    record_task(&database, |db| db.recovery_list()).await
}
#[tauri::command]
pub async fn recovery_read(
    database: State<'_, DatabaseWorker>,
    record_id: String,
) -> Result<Option<RecoveryDraft>, RecordError> {
    record_task(&database, move |db| db.recovery_read(record_id)).await
}
#[tauri::command]
pub async fn record_begin_edit(
    database: State<'_, DatabaseWorker>,
    input: BeginEdit,
) -> Result<EditingSession, RecordError> {
    record_task(&database, move |db| db.begin_edit(input)).await
}
#[tauri::command]
pub async fn recovery_write(
    database: State<'_, DatabaseWorker>,
    input: SaveRecord,
) -> Result<bool, RecordError> {
    record_task(&database, move |db| db.recovery_write(input)).await
}
#[tauri::command]
pub async fn record_end_edit(
    database: State<'_, DatabaseWorker>,
    record_id: String,
    session_id: String,
) -> Result<(), RecordError> {
    record_task(&database, move |db| db.end_edit(record_id, session_id)).await
}
