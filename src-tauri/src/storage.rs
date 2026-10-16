use std::{
    error::Error,
    fs, io,
    path::{Path, PathBuf},
    sync::{Arc, mpsc},
    thread,
    time::Duration,
};

use rusqlite::Connection;
use serde::Serialize;

pub type StorageResult<T> = Result<T, Box<dyn Error + Send + Sync>>;
const SCHEMA_VERSION: i64 = 3;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub data_directory: String,
    pub schema_version: i64,
    pub sqlite_version: String,
    pub fts5_available: bool,
}

type DatabaseJob = Box<dyn FnOnce(&mut Connection, &Path) + Send>;

/// Owns the SQLite connection on one thread; IPC never executes SQL on the UI thread.
#[derive(Clone)]
pub struct DatabaseWorker {
    inner: Arc<WorkerHandle>,
}

struct WorkerHandle {
    requests: Option<mpsc::Sender<DatabaseJob>>,
    thread: Option<thread::JoinHandle<()>>,
}

impl Drop for WorkerHandle {
    fn drop(&mut self) {
        // Close requests before joining so SQLite releases its files on Windows too.
        self.requests.take();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl DatabaseWorker {
    pub fn start(root: PathBuf) -> StorageResult<Self> {
        let (requests, receiver) = mpsc::channel::<DatabaseJob>();
        let (ready, initialized) = mpsc::channel();
        let thread = thread::Builder::new()
            .name("lifestory-database".into())
            .spawn(move || {
                let mut connection = match initialize(&root) {
                    Ok(connection) => {
                        if ready.send(Ok(())).is_err() {
                            return;
                        }
                        connection
                    }
                    Err(error) => {
                        let _ = ready.send(Err(error));
                        return;
                    }
                };
                for job in receiver {
                    job(&mut connection, &root);
                }
            })?;
        initialized.recv().map_err(io::Error::other)??;
        Ok(Self {
            inner: Arc::new(WorkerHandle {
                requests: Some(requests),
                thread: Some(thread),
            }),
        })
    }

    pub fn inspect(&self) -> StorageResult<StorageInfo> {
        self.call(|connection, root| inspect_connection(connection, root))
    }

    pub(crate) fn call<T: Send + 'static>(
        &self,
        action: impl FnOnce(&mut Connection, &Path) -> StorageResult<T> + Send + 'static,
    ) -> StorageResult<T> {
        let (reply, response) = mpsc::channel();
        self.inner
            .requests
            .as_ref()
            .ok_or_else(|| io::Error::other("资料库线程已关闭"))?
            .send(Box::new(move |connection, root| {
                let _ = reply.send(action(connection, root));
            }))
            .map_err(|_| io::Error::other("资料库线程已关闭"))?;
        response.recv().map_err(io::Error::other)?
    }
}

fn initialize(root: &Path) -> StorageResult<Connection> {
    fs::create_dir_all(root)?;
    let mut connection = Connection::open(root.join("lifestory.db"))?;
    connection.busy_timeout(Duration::from_secs(2))?;
    connection.pragma_update(None, "foreign_keys", "ON")?;

    // Check compatibility before changing any persistent settings or schema.
    let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version > SCHEMA_VERSION {
        return Err(io::Error::other("资料库版本高于当前应用，拒绝修改").into());
    }
    if version == 0 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(include_str!("../migrations/001_workspace.sql"))?;
        transaction.pragma_update(None, "user_version", 1)?;
        transaction.commit()?;
    }
    let format: String = connection.query_row(
        "SELECT value FROM workspace_metadata WHERE key = 'format'",
        [],
        |row| row.get(0),
    )?;
    if format != "lifestory-studio" {
        return Err(io::Error::other("资料格式不匹配，拒绝打开").into());
    }
    let current: i64 = connection.pragma_query_value(None, "user_version", |r| r.get(0))?;
    for target in (current + 1)..=SCHEMA_VERSION {
        // Fail closed when the consistent pre-migration backup cannot be completed.
        let backups = root.join("migration-backups");
        fs::create_dir_all(&backups)?;
        let id: String =
            connection.query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))?;
        let pending = backups.join(format!("schema-{}-{id}.partial", target - 1));
        let complete = backups.join(format!("schema-{}-{id}.sqlite", target - 1));
        connection.backup("main", &pending, None)?;
        fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&pending)?
            .sync_all()?;
        fs::rename(&pending, &complete)?;
        let sql = match target {
            2 => include_str!("../migrations/002_records.sql"),
            3 => include_str!("../migrations/003_recovery_sessions.sql"),
            _ => unreachable!(),
        };
        let transaction = connection.transaction()?;
        transaction.execute_batch(sql)?;
        transaction.pragma_update(None, "user_version", target)?;
        transaction.commit()?;
    }
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "synchronous", "FULL")?;
    // A temporary table checks the bundled engine without changing user data.
    connection.execute_batch(
        "CREATE VIRTUAL TABLE temp.fts_probe USING fts5(content, tokenize='trigram');
         DROP TABLE temp.fts_probe;",
    )?;
    Ok(connection)
}

fn inspect_connection(connection: &Connection, root: &Path) -> StorageResult<StorageInfo> {
    Ok(StorageInfo {
        data_directory: root.to_string_lossy().into_owned(),
        schema_version: connection.pragma_query_value(None, "user_version", |row| row.get(0))?,
        sqlite_version: connection.query_row("SELECT sqlite_version()", [], |row| row.get(0))?,
        fts5_available: true,
    })
}
