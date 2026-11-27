-- Selected legacy rows retain IDs and original hashes; no historical freshness is invented.
ALTER TABLE ainuoke_material_source_snapshots ADD COLUMN business_hash TEXT CHECK(business_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE ainuoke_source_profiles ADD COLUMN source_history_started_at TIMESTAMPTZ;
ALTER TABLE ainuoke_source_profiles ALTER COLUMN source_history_started_at SET DEFAULT clock_timestamp();
CREATE FUNCTION preserve_ainuoke_history_start() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.source_history_started_at IS NOT NULL AND NEW.source_history_started_at IS DISTINCT FROM OLD.source_history_started_at THEN RAISE EXCEPTION 'source history start is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER source_history_start_immutable BEFORE UPDATE ON ainuoke_source_profiles FOR EACH ROW EXECUTE FUNCTION preserve_ainuoke_history_start();
ALTER TABLE ainuoke_catalog_runs ADD COLUMN legacy_directory_capture_id UUID;
ALTER TABLE ainuoke_catalog_runs ADD CONSTRAINT catalog_legacy_directory_fk FOREIGN KEY(source_key,legacy_directory_capture_id) REFERENCES ainuoke_catalog_capture_evidence(source_key,id);
