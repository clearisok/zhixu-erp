-- Source evidence only; never creates or edits a SalesOrder or an inventory ledger.
CREATE TABLE ainuoke_source_profiles (
  source_key TEXT PRIMARY KEY CHECK (source_key ~ '^[a-z][a-z0-9_-]{2,63}$'),
  account_fingerprint TEXT NOT NULL CHECK (account_fingerprint ~ '^[0-9a-f]{64}$'),
  latest_run_id UUID,
  last_error_code TEXT,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE ainuoke_source_runs (
  id UUID PRIMARY KEY,
  source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key) ON DELETE RESTRICT,
  actor_user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  captured_at TIMESTAMPTZ NOT NULL,
  discovery JSONB NOT NULL CHECK (jsonb_typeof(discovery) = 'array'),
  discovery_hash TEXT NOT NULL CHECK (discovery_hash ~ '^[0-9a-f]{64}$'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_key, id)
);
ALTER TABLE ainuoke_source_profiles ADD CONSTRAINT ainuoke_source_latest_run_fk
  FOREIGN KEY (source_key, latest_run_id) REFERENCES ainuoke_source_runs(source_key, id) ON DELETE RESTRICT;
CREATE TABLE ainuoke_material_source_snapshots (
  run_id UUID NOT NULL REFERENCES ainuoke_source_runs(id) ON DELETE RESTRICT,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
  sales_contract_no TEXT NOT NULL CHECK (btrim(sales_contract_no) <> ''),
  snapshots JSONB NOT NULL CHECK (jsonb_typeof(snapshots) = 'array'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (run_id, sales_order_id)
);
CREATE INDEX ainuoke_source_runs_source_created_idx ON ainuoke_source_runs(source_key, created_at DESC);
