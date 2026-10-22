CREATE TABLE ai_profiles (
 id TEXT PRIMARY KEY NOT NULL, profile_json TEXT NOT NULL CHECK(json_valid(profile_json)), created_at INTEGER NOT NULL
);
CREATE TABLE ai_tasks (
 id TEXT PRIMARY KEY NOT NULL, record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
 profile_id TEXT NOT NULL REFERENCES ai_profiles(id), kind TEXT NOT NULL CHECK(kind IN ('chat','draft','test')),
 status TEXT NOT NULL CHECK(status IN ('running','completed','cancelled','failed','interrupted')),
 partial TEXT NOT NULL DEFAULT '', error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 result_id TEXT REFERENCES records(id) ON DELETE SET NULL,
 request_id TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL CHECK(json_valid(request_json))
);
CREATE UNIQUE INDEX ai_one_active_conversation ON ai_tasks(record_id) WHERE status='running';
CREATE TABLE ai_task_sources (
 task_id TEXT NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
 source_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
 revision_id TEXT NOT NULL REFERENCES record_revisions(id),
 source_text TEXT NOT NULL,
 PRIMARY KEY(task_id,source_id)
);
CREATE TABLE ai_provider_checks (
 profile_id TEXT PRIMARY KEY NOT NULL REFERENCES ai_profiles(id),
 tested_at INTEGER NOT NULL, text_streaming INTEGER NOT NULL CHECK(text_streaming IN (0,1)),
 error TEXT
);
