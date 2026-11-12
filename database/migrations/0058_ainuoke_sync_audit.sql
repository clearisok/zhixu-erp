-- Additive audit ledger. No source activation, queue replay or business rewrite.
CREATE TABLE ainuoke_sync_audit_batches (
 id UUID PRIMARY KEY, source_key TEXT NOT NULL,
 sync_type TEXT NOT NULL, started_at TIMESTAMPTZ DEFAULT clock_timestamp(),
 reference_at TIMESTAMPTZ, reference_basis TEXT, recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 finished_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'running'
 CHECK(status IN ('running','success','partial','failed','interrupted')),
 capture_ids UUID[] NOT NULL DEFAULT '{}', job_ids UUID[] NOT NULL DEFAULT '{}', contracts TEXT[] NOT NULL DEFAULT '{}', frequencies TEXT[] NOT NULL DEFAULT '{}', policy_snapshot JSONB,
 retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count>=0),
 api_requests INTEGER, login_requests INTEGER, error_code TEXT,
 requests JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(requests)='array' AND jsonb_array_length(requests)<=81),
 origin TEXT NOT NULL DEFAULT 'live' CHECK(origin IN ('live','historical','historical_record')),
 CHECK(origin<>'live' OR started_at IS NOT NULL),
 CHECK(error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,100}$')
);
CREATE INDEX sync_audit_batch_time ON ainuoke_sync_audit_batches((coalesce(started_at,reference_at)) DESC,id DESC);
CREATE INDEX sync_audit_batch_capture ON ainuoke_sync_audit_batches USING gin(capture_ids);
CREATE INDEX sync_audit_batch_contract ON ainuoke_sync_audit_batches USING gin(contracts);
CREATE INDEX sync_audit_batch_status ON ainuoke_sync_audit_batches(status,started_at DESC);
CREATE INDEX sync_audit_batch_type ON ainuoke_sync_audit_batches(sync_type,started_at DESC);
CREATE TABLE ainuoke_sync_audit_tables (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id UUID NOT NULL REFERENCES ainuoke_sync_audit_batches(id),
 report_id TEXT NOT NULL CHECK(report_id ~ '^[0-9]{7}$'), source_name TEXT NOT NULL,
 target_tables TEXT[] NOT NULL DEFAULT '{}', contract_no TEXT NOT NULL DEFAULT '',
 read_started_at TIMESTAMPTZ, read_completed_at TIMESTAMPTZ,
 write_completed_at TIMESTAMPTZ, source_updated_at TIMESTAMPTZ,
 source_time_basis TEXT NOT NULL DEFAULT 'unavailable',
 read_time_basis TEXT NOT NULL DEFAULT 'unavailable',
 fetched_count INTEGER CHECK(fetched_count>=0), inserted_count INTEGER CHECK(inserted_count>=0),
 updated_count INTEGER CHECK(updated_count>=0), unchanged_count INTEGER CHECK(unchanged_count>=0),
 failed_count INTEGER CHECK(failed_count>=0), duplicate_count INTEGER CHECK(duplicate_count>=0),
 api_requests INTEGER, page_count INTEGER, cursor_info JSONB NOT NULL DEFAULT '{}'::jsonb,
 status TEXT NOT NULL DEFAULT 'reading' CHECK(status IN ('reading','acquired','write_pending','success','failed','partial','historical_published')),
 error_code TEXT CHECK(error_code ~ '^[a-z0-9_]{1,100}$'),
 publication_ids TEXT[] NOT NULL DEFAULT '{}', transaction_id TEXT,
 UNIQUE(batch_id,report_id,contract_no),
 CHECK(status<>'success' OR write_completed_at IS NOT NULL)
);
CREATE INDEX sync_audit_table_history ON ainuoke_sync_audit_tables(report_id,read_completed_at DESC,id DESC);
CREATE INDEX sync_audit_table_batch ON ainuoke_sync_audit_tables(batch_id);
CREATE INDEX sync_audit_table_success ON ainuoke_sync_audit_tables(write_completed_at DESC) WHERE status='success';
CREATE TABLE ainuoke_sync_audit_record_state (
 source_key TEXT NOT NULL, report_id TEXT NOT NULL, scope_key TEXT NOT NULL,
 record_key TEXT NOT NULL, content_hash TEXT NOT NULL, batch_id UUID NOT NULL REFERENCES ainuoke_sync_audit_batches(id),
 PRIMARY KEY(source_key,report_id,scope_key,record_key)
);
CREATE TABLE ainuoke_sync_audit_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source_key TEXT NOT NULL,
 batch_id UUID REFERENCES ainuoke_sync_audit_batches(id), occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 event_type TEXT NOT NULL CHECK(event_type IN ('paused','resumed','disabled','enabled','retry','failed','interrupted','authentication')),
 code TEXT CHECK(code ~ '^[a-z0-9_]{1,100}$')
);
CREATE INDEX sync_audit_event_time ON ainuoke_sync_audit_events(occurred_at DESC,id DESC);
CREATE FUNCTION audit_ainuoke_control_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR (NEW.enabled,NEW.paused_reason) IS DISTINCT FROM (OLD.enabled,OLD.paused_reason) THEN
  INSERT INTO ainuoke_sync_audit_events(source_key,event_type,code)
  VALUES(NEW.source_key,CASE WHEN NOT NEW.enabled THEN 'disabled' WHEN NEW.paused_reason IS NOT NULL THEN 'paused'
   WHEN TG_OP='UPDATE' AND OLD.paused_reason IS NOT NULL THEN 'resumed' ELSE 'enabled' END,
   CASE WHEN NEW.paused_reason ~ '^[a-z0-9_]{1,100}$' THEN NEW.paused_reason ELSE NULL END);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_audit_control_transition AFTER INSERT OR UPDATE ON ainuoke_sync_controls
 FOR EACH ROW EXECUTE FUNCTION audit_ainuoke_control_transition();
CREATE FUNCTION audit_ainuoke_job_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch UUID;
BEGIN
 SELECT id INTO batch FROM ainuoke_sync_audit_batches WHERE (CASE WHEN TG_OP='INSERT' THEN coalesce(NEW.retry_of,NEW.id) ELSE NEW.id END)=ANY(job_ids) ORDER BY started_at DESC LIMIT 1;
 IF TG_OP='INSERT' AND NEW.retry_of IS NOT NULL THEN
  INSERT INTO ainuoke_sync_audit_events(source_key,batch_id,event_type,code) VALUES(NEW.source_key,batch,'retry','retry_scheduled');
 ELSIF TG_OP='UPDATE' AND NEW.status IN ('failed','unknown') AND OLD.status IS DISTINCT FROM NEW.status THEN
  INSERT INTO ainuoke_sync_audit_events(source_key,batch_id,event_type,code)
  VALUES(NEW.source_key,batch,CASE WHEN NEW.status='unknown' THEN 'interrupted' ELSE 'failed' END,
   CASE WHEN NEW.result->>'code' ~ '^[a-z0-9_]{1,100}$' THEN NEW.result->>'code' ELSE 'sync_result_unknown' END);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_audit_job_transition AFTER INSERT OR UPDATE ON ainuoke_sync_jobs
 FOR EACH ROW EXECUTE FUNCTION audit_ainuoke_job_transition();
CREATE FUNCTION guard_ainuoke_audit_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'sync audit records cannot be deleted' USING ERRCODE='23514'; END $$;
CREATE TRIGGER sync_audit_batch_no_delete BEFORE DELETE ON ainuoke_sync_audit_batches FOR EACH ROW EXECUTE FUNCTION guard_ainuoke_audit_delete();
CREATE TRIGGER sync_audit_table_no_delete BEFORE DELETE ON ainuoke_sync_audit_tables FOR EACH ROW EXECUTE FUNCTION guard_ainuoke_audit_delete();
CREATE TRIGGER sync_audit_event_no_mutation BEFORE UPDATE OR DELETE ON ainuoke_sync_audit_events FOR EACH ROW EXECUTE FUNCTION guard_ainuoke_audit_delete();
