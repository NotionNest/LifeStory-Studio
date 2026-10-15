-- LIB-01 target schema, reviewed before activation by LIB-02.
-- All time instants are UTC Unix milliseconds; record_date is a validated YYYY-MM-DD.
PRAGMA foreign_keys = ON;
CREATE TABLE records (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('text', 'conversation', 'draft')),
    title TEXT,
    record_date TEXT NOT NULL,
    created_timezone TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    current_revision_id TEXT,
    deleted_at INTEGER,
    purge_at INTEGER,
    CHECK ((deleted_at IS NULL AND purge_at IS NULL) OR
           (deleted_at IS NOT NULL AND purge_at = deleted_at + 2592000000)),
    FOREIGN KEY (id, current_revision_id) REFERENCES record_revisions(record_id, id)
        DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE record_revisions (
    id TEXT PRIMARY KEY NOT NULL,
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    document_json TEXT NOT NULL CHECK (json_valid(document_json)),
    searchable_text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    important INTEGER NOT NULL DEFAULT 0 CHECK (important IN (0, 1)),
    request_id TEXT NOT NULL UNIQUE,
    UNIQUE (record_id, id)
);
CREATE INDEX revisions_record_time ON record_revisions(record_id, created_at);
CREATE INDEX records_timeline ON records(record_date DESC, created_at DESC, id);
CREATE TABLE revision_pins (
    revision_id TEXT NOT NULL REFERENCES record_revisions(id) ON DELETE CASCADE,
    owner_kind TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    PRIMARY KEY (revision_id, owner_kind, owner_id)
);
CREATE TABLE recovery_drafts (
    record_id TEXT PRIMARY KEY NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    base_revision_id TEXT,
    session_id TEXT NOT NULL,
    edit_sequence INTEGER NOT NULL CHECK (edit_sequence >= 0),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    written_at INTEGER NOT NULL,
    FOREIGN KEY (record_id, base_revision_id) REFERENCES record_revisions(record_id, id)
);
CREATE TABLE tags (
    id TEXT PRIMARY KEY NOT NULL,
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
    normalized_key TEXT NOT NULL UNIQUE
);
CREATE TABLE record_tags (
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (record_id, tag_id)
);
CREATE TABLE image_objects (
    id TEXT PRIMARY KEY NOT NULL,
    sha256 TEXT NOT NULL UNIQUE,
    relative_path TEXT NOT NULL UNIQUE,
    media_type TEXT NOT NULL,
    byte_length INTEGER NOT NULL CHECK (byte_length > 0),
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    state TEXT NOT NULL CHECK (state IN ('staged', 'ready', 'pending_delete'))
);
CREATE TABLE attachment_links (
    id TEXT PRIMARY KEY NOT NULL,
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    object_id TEXT NOT NULL REFERENCES image_objects(id),
    original_name TEXT NOT NULL,
    deleted_at INTEGER,
    purge_at INTEGER,
    UNIQUE(record_id, id),
    CHECK ((deleted_at IS NULL AND purge_at IS NULL) OR
           (deleted_at IS NOT NULL AND purge_at = deleted_at + 2592000000))
);
CREATE TABLE revision_attachments (
    record_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    attachment_id TEXT NOT NULL,
    PRIMARY KEY (revision_id, attachment_id),
    FOREIGN KEY (record_id, revision_id) REFERENCES record_revisions(record_id, id) ON DELETE CASCADE,
    FOREIGN KEY (record_id, attachment_id) REFERENCES attachment_links(record_id, id)
);
CREATE TABLE conversation_messages (
    id TEXT PRIMARY KEY NOT NULL,
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK (sequence >= 0),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content_json TEXT NOT NULL CHECK (json_valid(content_json)),
    request_id TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    UNIQUE(record_id, sequence),
    UNIQUE(record_id, id)
);
CREATE TABLE message_attachments (
    record_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    attachment_id TEXT NOT NULL,
    PRIMARY KEY (message_id, attachment_id),
    FOREIGN KEY (record_id, message_id) REFERENCES conversation_messages(record_id, id) ON DELETE CASCADE,
    FOREIGN KEY (record_id, attachment_id) REFERENCES attachment_links(record_id, id)
);
CREATE TABLE record_relations (
    owner_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    source_id TEXT REFERENCES records(id) ON DELETE SET NULL,
    source_revision_id TEXT,
    relation_kind TEXT NOT NULL CHECK (relation_kind IN ('conversation', 'draft_source')),
    id TEXT PRIMARY KEY NOT NULL,
    source_deleted INTEGER NOT NULL DEFAULT 0 CHECK (source_deleted IN (0, 1)),
    FOREIGN KEY (source_id, source_revision_id) REFERENCES record_revisions(record_id, id)
        ON DELETE SET NULL
);
-- Literal search policy is implemented by the query layer; no user MATCH syntax.
CREATE VIRTUAL TABLE record_search USING fts5(record_id UNINDEXED, content, tokenize='trigram');
