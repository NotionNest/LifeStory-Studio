#[test]
#[ignore = "writes and removes an isolated synthetic native credential; run explicitly on each platform"]
fn native_credentials_roundtrip_without_database_or_frontend_export() {
    let id = format!("lifestory-synthetic-credential-{}", std::process::id());
    let synthetic = "lifestory-synthetic-not-an-api-key";
    lifestory_studio_lib::ai_providers::store_key(&id, synthetic).unwrap();
    let entry = keyring::Entry::new("LifeStory Studio AI", &id).unwrap();
    let value = entry.get_password().unwrap();
    lifestory_studio_lib::ai_providers::delete_key(&id).unwrap();
    assert!(value == synthetic, "native credential did not roundtrip");
    assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
}
