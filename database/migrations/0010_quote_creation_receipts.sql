-- Ordinary desktop creation only; no Intake or historical import/backfill.
CREATE TABLE quote_creation_previews (
  id UUID PRIMARY KEY,
  actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  reviewed JSONB NOT NULL CHECK (jsonb_typeof(reviewed) = 'object'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX quote_creation_previews_actor_idx ON quote_creation_previews(actor_id, expires_at);
CREATE TABLE quote_creation_receipts (
  actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  preview_id UUID NOT NULL REFERENCES quote_creation_previews(id) ON DELETE RESTRICT,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  state TEXT NOT NULL CHECK (state IN ('pending','committed','rejected')),
  result JSONB,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, client_request_id),
  CHECK ((state='committed' AND result IS NOT NULL AND error_code IS NULL)
      OR (state='pending' AND result IS NULL AND error_code IS NULL)
      OR (state='rejected' AND result IS NULL AND error_code IS NOT NULL))
);
