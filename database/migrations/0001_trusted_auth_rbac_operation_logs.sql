CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- app_users is the single identity source shared with the legacy runtime.
CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'sales', 'planner', 'viewer')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS public_id UUID;
UPDATE app_users SET public_id = gen_random_uuid() WHERE public_id IS NULL;
ALTER TABLE app_users ALTER COLUMN public_id SET DEFAULT gen_random_uuid();
ALTER TABLE app_users ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_public_id_uidx ON app_users(public_id);

CREATE OR REPLACE FUNCTION reject_app_user_public_id_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.public_id IS DISTINCT FROM NEW.public_id THEN
    RAISE EXCEPTION 'app_users.public_id is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_users_public_id_immutable ON app_users;
CREATE TRIGGER app_users_public_id_immutable
BEFORE UPDATE OF public_id ON app_users
FOR EACH ROW EXECUTE FUNCTION reject_app_user_public_id_change();

-- Existing legacy rows remain session_kind=legacy. V1 stores only a SHA-256
-- token digest in the legacy token column and never persists the bearer token.
CREATE TABLE IF NOT EXISTS app_sessions (
  token TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS session_kind TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'app_sessions'::regclass
      AND conname = 'app_sessions_kind_check'
  ) THEN
    ALTER TABLE app_sessions
      ADD CONSTRAINT app_sessions_kind_check CHECK (session_kind IN ('legacy', 'v1'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS app_sessions_v1_lookup_idx
  ON app_sessions(token, expires_at)
  WHERE session_kind = 'v1' AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  succeeded BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_lookup_idx
  ON login_attempts(username, attempted_at DESC);

CREATE TABLE IF NOT EXISTS app_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_permissions (
  key TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_user_roles (
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS app_role_permissions (
  role_id TEXT NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES app_permissions(key) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS app_user_roles_role_idx ON app_user_roles(role_id, user_id);
CREATE INDEX IF NOT EXISTS app_role_permissions_permission_idx
  ON app_role_permissions(permission_key, role_id);

-- This is the formal server OperationLog. It is intentionally separate from
-- legacy audit_logs and carries both a relational actor FK and immutable actor
-- snapshots for historical display.
CREATE TABLE IF NOT EXISTS operation_logs (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  operation_sequence INTEGER NOT NULL DEFAULT 0 CHECK (operation_sequence >= 0),
  actor_user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  actor_public_id UUID NOT NULL,
  actor_name TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  quote_id TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context) = 'object'),
  before_data JSONB,
  after_data JSONB,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(changes) = 'array'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operation_logs_created_idx ON operation_logs(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS operation_logs_operation_idx ON operation_logs(operation_id, operation_sequence);
CREATE INDEX IF NOT EXISTS operation_logs_actor_idx ON operation_logs(actor_public_id, created_at DESC);
CREATE INDEX IF NOT EXISTS operation_logs_entity_idx ON operation_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS operation_logs_quote_idx ON operation_logs(quote_id, created_at DESC) WHERE quote_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_operation_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'operation_logs is append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS operation_logs_append_only ON operation_logs;
CREATE TRIGGER operation_logs_append_only
BEFORE UPDATE OR DELETE ON operation_logs
FOR EACH ROW EXECUTE FUNCTION reject_operation_log_mutation();
