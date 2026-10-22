ALTER TABLE ai_conversations ADD COLUMN cli_profile_json TEXT CHECK(cli_profile_json IS NULL OR json_valid(cli_profile_json));
ALTER TABLE ai_tasks ADD COLUMN effective_profile_json TEXT CHECK(effective_profile_json IS NULL OR json_valid(effective_profile_json));
