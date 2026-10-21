-- Keep the existing object/record/version relationships; add operational identities only.
ALTER TABLE attachment_links ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX attachment_record_object ON attachment_links(record_id,object_id);
CREATE TABLE attachment_receipts (
    record_id TEXT PRIMARY KEY NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL UNIQUE,
    revision_id TEXT NOT NULL REFERENCES record_revisions(id) ON DELETE CASCADE,
    input_json TEXT NOT NULL,
    response_json TEXT NOT NULL
);
