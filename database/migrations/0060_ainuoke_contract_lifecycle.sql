-- Forward-only source lifecycle. Existing invisible rows are NOT classified by
-- migration: only a newly validated complete directory may confirm deletion.
ALTER TABLE ainuoke_catalog_entries
 ADD COLUMN source_lifecycle_state TEXT NOT NULL DEFAULT 'present'
   CHECK(source_lifecycle_state IN ('present','source_deleted')),
 ADD COLUMN source_deleted_at TIMESTAMPTZ,
 ADD COLUMN lifecycle_version INTEGER NOT NULL DEFAULT 0 CHECK(lifecycle_version>=0);

CREATE TABLE ainuoke_contract_lifecycle_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 source_key TEXT NOT NULL, source_id TEXT NOT NULL, sales_contract_no TEXT NOT NULL,
 account_fingerprint TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 event_type TEXT NOT NULL CHECK(event_type IN ('source_deleted','source_restored')),
 previous_seen_run_id UUID NOT NULL,
 confirmed_run_id UUID NOT NULL,
 confirmed_at TIMESTAMPTZ NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 evidence JSONB NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 FOREIGN KEY(source_key,source_id) REFERENCES ainuoke_catalog_entries(source_key,source_id),
 FOREIGN KEY(source_key,previous_seen_run_id) REFERENCES ainuoke_catalog_runs(source_key,id),
 FOREIGN KEY(source_key,confirmed_run_id) REFERENCES ainuoke_catalog_runs(source_key,id),
 UNIQUE(source_key,source_id,version), UNIQUE(source_key,source_id,confirmed_run_id)
);
CREATE INDEX contract_lifecycle_contract ON ainuoke_contract_lifecycle_events(source_key,sales_contract_no,version DESC);
CREATE TRIGGER contract_lifecycle_immutable BEFORE UPDATE OR DELETE ON ainuoke_contract_lifecycle_events
 FOR EACH ROW EXECUTE FUNCTION preserve_catalog_receipt();

CREATE FUNCTION guard_contract_lifecycle_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.source_lifecycle_state,NEW.source_deleted_at,NEW.lifecycle_version)
   IS DISTINCT FROM (OLD.source_lifecycle_state,OLD.source_deleted_at,OLD.lifecycle_version) THEN
  IF NEW.lifecycle_version<>OLD.lifecycle_version+1 OR NOT EXISTS (
   SELECT 1 FROM ainuoke_contract_lifecycle_events e
   WHERE e.source_key=NEW.source_key AND e.source_id=NEW.source_id
    AND e.sales_contract_no=NEW.sales_contract_no AND e.version=NEW.lifecycle_version
    AND ((e.event_type='source_deleted' AND NEW.source_lifecycle_state='source_deleted' AND NEW.source_deleted_at=e.confirmed_at)
      OR (e.event_type='source_restored' AND NEW.source_lifecycle_state='present' AND NEW.source_deleted_at IS NULL))
  ) THEN RAISE EXCEPTION 'source lifecycle requires its immutable transition receipt' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER contract_lifecycle_transition BEFORE UPDATE ON ainuoke_catalog_entries
 FOR EACH ROW EXECUTE FUNCTION guard_contract_lifecycle_transition();

-- No SO, production, quote, cost, material, shipment, snapshot or job is changed.
