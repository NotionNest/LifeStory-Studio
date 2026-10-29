//! User-approved plaintext credentials, separate from the database and record exports.
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

fn path(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("服务配置标识无效".into());
    }
    Ok(root.join("private-credentials").join(format!("{id}.json")))
}
fn validate(key: &str) -> Result<(), String> {
    if key.trim().is_empty() || key.len() > 16384 || key.chars().any(char::is_control) {
        return Err("API 密钥为空或格式无效".into());
    }
    Ok(())
}
pub fn store_key(root: &Path, id: &str, key: &str) -> Result<(), String> {
    validate(key)?;
    let target = path(root, id)?;
    let dir = target.parent().ok_or("凭据目录无效")?;
    fs::create_dir_all(dir).map_err(|_| "无法创建本机凭据目录")?;
    if !fs::symlink_metadata(dir)
        .map_err(|_| "无法检查凭据目录")?
        .is_dir()
    {
        return Err("凭据目录无效".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(dir, fs::Permissions::from_mode(0o700))
            .map_err(|_| "无法设置凭据目录权限")?;
    }
    // Profile IDs are immutable: publish a complete file before the database references it.
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&target).map_err(|_| "无法创建本机凭据文件")?;
    let result = (|| -> Result<(), std::io::Error> {
        file.write_all(serde_json::to_string(key)?.as_bytes())?;
        file.sync_all()?;
        #[cfg(unix)]
        fs::File::open(dir)?.sync_all()?;
        Ok(())
    })();
    drop(file);
    if result.is_err() {
        let _ = fs::remove_file(target);
        return Err("无法保存本机凭据文件".into());
    }
    Ok(())
}
pub fn read_key(root: &Path, id: &str) -> Result<String, String> {
    let target = path(root, id)?;
    let meta = fs::symlink_metadata(&target)
        .map_err(|_| "未配置本机密钥，请在 API 设置中重新填写并保存")?;
    if !meta.is_file() || meta.len() > 100_000 {
        return Err("本机凭据文件无效".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(target)
        .map_err(|_| "无法读取本机凭据")?
        .take(100_001)
        .read_to_end(&mut bytes)
        .map_err(|_| "无法读取本机凭据")?;
    let key: String = serde_json::from_slice(&bytes).map_err(|_| "本机凭据文件损坏，请重新配置")?;
    validate(&key)?;
    Ok(key)
}
pub fn delete_key(root: &Path, id: &str) -> Result<(), String> {
    match fs::remove_file(path(root, id)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("无法删除本机凭据".into()),
    }
}
