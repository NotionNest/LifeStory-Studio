ALTER TABLE ai_conversations ADD COLUMN has_user_text INTEGER NOT NULL DEFAULT 0
 CHECK(has_user_text IN (0,1));

UPDATE ai_conversations SET has_user_text=EXISTS(
 SELECT 1 FROM conversation_messages m,json_tree(m.content_json) j
 WHERE m.record_id=ai_conversations.record_id AND m.role='user'
 AND j.key='text' AND j.type='text' AND trim(j.atom)<>''
);

-- Messages are append-only; purging a chat also removes its conversation metadata.
CREATE TRIGGER chat_user_text_insert AFTER INSERT ON conversation_messages
WHEN NEW.role='user'
BEGIN
 UPDATE ai_conversations SET has_user_text=1
 WHERE record_id=NEW.record_id AND has_user_text=0
 AND EXISTS(SELECT 1 FROM json_tree(NEW.content_json) j
            WHERE j.key='text' AND j.type='text' AND trim(j.atom)<>'');
END;
