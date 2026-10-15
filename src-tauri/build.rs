fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "runtime_info",
            "record_create",
            "record_read",
            "record_list",
            "record_save",
            "tag_create",
            "record_export",
            "record_exit",
        ]),
    ))
    .expect("Tauri build configuration failed");
}
