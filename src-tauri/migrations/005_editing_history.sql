ALTER TABLE records ADD COLUMN content_version INTEGER NOT NULL DEFAULT 0 CHECK(content_version >= 0);
ALTER TABLE record_revisions ADD COLUMN snapshot_json TEXT CHECK(snapshot_json IS NULL OR json_valid(snapshot_json));
ALTER TABLE record_revisions ADD COLUMN checkpoint_kind TEXT NOT NULL DEFAULT 'legacy' CHECK(checkpoint_kind IN ('legacy','editing_entry'));
