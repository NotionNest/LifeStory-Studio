mod commands;
pub mod history;
pub mod records;
pub mod recovery;
pub mod storage;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};
pub(crate) struct ExitGate(pub AtomicBool);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ExitGate(AtomicBool::new(false)))
        .on_menu_event(|app, event| {
            let name = match event.id().as_ref() {
                "request-exit" | "request-close" => "exit-requested",
                "request-save" => "save-requested",
                "request-new" => "new-record-requested",
                _ => return,
            };
            let _ = app.emit_to("main", name, ());
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("exit-requested", ());
            }
        })
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
            // Native predefined Quit invokes Cocoa terminate: directly, bypassing the save guard.
            let quit = MenuItem::with_id(
                app,
                "request-exit",
                "退出 LifeStory Studio",
                true,
                Some("CmdOrCtrl+Q"),
            )?;
            let save = MenuItem::with_id(app, "request-save", "保存", true, Some("CmdOrCtrl+S"))?;
            let new_record =
                MenuItem::with_id(app, "request-new", "新建记录", true, Some("CmdOrCtrl+N"))?;
            let close =
                MenuItem::with_id(app, "request-close", "关闭窗口", true, Some("CmdOrCtrl+W"))?;
            let app_menu = Submenu::with_items(
                app,
                "LifeStory Studio",
                true,
                &[
                    &PredefinedMenuItem::about(app, None, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &quit,
                ],
            )?;
            let file_menu = Submenu::with_items(app, "文件", true, &[&new_record, &save, &close])?;
            let edit_menu = Submenu::with_items(
                app,
                "编辑",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;
            app.set_menu(Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu])?)?;
            let root = app.path().app_data_dir()?;
            let database = storage::DatabaseWorker::start(root)
                .map_err(|error| -> Box<dyn std::error::Error> { error })?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::runtime_info,
            commands::record_create,
            commands::record_read,
            commands::record_list,
            commands::record_save,
            commands::tag_create,
            commands::record_export,
            commands::record_exit,
            commands::recovery_list,
            commands::recovery_read,
            commands::record_begin_edit,
            commands::record_end_edit,
            commands::history_list,
            commands::history_read,
            commands::history_mark,
            commands::history_restore,
        ])
        .build(tauri::generate_context!())
        .expect("LifeStory Studio failed to start")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event
                && !app.state::<ExitGate>().0.load(Ordering::SeqCst)
            {
                api.prevent_exit();
                let _ = app.emit_to("main", "exit-requested", ());
            }
        });
}
