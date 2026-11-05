-- Forward-only storage: old evidence stays byte-for-byte intact and readable.
-- Page rows are content-addressed per Source; capture metadata retains the
-- actual before/after timestamps, ordering and pagination for every observation.
CREATE TABLE ainuoke_catalog_evidence_chunks (
 source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key),
 content_hash TEXT NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 rows JSONB NOT NULL CHECK(jsonb_typeof(rows)='array'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(source_key,content_hash)
);
CREATE TABLE ainuoke_catalog_capture_evidence (
 id UUID PRIMARY KEY, source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key),
 account_fingerprint TEXT NOT NULL, content_hash TEXT NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 directory JSONB NOT NULL CHECK(jsonb_typeof(directory)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(source_key,id), UNIQUE(source_key,content_hash)
);
CREATE TRIGGER catalog_chunk_immutable BEFORE UPDATE OR DELETE ON ainuoke_catalog_evidence_chunks
 FOR EACH ROW EXECUTE FUNCTION preserve_catalog_receipt();
CREATE TRIGGER catalog_capture_immutable BEFORE UPDATE OR DELETE ON ainuoke_catalog_capture_evidence
 FOR EACH ROW EXECUTE FUNCTION preserve_catalog_receipt();
ALTER TABLE ainuoke_catalog_runs ADD COLUMN capture_evidence_id UUID;
ALTER TABLE ainuoke_catalog_runs ADD CONSTRAINT catalog_run_capture_fk
 FOREIGN KEY(source_key,capture_evidence_id) REFERENCES ainuoke_catalog_capture_evidence(source_key,id);
ALTER TABLE ainuoke_contract_observations ADD COLUMN capture_evidence_id UUID;
ALTER TABLE ainuoke_contract_observations ADD CONSTRAINT contract_capture_fk
 FOREIGN KEY(source_key,capture_evidence_id) REFERENCES ainuoke_catalog_capture_evidence(source_key,id);
