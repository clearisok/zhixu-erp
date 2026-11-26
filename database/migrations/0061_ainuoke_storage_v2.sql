-- Refs #174: immutable scoped bodies; no live cleanup or source scheduling changes.
CREATE TABLE ainuoke_contract_contents (
 id UUID PRIMARY KEY, source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key),
 account_fingerprint TEXT NOT NULL CHECK(account_fingerprint ~ '^[a-f0-9]{64}$'),
 source_id TEXT NOT NULL, sales_contract_no TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('materials','colors')),
 business_hash TEXT NOT NULL CHECK(business_hash ~ '^[a-f0-9]{64}$'),
 body JSONB NOT NULL CHECK(jsonb_typeof(body)='object'), canonical_size BIGINT NOT NULL CHECK(canonical_size>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(source_key,account_fingerprint,source_id,sales_contract_no,kind,business_hash), UNIQUE(source_key,id)
);
CREATE TRIGGER contract_content_immutable BEFORE UPDATE OR DELETE ON ainuoke_contract_contents
 FOR EACH ROW EXECUTE FUNCTION preserve_catalog_receipt();
ALTER TABLE ainuoke_source_runs ADD COLUMN directory_capture_id UUID;
ALTER TABLE ainuoke_source_runs ADD CONSTRAINT source_run_directory_fk FOREIGN KEY(source_key,directory_capture_id) REFERENCES ainuoke_catalog_capture_evidence(source_key,id);
ALTER TABLE ainuoke_source_runs ADD COLUMN business_hash TEXT CHECK(business_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE ainuoke_material_source_snapshots ADD COLUMN material_content_id UUID REFERENCES ainuoke_contract_contents(id);
ALTER TABLE ainuoke_contract_observations ADD COLUMN material_content_id UUID;
ALTER TABLE ainuoke_contract_observations ADD COLUMN color_content_id UUID;
ALTER TABLE ainuoke_contract_observations ADD COLUMN business_hash TEXT CHECK(business_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE ainuoke_contract_observations ADD COLUMN record_kind TEXT NOT NULL DEFAULT 'legacy' CHECK(record_kind IN ('legacy','change','confirmation'));
ALTER TABLE ainuoke_contract_observations ADD COLUMN permanent_hold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ainuoke_source_runs ADD COLUMN origin_observation_id UUID REFERENCES ainuoke_contract_observations(id);
ALTER TABLE ainuoke_catalog_intake_receipts ADD COLUMN observation_id UUID REFERENCES ainuoke_contract_observations(id);
ALTER TABLE ainuoke_contract_observations ADD CONSTRAINT observation_material_fk FOREIGN KEY(source_key,material_content_id) REFERENCES ainuoke_contract_contents(source_key,id);
ALTER TABLE ainuoke_contract_observations ADD CONSTRAINT observation_color_fk FOREIGN KEY(source_key,color_content_id) REFERENCES ainuoke_contract_contents(source_key,id);
ALTER TABLE ainuoke_material_order_heads ADD COLUMN verified_observation_id UUID REFERENCES ainuoke_contract_observations(id);
ALTER TABLE ainuoke_material_order_heads ADD COLUMN last_verified_at TIMESTAMPTZ;
ALTER TABLE ainuoke_material_order_heads ADD COLUMN verified_capture_id UUID;
ALTER TABLE ainuoke_material_order_heads ADD CONSTRAINT head_verified_capture_fk FOREIGN KEY(source_key,verified_capture_id) REFERENCES ainuoke_catalog_capture_evidence(source_key,id);
ALTER TABLE ainuoke_material_order_heads ADD COLUMN verified_material_manifest JSONB;
ALTER TABLE ainuoke_sync_jobs ADD COLUMN resolved_at TIMESTAMPTZ;
ALTER TABLE ainuoke_sync_jobs ADD COLUMN resolution_evidence JSONB;
ALTER TABLE ainuoke_sync_jobs ADD CONSTRAINT job_resolution_proof CHECK((resolved_at IS NULL)=(resolution_evidence IS NULL) AND (resolution_evidence IS NULL OR jsonb_typeof(resolution_evidence)='object' AND resolution_evidence<>'{}'::jsonb));
CREATE TABLE ainuoke_sync_daily_rollups (
 source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key), day DATE NOT NULL,
 attempts BIGINT NOT NULL DEFAULT 0, successes BIGINT NOT NULL DEFAULT 0, failures BIGINT NOT NULL DEFAULT 0,
 unknown_results BIGINT NOT NULL DEFAULT 0, unchanged BIGINT NOT NULL DEFAULT 0,
 distinct_contracts BIGINT NOT NULL DEFAULT 0, duration_buckets JSONB NOT NULL DEFAULT '{}'::jsonb,
 database_bytes BIGINT, measured_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(source_key,day)
);
ALTER TABLE ainuoke_sync_jobs ADD COLUMN rolled_up_at TIMESTAMPTZ;
-- Cleanup defaults off. Role-safe maintenance entry points are installed separately.
ALTER TABLE ainuoke_sync_controls ADD COLUMN storage_cleanup_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE FUNCTION validate_ainuoke_shared_references() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item ainuoke_contract_contents%ROWTYPE; expected_contract TEXT; expected_source TEXT; expected_account TEXT; expected_key TEXT; marker JSONB; content_uuid UUID; role_kind TEXT;
BEGIN
 IF TG_TABLE_NAME='ainuoke_material_source_snapshots' THEN
  marker=NEW.snapshots->0;
  IF marker->>'schemaVersion' IS DISTINCT FROM 'ainuoke-shared-pages.v1' THEN
   IF NEW.material_content_id IS NOT NULL THEN RAISE EXCEPTION 'inline content reference mismatch' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  SELECT r.source_key,p.account_fingerprint,l.external_id INTO expected_key,expected_account,expected_source
   FROM ainuoke_source_runs r JOIN ainuoke_source_profiles p USING(source_key) JOIN sales_order_source_links l ON l.id=NEW.source_link_id WHERE r.id=NEW.run_id;
  expected_contract=NEW.sales_contract_no; role_kind='materials'; content_uuid=(marker->>'contentId')::uuid;
  IF NEW.material_content_id IS DISTINCT FROM content_uuid OR marker->>'captureHash' IS DISTINCT FROM NEW.content_hash OR jsonb_array_length(NEW.snapshots)<>1 THEN RAISE EXCEPTION 'snapshot content reference mismatch' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.evidence->>'schemaVersion' IS DISTINCT FROM 'ainuoke-contract-observation.v3' THEN
   IF NEW.material_content_id IS NOT NULL OR NEW.color_content_id IS NOT NULL THEN RAISE EXCEPTION 'inline content reference mismatch' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  expected_key=NEW.source_key; expected_source=NEW.source_id;
  SELECT e.sales_contract_no,p.account_fingerprint INTO expected_contract,expected_account FROM ainuoke_catalog_entries e JOIN ainuoke_source_profiles p USING(source_key) WHERE e.source_key=NEW.source_key AND e.source_id=NEW.source_id;
  IF NEW.evidence->>'sourceId' IS DISTINCT FROM expected_source OR NEW.evidence->>'contract' IS DISTINCT FROM expected_contract OR NEW.evidence->>'captureId' IS DISTINCT FROM NEW.capture_evidence_id::text THEN RAISE EXCEPTION 'observation content scope mismatch' USING ERRCODE='23514'; END IF;
  NEW.material_content_id=(NEW.evidence->'materials'->>'contentId')::uuid;
  NEW.color_content_id=(NEW.evidence->'colors'->>'contentId')::uuid;
  SELECT * INTO item FROM ainuoke_contract_contents WHERE id=NEW.color_content_id;
  IF NOT FOUND OR (item.source_key,item.account_fingerprint,item.source_id,item.sales_contract_no,item.kind) IS DISTINCT FROM (expected_key,expected_account,expected_source,expected_contract,'colors'::text) THEN RAISE EXCEPTION 'color content scope mismatch' USING ERRCODE='23514'; END IF;
  content_uuid=NEW.material_content_id; role_kind='materials';
 END IF;
 SELECT * INTO item FROM ainuoke_contract_contents WHERE id=content_uuid;
 IF NOT FOUND OR (item.source_key,item.account_fingerprint,item.source_id,item.sales_contract_no,item.kind) IS DISTINCT FROM (expected_key,expected_account,expected_source,expected_contract,role_kind) THEN RAISE EXCEPTION 'material content scope mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shared_snapshot_scope BEFORE INSERT ON ainuoke_material_source_snapshots FOR EACH ROW EXECUTE FUNCTION validate_ainuoke_shared_references();
CREATE TRIGGER shared_observation_scope BEFORE INSERT ON ainuoke_contract_observations FOR EACH ROW EXECUTE FUNCTION validate_ainuoke_shared_references();
