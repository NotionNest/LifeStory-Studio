-- Current use follows the document; legacy deletion timestamps are no longer retention rules.
ALTER TABLE attachment_links ADD COLUMN in_body INTEGER NOT NULL DEFAULT 1 CHECK(in_body IN (0,1));
UPDATE attachment_links SET in_body=0 WHERE deleted_at IS NOT NULL;
DELETE FROM attachment_receipts;
