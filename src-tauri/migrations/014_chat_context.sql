ALTER TABLE ai_conversations ADD COLUMN context_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(context_ids));
