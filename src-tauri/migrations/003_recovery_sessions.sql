-- A session fence prevents delayed writes after recovery/discard or editor replacement.
CREATE TABLE edit_sessions (
    record_id TEXT PRIMARY KEY NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    saved_sequence INTEGER NOT NULL DEFAULT 0 CHECK(saved_sequence >= 0)
);
