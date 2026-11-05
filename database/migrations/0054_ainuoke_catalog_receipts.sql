CREATE TABLE ainuoke_catalog_requests (
 source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key), request_id UUID NOT NULL,
 actor_id BIGINT NOT NULL REFERENCES app_users(id), account_fingerprint TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('running','complete','failed','unknown')),
 result JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
 PRIMARY KEY(source_key,request_id)
);
CREATE UNIQUE INDEX ainuoke_catalog_request_inflight ON ainuoke_catalog_requests(source_key) WHERE status IN ('running','unknown');
CREATE FUNCTION guard_ainuoke_catalog_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status IN ('complete','failed') THEN
  RAISE EXCEPTION 'catalogue request receipts are immutable' USING ERRCODE='23514';
 END IF;
 IF (NEW.source_key,NEW.request_id,NEW.actor_id,NEW.account_fingerprint,NEW.created_at) IS DISTINCT FROM
    (OLD.source_key,OLD.request_id,OLD.actor_id,OLD.account_fingerprint,OLD.created_at) THEN
  RAISE EXCEPTION 'catalogue request identity is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status<>OLD.status AND NOT (NEW.status IN ('complete','failed','unknown') AND OLD.status IN ('running','unknown')) THEN
  RAISE EXCEPTION 'invalid catalogue request transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER catalog_request_guard BEFORE UPDATE OR DELETE ON ainuoke_catalog_requests FOR EACH ROW EXECUTE FUNCTION guard_ainuoke_catalog_request();
CREATE TABLE ainuoke_catalog_intake_receipts (
 actor_id BIGINT NOT NULL REFERENCES app_users(id), request_id UUID NOT NULL,
 payload_hash TEXT NOT NULL, result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,request_id)
);
CREATE TRIGGER catalogue_intake_receipt_immutable BEFORE UPDATE OR DELETE ON ainuoke_catalog_intake_receipts FOR EACH ROW EXECUTE FUNCTION preserve_catalog_receipt();
CREATE FUNCTION guard_ainuoke_sync_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status IN ('complete','failed') THEN
  RAISE EXCEPTION 'source job receipts are immutable' USING ERRCODE='23514';
 END IF;
 IF (NEW.id,NEW.source_key,NEW.source_id,NEW.sales_contract_no,NEW.requested_at) IS DISTINCT FROM
    (OLD.id,OLD.source_key,OLD.source_id,OLD.sales_contract_no,OLD.requested_at) THEN
  RAISE EXCEPTION 'source job identity is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status<>OLD.status AND NOT ((OLD.status='queued' AND NEW.status IN ('running','failed')) OR
   (OLD.status='running' AND NEW.status IN ('complete','failed','unknown')) OR (OLD.status='unknown' AND NEW.status='failed')) THEN
  RAISE EXCEPTION 'invalid source job transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER sync_job_guard BEFORE UPDATE OR DELETE ON ainuoke_sync_jobs FOR EACH ROW EXECUTE FUNCTION guard_ainuoke_sync_job();
