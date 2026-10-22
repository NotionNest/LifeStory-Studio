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

#[tauri::command]
pub async fn trash_impact(
    database: State<'_, DatabaseWorker>,
    record_id: String,
) -> Result<crate::trash::Impact, RecordError> {
    record_task(&database, move |db| db.trash_impact(record_id)).await
}

#[tauri::command]
pub async fn trash_move(
    database: State<'_, DatabaseWorker>,
    runner: State<'_, crate::ai::AiRunner>,
    input: crate::trash::TrashRequest,
) -> Result<(), RecordError> {
    let runner = runner.inner().clone();
    record_task(&database, move |db| runner.move_to_trash(&db, input)).await
}

#[tauri::command]
pub async fn trash_list(
    database: State<'_, DatabaseWorker>,
    offset: u32,
    domain: Option<String>,
) -> Result<crate::trash::TrashPage, RecordError> {
    record_task(&database, move |db| {
        db.trash_list_domain(offset, domain.unwrap_or_else(|| "diary".into()))
    })
    .await
}

#[tauri::command]
pub async fn trash_restore(
    database: State<'_, DatabaseWorker>,
    record_id: String,
    deleted_at: i64,
) -> Result<(), RecordError> {
    record_task(&database, move |db| db.trash_restore(record_id, deleted_at)).await
}

#[tauri::command]
pub async fn trash_purge(
    database: State<'_, DatabaseWorker>,
    record_id: String,
    deleted_at: i64,
) -> Result<(), RecordError> {
    record_task(&database, move |db| db.trash_purge(record_id, deleted_at)).await
}

#[tauri::command]
pub async fn trash_status(
    database: State<'_, DatabaseWorker>,
    record_id: String,
) -> Result<String, RecordError> {
    record_task(&database, move |db| db.trash_status(record_id)).await
}

#[tauri::command]
pub async fn ai_profiles(
    database: State<'_, DatabaseWorker>,
) -> Result<Vec<crate::ai_providers::Profile>, RecordError> {
    record_task(&database, |db| db.ai_profiles()).await
}
#[tauri::command]
pub async fn ai_configure(
    database: State<'_, DatabaseWorker>,
    profile: crate::ai_providers::Profile,
    key: String,
) -> Result<crate::ai_providers::Profile, RecordError> {
    record_task(&database, move |db| db.ai_configure(profile, key)).await
}
#[tauri::command]
pub async fn ai_delete_profile(
    database: State<'_, DatabaseWorker>,
    profile_id: String,
) -> Result<(), RecordError> {
    record_task(&database, move |db| db.ai_delete_profile(profile_id)).await
}
#[tauri::command]
pub async fn ai_create_conversation(
    database: State<'_, DatabaseWorker>,
    record_date: String,
    timezone: String,
) -> Result<String, RecordError> {
    record_task(&database, move |db| {
        db.ai_create_conversation(record_date, timezone)
    })
    .await
}
#[tauri::command]
pub async fn ai_workspace(
    database: State<'_, DatabaseWorker>,
    runner: State<'_, crate::ai::AiRunner>,
    record_id: String,
) -> Result<crate::ai::Workspace, RecordError> {
    let mut workspace = record_task(&database, move |db| db.ai_workspace(record_id)).await?;
    if let Some(task) = workspace.task.as_mut() {
        runner.decorate(task)
    }
    Ok(workspace)
}
#[tauri::command]
pub async fn ai_task(
    database: State<'_, DatabaseWorker>,
    task_id: String,
) -> Result<crate::ai::Task, RecordError> {
    record_task(&database, move |db| db.ai_task(task_id)).await
}
#[tauri::command]
pub async fn ai_start(
    database: State<'_, DatabaseWorker>,
    runner: State<'_, crate::ai::AiRunner>,
    input: crate::ai::StartInput,
) -> Result<crate::ai::Task, RecordError> {
    let runner = runner.inner().clone();
    record_task(&database, move |db| runner.start(db, input)).await
}
#[tauri::command]
pub async fn ai_cancel(
    database: State<'_, DatabaseWorker>,
    runner: State<'_, crate::ai::AiRunner>,
    task_id: String,
) -> Result<(), RecordError> {
    let runner = runner.inner().clone();
    record_task(&database, move |db| runner.cancel(&db, task_id)).await
}
#[tauri::command]
pub async fn ai_test(
    runner: State<'_, crate::ai::AiRunner>,
    database: State<'_, DatabaseWorker>,
    profile_id: String,
    request_id: String,
) -> Result<(), RecordError> {
    let profiles = record_task(&database, |db| db.ai_profiles()).await?;
    let profile = profiles
        .into_iter()
        .find(|p| p.id == profile_id && !p.label.starts_with("[已停用]"))
        .ok_or_else(|| RecordError {
            code: "not_found",
            message: "服务不存在或已停用".into(),
        })?;
    let test = runner
        .connection_test(request_id)
        .map_err(|e| RecordError {
            code: "conflict",
            message: e.to_string(),
        })?;
    let work = async {
        let profile = if profile.protocol == "codex" {
            crate::ai_providers::resolve_cli_profile(profile).await?
        } else {
            profile
        };
        crate::ai_providers::generate(
            &profile,
            vec![crate::ai_providers::Message {
                role: "user".into(),
                text: "这是一条合成连接测试，不包含私人资料。请仅回复：连接成功。".into(),
            }],
            test.cancelled.clone(),
            |_| {},
        )
        .await
        .map(|_| ())
    };
    let result = tokio::select! {
        result=work=>result,
        _=async{while !test.cancelled.load(std::sync::atomic::Ordering::SeqCst){tokio::time::sleep(std::time::Duration::from_millis(25)).await;}}=>Err("连接测试已取消".into()),
    };
    let check = result.clone();
    let pid = profile_id.clone();
    record_task(&database, move |db| db.ai_record_check(pid, check)).await?;
    result.map_err(|message| RecordError {
        code: "provider_error",
        message,
    })
}

#[tauri::command]
pub async fn ai_compare(
    database: State<'_, DatabaseWorker>,
    owner_id: String,
    source_id: String,
    revision_id: String,
) -> Result<String, RecordError> {
    record_task(&database, move |db| {
        db.ai_compare(owner_id, source_id, revision_id)
    })
    .await
}

#[tauri::command]
pub async fn ai_models(
    database: State<'_, DatabaseWorker>,
    profile_id: String,
) -> Result<Vec<String>, RecordError> {
    let profiles = record_task(&database, |db| db.ai_profiles()).await?;
    let profile = profiles
        .into_iter()
        .find(|p| p.id == profile_id && !p.label.starts_with("[已停用]"))
        .ok_or_else(|| RecordError {
            code: "not_found",
            message: "服务配置不存在".into(),
        })?;
    crate::ai_providers::models(&profile)
        .await
        .map_err(|message| RecordError {
            code: "provider_error",
            message,
        })
}

#[tauri::command]
pub async fn ai_retry_save(
    database: State<'_, DatabaseWorker>,
    runner: State<'_, crate::ai::AiRunner>,
    task_id: String,
) -> Result<(), RecordError> {
    let runner = runner.inner().clone();
    record_task(&database, move |db| runner.retry_save(&db, task_id)).await
}

#[tauri::command]
pub async fn ai_import_image(
    database: State<'_, DatabaseWorker>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), RecordError> {
    let invalid = || RecordError {
        code: "validation",
        message: "对话图片传输无效或超过限制".into(),
    };
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(invalid());
    };
    if bytes.len() < 4 || bytes.len() > lifestory_image_validation::MAX_BYTES + 4100 {
        return Err(invalid());
    }
    let n = u32::from_le_bytes(bytes[..4].try_into().map_err(|_| invalid())?) as usize;
    if n > 4096 || bytes.len() < 4 + n {
        return Err(invalid());
    }
    let input: crate::attachments::ConversationImage =
        serde_json::from_slice(&bytes[4..4 + n]).map_err(|_| invalid())?;
    let data = bytes[4 + n..].to_vec();
    record_task(&database, move |db| {
        db.import_conversation_image(input, data)
    })
    .await
}

#[tauri::command]
pub async fn ai_preferences(
    database: State<'_, DatabaseWorker>,
) -> Result<crate::ai_experience::Preferences, RecordError> {
    record_task(&database, |db| db.ai_preferences()).await
}
#[tauri::command]
pub async fn ai_set_default(
    database: State<'_, DatabaseWorker>,
    profile_id: Option<String>,
) -> Result<(), RecordError> {
    record_task(&database, move |db| db.ai_set_default(profile_id)).await
}
#[tauri::command]
pub async fn ai_chat_list(
    database: State<'_, DatabaseWorker>,
    keyword: String,
    offset: u32,
) -> Result<crate::ai_experience::ChatPage, RecordError> {
    record_task(&database, move |db| {
        db.ai_chat_list(crate::ai_experience::ChatQuery { keyword, offset })
    })
    .await
}
#[tauri::command]
pub async fn ai_chat_rename(
    database: State<'_, DatabaseWorker>,
    record_id: String,
    title: String,
) -> Result<(), RecordError> {
    record_task(&database, move |db| db.ai_chat_rename(record_id, title)).await
}
#[tauri::command]
pub async fn ai_chat_send(
    database: State<'_, DatabaseWorker>,
    runner: State<'_, crate::ai::AiRunner>,
    input: crate::ai_experience::ChatSend,
) -> Result<crate::ai::Task, RecordError> {
    let runner = runner.inner().clone();
    record_task(&database, move |db| runner.start(db, input.into_start())).await
}
#[tauri::command]
pub async fn ai_preview_generate(
    database: State<'_, DatabaseWorker>,
    runner: State<'_, crate::ai::AiRunner>,
    input: crate::ai_experience::PreviewGenerate,
) -> Result<crate::ai::Task, RecordError> {
    let runner = runner.inner().clone();
    record_task(&database, move |db| runner.start(db, input.into_start())).await
}
#[tauri::command]
pub async fn ai_preview(
    database: State<'_, DatabaseWorker>,
    task_id: String,
) -> Result<crate::ai_experience::Preview, RecordError> {
    record_task(&database, move |db| db.ai_preview(task_id)).await
}
#[tauri::command]
pub async fn ai_adopt(
    database: State<'_, DatabaseWorker>,
    input: crate::ai_experience::Adopt,
) -> Result<crate::ai_experience::Adopted, RecordError> {
    record_task(&database, move |db| db.ai_adopt(input)).await
}
#[tauri::command]
pub async fn ai_update_profile(
    database: State<'_, DatabaseWorker>,
    profile: crate::ai_providers::Profile,
    key: String,
) -> Result<crate::ai_providers::Profile, RecordError> {
    record_task(&database, move |db| db.ai_update_profile(profile, key)).await
}
#[tauri::command]
pub async fn ai_undo_adoption(
    database: State<'_, DatabaseWorker>,
    task_id: String,
) -> Result<crate::ai_experience::Adopted, RecordError> {
    record_task(&database, move |db| db.ai_undo_adoption(task_id)).await
}

#[tauri::command]
pub async fn ai_codex_inspect(
    path: Option<String>,
) -> Result<Vec<crate::ai_providers::CliInspection>, String> {
    crate::ai_providers::inspect_codex(path).await
}

#[tauri::command]
pub async fn ai_codex_models(path: String) -> Result<Vec<String>, String> {
    let profile = crate::ai_providers::Profile {
        id: "catalog".into(),
        label: "Codex".into(),
        service: "codex".into(),
        protocol: "codex".into(),
        base_url: String::new(),
        model: String::new(),
        context_chars: 32000,
        max_output_tokens: 4096,
        downstream: None,
        codex_path: Some(path),
        output_token_parameter: None,
        cli_model_mode: None,
        reasoning_effort: None,
        cli_version: None,
    };
    crate::ai_providers::codex_models(&profile).await
}

#[tauri::command]
pub async fn ai_cli_scan() -> Vec<crate::ai_cli::Installation> {
    crate::ai_cli::scan().await
}
#[tauri::command]
pub async fn ai_codex_catalog(path: String) -> Result<crate::ai_providers::CliCatalog, String> {
    crate::ai_providers::codex_catalog(&codex_profile(path)).await
}

#[tauri::command]
pub async fn ai_cancel_test(
    runner: State<'_, crate::ai::AiRunner>,
    request_id: String,
) -> Result<(), RecordError> {
    runner
        .cancel_connection_test(&request_id)
        .map_err(|e| RecordError {
            code: "provider_error",
            message: e.to_string(),
        })
}

#[tauri::command]
pub async fn ai_codex_probe(
    runner: State<'_, crate::ai::AiRunner>,
    path: String,
    request_id: String,
) -> Result<String, String> {
    let test = runner
        .connection_test(request_id)
        .map_err(|e| e.to_string())?;
    let profile = codex_profile(path);
    tokio::select! {
        result=crate::ai_providers::codex_connection(&profile)=>result,
        _=async{while !test.cancelled.load(std::sync::atomic::Ordering::SeqCst){tokio::time::sleep(std::time::Duration::from_millis(25)).await;}}=>Err("CLI 连接测试已取消".into()),
    }
}

fn codex_profile(path: String) -> crate::ai_providers::Profile {
    crate::ai_providers::Profile {
        id: "catalog".into(),
        label: "Codex".into(),
        service: "codex".into(),
        protocol: "codex".into(),
        base_url: String::new(),
        model: String::new(),
        context_chars: 32000,
        max_output_tokens: 4096,
        downstream: None,
        codex_path: Some(path),
        output_token_parameter: None,
        cli_model_mode: Some("inherit".into()),
        reasoning_effort: None,
        cli_version: None,
    }
}

#[tauri::command]
pub async fn ai_test_cli(
    runner: State<'_, crate::ai::AiRunner>,
    profile: crate::ai_providers::Profile,
    request_id: String,
) -> Result<crate::ai_providers::CliConnectionReport, String> {
    let test = runner
        .connection_test(request_id)
        .map_err(|e| e.to_string())?;
    tokio::select! {
        result=crate::ai_providers::test_cli(profile,test.cancelled.clone())=>result,
        _=async{while !test.cancelled.load(std::sync::atomic::Ordering::SeqCst){tokio::time::sleep(std::time::Duration::from_millis(25)).await;}}=>Err("连接测试已取消".into()),
    }
}
