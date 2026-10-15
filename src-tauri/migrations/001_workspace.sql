-- Workspace metadata only. Diary schemas arrive with their feature specifications.
CREATE TABLE workspace_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
INSERT INTO workspace_metadata (key, value) VALUES ('format', 'lifestory-studio');
