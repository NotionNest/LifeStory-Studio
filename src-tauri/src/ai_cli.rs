//! Local executable discovery only. Generation support is owned by each provider adapter.
use futures_util::{StreamExt, stream};
use serde::Serialize;
use std::{collections::HashSet, path::PathBuf, time::Duration};
use tokio::io::AsyncReadExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub kind: String,
    pub name: String,
    pub path: String,
    pub version: String,
    pub generation_supported: bool,
    pub preferred: bool,
    pub error: Option<String>,
}

pub(crate) fn external_cli_path(path: &std::path::Path) -> Result<(), String> {
    let resolved = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::var_os("PATH")
            .and_then(|env| {
                std::env::split_paths(&env)
                    .map(|dir| dir.join(path))
                    .find(|p| p.is_file())
            })
            .ok_or("未找到 CLI 可执行文件")?
    };
    let resolved = resolved
        .canonicalize()
        .map_err(|_| "CLI 路径不存在或不可访问")?;
    let parts = resolved
        .components()
        .map(|p| p.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    if parts
        .windows(2)
        .any(|p| p[0].to_lowercase().ends_with(".app") && p[1] == "Contents")
    {
        return Err(
            "此文件属于其他应用的内部组件，不作为独立 CLI 启动。请使用单独安装的 CLI。".into(),
        );
    }
    Ok(())
}

pub(crate) fn runtime_path(command: &mut tokio::process::Command, path: &std::path::Path) {
    // Node launchers must resolve their sibling runtime when started from a desktop application.
    if let Some(parent) = path.parent() {
        let mut dirs = vec![parent.to_path_buf()];
        if let Some(env) = std::env::var_os("PATH") {
            dirs.extend(std::env::split_paths(&env));
        }
        if let Ok(env) = std::env::join_paths(dirs) {
            command.env("PATH", env);
        }
    }
}

async fn output(path: &PathBuf, arg: &str, limit: u64) -> Result<String, String> {
    external_cli_path(path)?;
    let mut command = tokio::process::Command::new(path);
    command
        .arg(arg)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    runtime_path(&mut command, path);
    let mut child = command
        .spawn()
        .map_err(|_| "无法运行，请检查安装与运行时".to_string())?;
    let mut stdout = child.stdout.take().ok_or("无法读取版本")?;
    let result = tokio::time::timeout(Duration::from_secs(5), async {
        let mut bytes = Vec::new();
        (&mut stdout)
            .take(limit + 1)
            .read_to_end(&mut bytes)
            .await
            .map_err(|_| "读取失败")?;
        if bytes.len() as u64 > limit {
            return Err("输出超过限制");
        }
        if !child.wait().await.map_err(|_| "进程异常")?.success() {
            return Err("CLI 检测未成功，请检查安装");
        }
        Ok(String::from_utf8_lossy(&bytes).trim().to_string())
    })
    .await;
    let _ = child.kill().await;
    result
        .map_err(|_| "CLI 检测超时".to_string())?
        .map_err(str::to_string)
}

fn directories() -> Vec<PathBuf> {
    let mut dirs = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .unwrap_or_default();
    dirs.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        let home = PathBuf::from(home);
        dirs.extend([
            home.join(".local/bin"),
            home.join(".cargo/bin"),
            home.join(".npm-global/bin"),
            home.join(".bun/bin"),
        ]);
        if let Ok(entries) = std::fs::read_dir(home.join(".nvm/versions/node")) {
            dirs.extend(entries.flatten().map(|p| p.path().join("bin")));
        }
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        dirs.push(PathBuf::from(appdata).join("npm"));
    }
    let mut seen = HashSet::new();
    dirs.retain(|p| seen.insert(p.clone()));
    dirs
}

pub async fn scan() -> Vec<Installation> {
    scan_in(directories()).await
}

async fn scan_in(dirs: Vec<PathBuf>) -> Vec<Installation> {
    let mut jobs = Vec::new();
    let mut seen = HashSet::new();
    for (kind, name, commands) in [
        ("codex", "Codex CLI", vec!["codex"]),
        ("claude", "Claude Code", vec!["claude"]),
        ("kimi", "Kimi CLI", vec!["kimi"]),
        ("cursor", "Cursor Agent", vec!["agent", "cursor-agent"]),
        ("gemini", "Gemini CLI", vec!["gemini"]),
    ] {
        let mut candidates = Vec::new();
        for dir in &dirs {
            for command in &commands {
                for extension in if cfg!(windows) {
                    vec![".exe", ".cmd", ""]
                } else {
                    vec![""]
                } {
                    let path = dir.join(format!("{command}{extension}"));
                    if path.is_file() && external_cli_path(&path).is_ok() {
                        let identity = path.canonicalize().unwrap_or(path.clone());
                        if seen.insert((kind, identity)) {
                            candidates.push(path);
                        }
                    }
                }
            }
        }
        jobs.extend(
            candidates
                .into_iter()
                .take(16)
                .enumerate()
                .map(|(index, path)| (kind.to_string(), name.to_string(), path, index == 0)),
        );
    }
    let mut found = stream::iter(jobs)
        .map(|(kind, name, path, preferred)| async move {
            if !preferred {
                return Some(Installation {
                    kind,
                    name,
                    path: path.to_string_lossy().into_owned(),
                    version: "未运行（其他安装）".into(),
                    generation_supported: false,
                    preferred,
                    error: None,
                });
            }
            let result = output(&path, "--version", 1024).await;
            let (version, mut error) = match result {
                Ok(v) => (v, None),
                Err(e) => (String::new(), Some(e)),
            };
            if error.is_none() && kind == "codex" && !version.starts_with("codex-cli ") {
                error = Some("该程序未确认 Codex CLI 身份".into());
            }
            if error.is_none() && kind == "cursor" {
                match output(&path, "--help", 16384).await {
                    Ok(help) if help.to_lowercase().contains("cursor") => {}
                    _ => return None,
                }
            }
            let generation_supported = kind == "codex"
                && crate::ai_providers::codex_generation_supported(&version)
                && error.is_none();
            Some(Installation {
                kind,
                name,
                path: path.to_string_lossy().into_owned(),
                generation_supported,
                preferred,
                version,
                error,
            })
        })
        .buffer_unordered(4)
        .filter_map(|item| async move { item })
        .collect::<Vec<_>>()
        .await;
    found.sort_by(|a, b| {
        a.kind
            .cmp(&b.kind)
            .then(b.preferred.cmp(&a.preferred))
            .then(a.path.cmp(&b.path))
    });
    found
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    #[tokio::test]
    async fn scanning_does_not_execute_inactive_installations() {
        let root = std::env::temp_dir().join(format!(
            "lifestory-cli-inactive-test-{}",
            std::process::id()
        ));
        let first = root.join("first");
        let second = root.join("second");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir(&second).unwrap();
        for (dir, source) in [
            (&first, "#!/bin/sh\nprintf 'codex-cli 0.146.0\\n'\n"),
            (&second, "#!/bin/sh\nexit 99\n"),
        ] {
            let path = dir.join("codex");
            std::fs::write(&path, source).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        let result = scan_in(vec![first, second]).await;
        assert_eq!(result.len(), 2);
        assert!(result[0].preferred);
        assert_eq!(result[0].version, "codex-cli 0.146.0");
        assert_eq!(result[1].version, "未运行（其他安装）");
        assert!(result[1].error.is_none());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    async fn application_internal_components_are_excluded_before_execution() {
        let root =
            std::env::temp_dir().join(format!("lifestory-cli-bundle-test-{}", std::process::id()));
        let bundled = root.join("Example.app/Contents/MacOS");
        std::fs::create_dir_all(&bundled).unwrap();
        let path = bundled.join("codex");
        std::fs::write(&path, "#!/bin/sh\nexit 99\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert!(external_cli_path(&path).is_err());
        assert!(scan_in(vec![bundled]).await.is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    async fn scanning_deduplicates_paths_and_keeps_failures_separate() {
        let root =
            std::env::temp_dir().join(format!("lifestory-cli-scan-test-{}", std::process::id()));
        std::fs::create_dir(&root).unwrap();
        for (name, body) in [
            ("codex", "#!/bin/sh\nprintf 'codex-cli 0.146.0\\n'\n"),
            ("claude", "#!/bin/sh\nexit 1\n"),
        ] {
            let path = root.join(name);
            std::fs::write(&path, body).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        let result = scan_in(vec![root.clone(), root.clone()]).await;
        assert_eq!(result.len(), 2);
        let codex = result.iter().find(|i| i.kind == "codex").unwrap();
        assert!(codex.error.is_none());
        assert!(codex.generation_supported);
        assert!(
            result
                .iter()
                .find(|i| i.kind == "claude")
                .unwrap()
                .error
                .is_some()
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
