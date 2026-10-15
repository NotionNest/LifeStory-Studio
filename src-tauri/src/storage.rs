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
const SCHEMA_VERSION: i64 = 1;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub data_directory: String,
    pub schema_version: i64,
    pub sqlite_version: String,
    pub fts5_available: bool,
}

struct InspectRequest(mpsc::Sender<StorageResult<StorageInfo>>);

/// Owns the SQLite connection on one thread; IPC never executes SQL on the UI thread.
#[derive(Clone)]
pub struct DatabaseWorker {
    inner: Arc<WorkerHandle>,
}

struct WorkerHandle {
    requests: Option<mpsc::Sender<InspectRequest>>,
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
        let (requests, receiver) = mpsc::channel::<InspectRequest>();
        let (ready, initialized) = mpsc::channel();
        let thread = thread::Builder::new()
            .name("lifestory-database".into())
            .spawn(move || {
                let connection = match initialize(&root) {
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
                for InspectRequest(reply) in receiver {
                    let _ = reply.send(inspect_connection(&connection, &root));
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
        let (reply, response) = mpsc::channel();
        self.inner
            .requests
            .as_ref()
            .ok_or_else(|| io::Error::other("资料库线程已关闭"))?
            .send(InspectRequest(reply))
            .map_err(io::Error::other)?;
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
        transaction.pragma_update(None, "user_version", SCHEMA_VERSION)?;
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
