-- Each retry is a NEW job; completed/failed receipts and old success pointers
-- remain immutable. No worker is activated and no historical jobs are retried.
CREATE TABLE ainuoke_sync_capture_attempts (
 id UUID PRIMARY KEY, source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key),
 account_fingerprint TEXT NOT NULL, actor_id BIGINT NOT NULL REFERENCES app_users(id),
 mode TEXT NOT NULL CHECK(mode IN ('catalog-discovery','catalog-contracts')),
 job_ids UUID[] NOT NULL CHECK(cardinality(job_ids)<=25),
 status TEXT NOT NULL CHECK(status IN ('running','complete','failed')),
 started_at TIMESTAMPTZ NOT NULL, finished_at TIMESTAMPTZ,
 result_code TEXT, metrics JSONB, requests JSONB,
 CHECK(requests IS NULL OR (jsonb_typeof(requests)='array' AND jsonb_array_length(requests)<=81)),
 UNIQUE(source_key,id)
);
CREATE FUNCTION guard_ainuoke_capture_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'running' OR
  (NEW.id,NEW.source_key,NEW.account_fingerprint,NEW.actor_id,NEW.mode,NEW.job_ids,NEW.started_at) IS DISTINCT FROM
  (OLD.id,OLD.source_key,OLD.account_fingerprint,OLD.actor_id,OLD.mode,OLD.job_ids,OLD.started_at) THEN
  RAISE EXCEPTION 'capture attempt is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER sync_capture_guard BEFORE UPDATE OR DELETE ON ainuoke_sync_capture_attempts
 FOR EACH ROW EXECUTE FUNCTION guard_ainuoke_capture_attempt();
ALTER TABLE ainuoke_sync_jobs ADD COLUMN retry_of UUID REFERENCES ainuoke_sync_jobs(id);
ALTER TABLE ainuoke_sync_jobs ADD COLUMN root_job_id UUID REFERENCES ainuoke_sync_jobs(id);
ALTER TABLE ainuoke_sync_jobs ADD COLUMN attempt_number SMALLINT NOT NULL DEFAULT 1 CHECK(attempt_number BETWEEN 1 AND 3);
ALTER TABLE ainuoke_sync_jobs ADD COLUMN available_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE ainuoke_sync_jobs ADD COLUMN capture_attempt_id UUID;
ALTER TABLE ainuoke_sync_jobs ADD CONSTRAINT sync_retry_shape CHECK
 ((retry_of IS NULL AND root_job_id IS NULL AND attempt_number=1) OR
  (retry_of IS NOT NULL AND root_job_id IS NOT NULL AND attempt_number BETWEEN 2 AND 3));
ALTER TABLE ainuoke_sync_jobs ADD CONSTRAINT job_capture_attempt_fk
 FOREIGN KEY(source_key,capture_attempt_id) REFERENCES ainuoke_sync_capture_attempts(source_key,id);
CREATE UNIQUE INDEX sync_retry_once ON ainuoke_sync_jobs(retry_of) WHERE retry_of IS NOT NULL;
CREATE INDEX sync_ready_queue ON ainuoke_sync_jobs(source_key,available_at) WHERE status='queued';
CREATE FUNCTION validate_ainuoke_retry_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p ainuoke_sync_jobs%ROWTYPE;
BEGIN
 IF NEW.retry_of IS NOT NULL THEN
  SELECT * INTO p FROM ainuoke_sync_jobs WHERE id=NEW.retry_of;
  IF NOT FOUND OR p.status<>'failed' OR p.source_key<>NEW.source_key OR p.source_id<>NEW.source_id OR
   p.sales_contract_no<>NEW.sales_contract_no OR NEW.attempt_number<>p.attempt_number+1 OR
   NEW.root_job_id<>coalesce(p.root_job_id,p.id) THEN
   RAISE EXCEPTION 'retry parent mismatch' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER sync_retry_parent BEFORE INSERT ON ainuoke_sync_jobs FOR EACH ROW EXECUTE FUNCTION validate_ainuoke_retry_parent();
ALTER TABLE ainuoke_contract_sync_state ADD COLUMN last_attempt_at TIMESTAMPTZ;
ALTER TABLE ainuoke_contract_sync_state ADD COLUMN last_diagnostic JSONB;
ALTER TABLE ainuoke_sync_controls ADD COLUMN catalog_failure_count SMALLINT NOT NULL DEFAULT 0 CHECK(catalog_failure_count BETWEEN 0 AND 3);
ALTER TABLE ainuoke_sync_controls ADD COLUMN catalog_retry_at TIMESTAMPTZ;
CREATE OR REPLACE FUNCTION guard_ainuoke_sync_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status IN ('complete','failed') THEN
  RAISE EXCEPTION 'source job receipts are immutable' USING ERRCODE='23514';
 END IF;
 IF (NEW.id,NEW.source_key,NEW.source_id,NEW.sales_contract_no,NEW.requested_at,NEW.retry_of,NEW.root_job_id,NEW.attempt_number) IS DISTINCT FROM
    (OLD.id,OLD.source_key,OLD.source_id,OLD.sales_contract_no,OLD.requested_at,OLD.retry_of,OLD.root_job_id,OLD.attempt_number) THEN
  RAISE EXCEPTION 'source job identity is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status<>OLD.status AND NOT ((OLD.status='queued' AND NEW.status IN ('running','failed')) OR
   (OLD.status='running' AND NEW.status IN ('complete','failed','unknown')) OR (OLD.status='unknown' AND NEW.status='failed')) THEN
  RAISE EXCEPTION 'invalid source job transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
