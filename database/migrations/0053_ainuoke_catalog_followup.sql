-- A searchable Source catalogue is evidence, not a second SalesOrder ledger.
-- Merely observing a contract never creates an SO, quote, plan or closing month.
CREATE TABLE ainuoke_catalog_runs (
 id UUID PRIMARY KEY, source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key),
 account_fingerprint TEXT NOT NULL, request_id UUID NOT NULL,
 actor_user_id BIGINT NOT NULL REFERENCES app_users(id), captured_at TIMESTAMPTZ NOT NULL,
 discovery JSONB NOT NULL CHECK(jsonb_typeof(discovery)='array'),
 content_hash TEXT NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(source_key,request_id), UNIQUE(source_key,id)
);
ALTER TABLE ainuoke_source_profiles ADD COLUMN catalog_run_id UUID;
ALTER TABLE ainuoke_source_profiles ADD CONSTRAINT ainuoke_catalog_head_fk
 FOREIGN KEY(source_key,catalog_run_id) REFERENCES ainuoke_catalog_runs(source_key,id);
CREATE TABLE ainuoke_catalog_entries (
 source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key), source_id TEXT NOT NULL,
 sales_contract_no TEXT NOT NULL, inside_order_no TEXT NOT NULL, style_no TEXT NOT NULL,
 customer_name TEXT, brand_name TEXT, quantity NUMERIC, contract_date TEXT, delivery_date TEXT,
 lifecycle_status_raw TEXT NOT NULL, visible BOOLEAN NOT NULL DEFAULT true,
 observed_run_id UUID NOT NULL, PRIMARY KEY(source_key,source_id), UNIQUE(source_key,sales_contract_no),
 FOREIGN KEY(source_key,observed_run_id) REFERENCES ainuoke_catalog_runs(source_key,id)
);
CREATE INDEX ainuoke_catalog_browse_idx ON ainuoke_catalog_entries(source_key,visible,sales_contract_no);
CREATE TABLE ainuoke_order_followups (
 sales_order_id UUID PRIMARY KEY REFERENCES sales_orders(id),
 mode TEXT NOT NULL CHECK(mode IN ('active','history')), version INTEGER NOT NULL CHECK(version>0),
 updated_by BIGINT NOT NULL REFERENCES app_users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ainuoke_followup_receipts (
 actor_user_id BIGINT NOT NULL REFERENCES app_users(id), request_id UUID NOT NULL,
 request_hash TEXT NOT NULL, result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_user_id,request_id)
);
-- Per-order publication pointers reuse the existing immutable run/snapshot tables.
CREATE TABLE ainuoke_material_order_heads (
 source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key),
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id), run_id UUID,
 last_error_code TEXT, last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(source_key,sales_order_id),
 FOREIGN KEY(run_id,sales_order_id) REFERENCES ainuoke_material_source_snapshots(run_id,sales_order_id),
 FOREIGN KEY(source_key,run_id) REFERENCES ainuoke_source_runs(source_key,id)
);
INSERT INTO ainuoke_material_order_heads(source_key,sales_order_id,run_id,last_error_code,last_attempt_at)
 SELECT p.source_key,s.sales_order_id,p.latest_run_id,p.last_error_code,p.last_attempt_at
 FROM ainuoke_source_profiles p JOIN ainuoke_material_source_snapshots s ON s.run_id=p.latest_run_id;
CREATE FUNCTION preserve_catalog_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'source catalogue evidence and receipts are immutable' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER catalog_run_immutable BEFORE UPDATE OR DELETE ON ainuoke_catalog_runs FOR EACH ROW EXECUTE FUNCTION preserve_catalog_receipt();
CREATE TRIGGER followup_receipt_immutable BEFORE UPDATE OR DELETE ON ainuoke_followup_receipts FOR EACH ROW EXECUTE FUNCTION preserve_catalog_receipt();
CREATE TABLE ainuoke_material_group_requests (
 actor_user_id BIGINT NOT NULL REFERENCES app_users(id), request_id UUID NOT NULL,
 source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key), request_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('running','complete','failed')), result JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(actor_user_id,request_id)
);
-- No automatic activation on migration. A separately operated worker owns IO.
CREATE TABLE ainuoke_sync_controls (
 source_key TEXT PRIMARY KEY REFERENCES ainuoke_source_profiles(source_key),
 enabled BOOLEAN NOT NULL DEFAULT false, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 policy JSONB NOT NULL CHECK(jsonb_typeof(policy)='object'),
 operator_id BIGINT NOT NULL REFERENCES app_users(id), paused_reason TEXT,
 heartbeat_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ainuoke_sync_jobs (
 id UUID PRIMARY KEY, source_key TEXT NOT NULL, source_id TEXT NOT NULL,
 sales_contract_no TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('manual','automatic')),
 status TEXT NOT NULL CHECK(status IN ('queued','running','complete','failed','unknown')),
 requested_by BIGINT NOT NULL REFERENCES app_users(id),
 scheduled_slot TIMESTAMPTZ, requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, result JSONB,
 FOREIGN KEY(source_key,source_id) REFERENCES ainuoke_catalog_entries(source_key,source_id),
 UNIQUE(source_key,source_id,id)
);
CREATE UNIQUE INDEX ainuoke_sync_job_inflight ON ainuoke_sync_jobs(source_key,source_id)
 WHERE status IN ('queued','running','unknown');
CREATE INDEX ainuoke_sync_queue ON ainuoke_sync_jobs(source_key,status,kind,requested_at);
CREATE TABLE ainuoke_sync_requests (
 actor_id BIGINT NOT NULL REFERENCES app_users(id), request_id UUID NOT NULL,
 payload_hash TEXT NOT NULL, job_id UUID NOT NULL REFERENCES ainuoke_sync_jobs(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,request_id)
);
CREATE TRIGGER sync_request_immutable BEFORE UPDATE OR DELETE ON ainuoke_sync_requests FOR EACH ROW EXECUTE FUNCTION preserve_catalog_receipt();
CREATE TABLE ainuoke_contract_observations (
 id UUID PRIMARY KEY, source_key TEXT NOT NULL, source_id TEXT NOT NULL,
 job_id UUID NOT NULL UNIQUE, captured_at TIMESTAMPTZ NOT NULL,
 evidence JSONB NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 content_hash TEXT NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 FOREIGN KEY(source_key,source_id,job_id) REFERENCES ainuoke_sync_jobs(source_key,source_id,id),
 UNIQUE(source_key,source_id,id)
);
CREATE TRIGGER contract_observation_immutable BEFORE UPDATE OR DELETE ON ainuoke_contract_observations FOR EACH ROW EXECUTE FUNCTION preserve_catalog_receipt();
CREATE TABLE ainuoke_contract_sync_state (
 source_key TEXT NOT NULL, source_id TEXT NOT NULL, observation_id UUID,
 last_success_at TIMESTAMPTZ, last_automatic_attempt_at TIMESTAMPTZ, last_error_code TEXT,
 PRIMARY KEY(source_key,source_id),
 FOREIGN KEY(source_key,source_id) REFERENCES ainuoke_catalog_entries(source_key,source_id),
 FOREIGN KEY(source_key,source_id,observation_id) REFERENCES ainuoke_contract_observations(source_key,source_id,id)
);
