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
        .map_err(|_| RecordError {
            code: "write_failed",
            message: "资料库任务未完成，编辑内容仍保留".into(),
        })?
        .map_err(|error| {
            if let Some(error) = error.downcast_ref::<RecordError>() {
                return RecordError {
                    code: error.code,
                    message: error.message.clone(),
                };
            }
            let sqlite = error
                .downcast_ref::<rusqlite::Error>()
                .and_then(|e| match e {
                    rusqlite::Error::SqliteFailure(code, _) => Some(code.code),
                    _ => None,
                });
            let (code, message) = match sqlite {
                Some(rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked) => {
                    ("storage_busy", "资料库暂忙，稍后自动重试")
                }
                Some(rusqlite::ErrorCode::OperationInterrupted) => {
                    ("storage_interrupted", "本次写入被中断，稍后自动重试")
                }
                Some(rusqlite::ErrorCode::DiskFull) => {
                    ("storage_full", "磁盘空间不足，请释放空间后重试")
                }
                Some(rusqlite::ErrorCode::ReadOnly | rusqlite::ErrorCode::PermissionDenied) => {
                    ("storage_permission", "资料库不可写，请检查权限后重试")
                }
                Some(rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase) => (
                    "storage_corrupt",
                    "资料库无法正常读取，已停止自动重试；请保留编辑内容并检查资料库",
                ),
                _ => (
                    "write_failed",
                    "本地资料库操作未完成，请检查后重试；编辑内容仍保留",
                ),
            };
            RecordError {
                code,
                message: message.into(),
            }
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
pub async fn record_end_edit(
    database: State<'_, DatabaseWorker>,
    record_id: String,
    session_id: String,
) -> Result<(), RecordError> {
    record_task(&database, move |db| db.end_edit(record_id, session_id)).await
}

use crate::history::{HistoryCursor, HistoryPage, HistoryVersion, RestoreHistory};
#[tauri::command]
pub async fn history_list(
    database: State<'_, DatabaseWorker>,
    record_id: String,
    before: Option<HistoryCursor>,
) -> Result<HistoryPage, RecordError> {
    record_task(&database, move |db| db.history_list(record_id, before)).await
}
#[tauri::command]
pub async fn history_read(
    database: State<'_, DatabaseWorker>,
    record_id: String,
    revision_id: String,
) -> Result<HistoryVersion, RecordError> {
    record_task(&database, move |db| db.history_read(record_id, revision_id)).await
}
#[tauri::command]
pub async fn history_mark(
    database: State<'_, DatabaseWorker>,
    record_id: String,
    revision_id: String,
    important: bool,
) -> Result<(), RecordError> {
    record_task(&database, move |db| {
        db.history_mark(record_id, revision_id, important)
    })
    .await
}
#[tauri::command]
pub async fn history_restore(
    database: State<'_, DatabaseWorker>,
    input: RestoreHistory,
) -> Result<EditingSession, RecordError> {
    record_task(&database, move |db| db.history_restore(input)).await
}

use crate::attachments::{ImportImage, ImportedAttachment};
#[tauri::command]
pub async fn attachment_import(
    database: State<'_, DatabaseWorker>,
    request: tauri::ipc::Request<'_>,
) -> Result<ImportedAttachment, RecordError> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(RecordError {
            code: "validation",
            message: "图片必须使用二进制传输".into(),
        });
    };
    let invalid = || RecordError {
        code: "validation",
        message: "图片导入数据无效或超过限制".into(),
    };
    if bytes.len() < 4 || bytes.len() > lifestory_image_validation::MAX_BYTES + 3 * 1024 * 1024 + 4
    {
        return Err(invalid());
    }
    let length = u32::from_le_bytes(bytes[..4].try_into().map_err(|_| invalid())?) as usize;
    if length > 3 * 1024 * 1024 || length > bytes.len() - 4 {
        return Err(invalid());
    }
    let input: ImportImage =
        serde_json::from_slice(&bytes[4..4 + length]).map_err(|_| invalid())?;
    let bytes = bytes[4 + length..].to_vec();
    record_task(&database, move |db| db.import_image(input, bytes)).await
}
#[tauri::command]
pub async fn attachment_image(
    database: State<'_, DatabaseWorker>,
    record_id: String,
    attachment_id: String,
    revision_id: Option<String>,
    original: bool,
) -> Result<tauri::ipc::Response, RecordError> {
    record_task(&database, move |db| {
        db.attachment_bytes(record_id, attachment_id, revision_id, original)
    })
    .await
    .map(tauri::ipc::Response::new)
}
#[tauri::command]
pub async fn attachment_copy(
    app: tauri::AppHandle,
    database: State<'_, DatabaseWorker>,
    record_id: String,
    attachment_id: String,
    revision_id: Option<String>,
) -> Result<(), RecordError> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let (rgba, width, height) = record_task(&database, move |db| {
        let bytes = db.attachment_bytes(record_id, attachment_id, revision_id, true)?;
        lifestory_image_validation::clipboard_rgba(&bytes)
            .map_err(|message| crate::records::fail("corrupt_content", &message))
    })
    .await?;
    app.clipboard()
        .write_image(&tauri::image::Image::new_owned(rgba, width, height))
        .map_err(|e| RecordError {
            code: "clipboard",
            message: format!("图片复制失败：{e}"),
        })
}

#[tauri::command]
pub async fn library_query(
    database: State<'_, DatabaseWorker>,
    query: crate::library_query::LibraryQuery,
) -> Result<crate::library_query::QueryPage, RecordError> {
    record_task(&database, move |db| db.query_library(query)).await
}
#[tauri::command]
pub async fn library_preview(
    database: State<'_, DatabaseWorker>,
    record_id: String,
) -> Result<crate::library_query::ContentPreview, RecordError> {
    record_task(&database, move |db| db.preview_library_content(record_id)).await
}
