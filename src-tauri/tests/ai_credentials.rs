use lifestory_studio_lib::{credentials, storage::DatabaseWorker};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "lifestory-credentials-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn credentials_survive_restart_stay_out_of_database_and_are_isolated() {
    let first = Directory::new();
    let second = Directory::new();
    let synthetic = "synthetic-not-a-real-api-key";
    let db = DatabaseWorker::start(first.0.clone()).unwrap();
    credentials::store_key(&first.0, "profile-1", synthetic).unwrap();
    assert_eq!(db.ai_key("profile-1".into()).unwrap(), synthetic);
    drop(db);
    let restarted = DatabaseWorker::start(first.0.clone()).unwrap();
    assert_eq!(restarted.ai_key("profile-1".into()).unwrap(), synthetic);
    assert!(credentials::read_key(&second.0, "profile-1").is_err());
    for entry in fs::read_dir(&first.0).unwrap() {
        let path = entry.unwrap().path();
        if path.is_file() {
            assert!(
                !fs::read(path)
                    .unwrap()
                    .windows(synthetic.len())
                    .any(|v| v == synthetic.as_bytes())
            );
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(first.0.join("private-credentials/profile-1.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
    credentials::delete_key(&first.0, "profile-1").unwrap();
    credentials::delete_key(&first.0, "profile-1").unwrap();
    assert!(restarted.ai_key("profile-1".into()).is_err());
}
#[test]
fn invalid_or_corrupt_credentials_fail_without_overwriting_saved_key() {
    let dir = Directory::new();
    for id in ["", "../escape", "a/b"] {
        assert!(credentials::store_key(&dir.0, id, "synthetic").is_err());
    }
    for key in ["", " ", "synthetic\nsecret"] {
        assert!(credentials::store_key(&dir.0, "profile-1", key).is_err());
    }
    credentials::store_key(&dir.0, "profile-1", "synthetic-original").unwrap();
    assert!(credentials::store_key(&dir.0, "profile-1", "replacement").is_err());
    assert_eq!(
        credentials::read_key(&dir.0, "profile-1").unwrap(),
        "synthetic-original"
    );
    fs::write(dir.0.join("private-credentials/profile-1.json"), "invalid").unwrap();
    assert!(credentials::read_key(&dir.0, "profile-1").is_err());
}
#[test]
fn profile_replacement_and_deletion_remove_only_their_own_credentials() {
    use lifestory_studio_lib::ai_providers::Profile;
    let dir = Directory::new();
    let db = DatabaseWorker::start(dir.0.clone()).unwrap();
    let profile: Profile = serde_json::from_value(serde_json::json!({
        "id":"synthetic-config", "label":"synthetic", "service":"custom", "protocol":"chat",
        "baseUrl":"https://invalid.example/v1", "model":"synthetic", "contextChars":32000,
        "maxOutputTokens":1000, "downstream":null, "codexPath":null
    }))
    .unwrap();
    let saved = db.ai_configure(profile, "synthetic-first".into()).unwrap();
    assert_eq!(db.ai_key(saved.id.clone()).unwrap(), "synthetic-first");
    let old = saved.id.clone();
    let updated = db
        .ai_update_profile(saved, "synthetic-second".into())
        .unwrap();
    assert!(db.ai_key(old).is_err());
    assert_eq!(db.ai_key(updated.id.clone()).unwrap(), "synthetic-second");
    assert!(
        !serde_json::to_string(&db.ai_profiles().unwrap())
            .unwrap()
            .contains("synthetic-second")
    );
    db.ai_delete_profile(updated.id.clone()).unwrap();
    assert!(db.ai_key(updated.id).is_err());
}

#[test]
fn ordinary_profile_edits_preserve_keys_but_destination_changes_require_reentry() {
    use lifestory_studio_lib::ai_providers::Profile;
    let dir = Directory::new();
    let db = DatabaseWorker::start(dir.0.clone()).unwrap();
    let profile: Profile = serde_json::from_value(serde_json::json!({
        "id":"synthetic-config", "label":"synthetic", "service":"custom", "protocol":"chat",
        "baseUrl":"https://invalid.example/v1", "model":"synthetic", "contextChars":32000,
        "maxOutputTokens":1000, "downstream":null, "codexPath":null, "hasKey":true,
        "keyScope":{"baseUrl":"https://forged.invalid.example"}
    }))
    .unwrap();
    assert!(
        !profile.has_key,
        "client metadata must not establish credential status"
    );
    let saved = db
        .ai_configure(profile, "synthetic-retained".into())
        .unwrap();
    assert!(saved.has_key);
    assert_eq!(
        serde_json::to_value(&saved.key_scope).unwrap(),
        serde_json::json!({
            "protocol":"chat", "baseUrl":"https://invalid.example/v1", "service":"custom", "downstream":null
        })
    );
    db.ai_set_default(Some(saved.id.clone())).unwrap();
    let sql = rusqlite::Connection::open(dir.0.join("lifestory.db")).unwrap();
    sql.execute_batch("CREATE TRIGGER reject_profile BEFORE INSERT ON ai_profiles BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;").unwrap();
    assert!(db.ai_update_profile(saved.clone(), String::new()).is_err());
    assert_eq!(db.ai_key(saved.id.clone()).unwrap(), "synthetic-retained");
    assert_eq!(db.ai_profiles().unwrap().len(), 1);
    assert_eq!(
        fs::read_dir(dir.0.join("private-credentials"))
            .unwrap()
            .count(),
        1
    );
    sql.execute_batch("DROP TRIGGER reject_profile").unwrap();
    drop(sql);
    let mut edited = saved.clone();
    edited.label = "renamed".into();
    edited.model = "another-model".into();
    let updated = db.ai_update_profile(edited, String::new()).unwrap();
    assert!(updated.has_key);
    assert_eq!(
        db.ai_preferences().unwrap().default_profile_id,
        Some(updated.id.clone())
    );
    assert!(db.ai_key(saved.id).is_err());
    assert_eq!(db.ai_key(updated.id.clone()).unwrap(), "synthetic-retained");
    for field in ["address", "protocol", "service", "downstream"] {
        let mut changed = updated.clone();
        match field {
            "address" => changed.base_url = "https://changed.invalid.example/v1".into(),
            "protocol" => changed.protocol = "responses".into(),
            "service" => changed.service = "other".into(),
            _ => changed.downstream = Some("other-provider".into()),
        }
        assert!(db.ai_update_profile(changed, String::new()).is_err());
        assert_eq!(db.ai_key(updated.id.clone()).unwrap(), "synthetic-retained");
    }
    assert!(db.ai_update_profile(updated.clone(), " ".into()).is_err());
    drop(db);
    let db = DatabaseWorker::start(dir.0.clone()).unwrap();
    let profiles = db.ai_profiles().unwrap();
    assert!(
        profiles
            .iter()
            .find(|p| p.id == updated.id)
            .unwrap()
            .has_key
    );
    assert!(
        !serde_json::to_string(&profiles)
            .unwrap()
            .contains("synthetic-retained")
    );
    credentials::delete_key(&dir.0, &updated.id).unwrap();
    assert!(
        !db.ai_profiles()
            .unwrap()
            .iter()
            .find(|p| p.id == updated.id)
            .unwrap()
            .has_key
    );
    assert!(db.ai_update_profile(updated, String::new()).is_err());
}
