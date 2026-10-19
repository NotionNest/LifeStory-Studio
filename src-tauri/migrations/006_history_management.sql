-- Provenance is informational: a restored copy does not keep an unreferenced source forever.
ALTER TABLE record_revisions ADD COLUMN restored_from_id TEXT;
CREATE TABLE history_restore_receipts (
    request_id TEXT PRIMARY KEY NOT NULL,
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    revision_id TEXT NOT NULL REFERENCES record_revisions(id) ON DELETE CASCADE,
    request_json TEXT NOT NULL,
    response_json TEXT NOT NULL
);
