-- Preserve all existing generated documents as ordinary diaries.
UPDATE records SET kind='text' WHERE kind='draft';
CREATE TABLE ai_preferences (id INTEGER PRIMARY KEY CHECK(id=1), default_profile_id TEXT REFERENCES ai_profiles(id));
INSERT INTO ai_preferences VALUES(1,NULL);
CREATE TABLE ai_conversations (
 record_id TEXT PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,
 profile_id TEXT REFERENCES ai_profiles(id),
 linked_diary_id TEXT REFERENCES records(id) ON DELETE SET NULL,
 adopted_sequence INTEGER NOT NULL DEFAULT -1
);
INSERT INTO ai_conversations(record_id,profile_id,linked_diary_id)
 SELECT r.id,(SELECT t.profile_id FROM ai_tasks t WHERE t.record_id=r.id ORDER BY t.rowid DESC LIMIT 1),
 (SELECT x.source_id FROM record_relations x JOIN records d ON d.id=x.source_id WHERE x.owner_id=r.id AND d.kind='text' LIMIT 1)
 FROM records r WHERE r.kind='conversation';
CREATE TABLE ai_previews (
 task_id TEXT PRIMARY KEY REFERENCES ai_tasks(id) ON DELETE CASCADE,
 mode TEXT NOT NULL CHECK(mode IN ('create','append','rewrite')),
 target_id TEXT REFERENCES records(id) ON DELETE SET NULL,
 target_version INTEGER,
 target_text TEXT,
 end_sequence INTEGER NOT NULL,
 start_sequence INTEGER NOT NULL,
 title TEXT NOT NULL,
 record_date TEXT NOT NULL,
 text TEXT NOT NULL DEFAULT '',
 adopted_id TEXT REFERENCES records(id) ON DELETE SET NULL,
 adopted_request TEXT,
 adopted_json TEXT
);
CREATE TABLE ai_adopted_ranges (
 conversation_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
 diary_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
 end_sequence INTEGER NOT NULL,
 PRIMARY KEY(conversation_id,diary_id)
);
ALTER TABLE ai_previews ADD COLUMN before_snapshot_json TEXT;
ALTER TABLE ai_previews ADD COLUMN adopted_version INTEGER;
ALTER TABLE ai_previews ADD COLUMN previous_watermark INTEGER NOT NULL DEFAULT -1;
ALTER TABLE ai_previews ADD COLUMN undone INTEGER NOT NULL DEFAULT 0 CHECK(undone IN (0,1));
CREATE TABLE ai_request_receipts (
 request_id TEXT PRIMARY KEY NOT NULL,
 task_id TEXT NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
 request_hash TEXT NOT NULL
);
