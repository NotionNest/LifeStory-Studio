-- Provenance identity survives deletion; never keep source text or title here.
ALTER TABLE record_relations ADD COLUMN unavailable_source_id TEXT;
CREATE INDEX records_trash_due ON records(purge_at) WHERE deleted_at IS NOT NULL;
