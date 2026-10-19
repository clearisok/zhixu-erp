-- Existing grants and identities are preserved. Only explicit administration changes roles.
ALTER TABLE app_roles ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE app_roles ADD COLUMN version BIGINT NOT NULL DEFAULT 1 CHECK(version > 0);
CREATE TABLE team_admin_receipts (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 command_kind TEXT NOT NULL,
 target_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,request_id)
);
CREATE TRIGGER team_admin_receipts_immutable BEFORE UPDATE OR DELETE ON team_admin_receipts
 FOR EACH ROW EXECUTE FUNCTION reject_operation_log_mutation();

