mod commands;
pub mod storage;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            let database = storage::DatabaseWorker::start(root)
                .map_err(|error| -> Box<dyn std::error::Error> { error })?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::runtime_info])
        .run(tauri::generate_context!())
        .expect("LifeStory Studio failed to start");
}
