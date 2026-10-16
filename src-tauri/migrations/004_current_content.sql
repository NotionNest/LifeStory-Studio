-- Current content is durable independently of immutable history checkpoints.
ALTER TABLE records ADD COLUMN working_document TEXT CHECK (working_document IS NULL OR json_valid(working_document));
ALTER TABLE records ADD COLUMN working_text TEXT;
ALTER TABLE records ADD COLUMN pending_date TEXT;
