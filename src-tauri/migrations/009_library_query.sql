-- One owner for current title/body indexing. History and drafts are never indexed here.
DELETE FROM record_search;
INSERT INTO record_search(record_id,content)
SELECT r.id,COALESCE(r.title,'')||char(10)||COALESCE(r.working_text,v.searchable_text,'')
FROM records r LEFT JOIN record_revisions v ON v.id=r.current_revision_id WHERE r.deleted_at IS NULL;
CREATE TRIGGER library_search_insert AFTER INSERT ON records WHEN NEW.deleted_at IS NULL BEGIN
  INSERT INTO record_search(record_id,content) VALUES(NEW.id,COALESCE(NEW.title,'')||char(10)||COALESCE(NEW.working_text,(SELECT searchable_text FROM record_revisions WHERE id=NEW.current_revision_id),''));
END;
CREATE TRIGGER library_search_update AFTER UPDATE OF title,working_text,current_revision_id,deleted_at ON records BEGIN
  DELETE FROM record_search WHERE record_id=OLD.id;
  INSERT INTO record_search(record_id,content)
  SELECT NEW.id,COALESCE(NEW.title,'')||char(10)||COALESCE(NEW.working_text,(SELECT searchable_text FROM record_revisions WHERE id=NEW.current_revision_id),'') WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER library_search_delete AFTER DELETE ON records BEGIN
  DELETE FROM record_search WHERE record_id=OLD.id;
END;
