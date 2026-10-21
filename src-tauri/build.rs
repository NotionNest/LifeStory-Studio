fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "runtime_info",
            "record_create",
            "record_read",
            "record_list",
            "library_query",
            "library_preview",
            "record_save",
            "tag_create",
            "record_export",
            "record_exit",
            "recovery_list",
            "recovery_read",
            "record_begin_edit",
            "record_end_edit",
            "history_list",
            "history_read",
            "history_mark",
            "history_restore",
            "attachment_import",
            "attachment_image",
            "attachment_copy",
        ]),
    ))
    .expect("Tauri build configuration failed");
}
