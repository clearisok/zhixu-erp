-- DB-only target configuration receipts. No target seed, backfill or activation.
CREATE TABLE ainuoke_garment_target_commands (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 source_key TEXT NOT NULL CHECK(source_key ~ '^[a-z][a-z0-9_-]{2,63}$'),
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 source_owner_order_id UUID REFERENCES sales_orders(id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('enable','disable')),
 scope_hash TEXT NOT NULL CHECK(scope_hash ~ '^[a-f0-9]{64}$'),
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 expires_at TIMESTAMPTZ NOT NULL,
 scope JSONB NOT NULL CHECK(jsonb_typeof(scope)='object' AND octet_length(scope::text)<=16384),
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=4096),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,request_id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '10 minutes'),
 CHECK((action='enable')=(source_owner_order_id IS NOT NULL)),
 CHECK(COALESCE(scope->>'schemaVersion'='ainuoke-garment-target-scope.v1'
   AND scope->>'sourceKey'=source_key AND scope->>'salesOrderId'=sales_order_id::text AND scope->>'action'=action
   AND scope->'actor'->>'internalUserId'=actor_id::text
   AND (action='disable' OR scope->'binding'->>'sourceOwnerOrderId'=source_owner_order_id::text),false)),
 CHECK(COALESCE(result->>'schemaVersion'='ainuoke-garment-target-outcome.v1' AND result->>'action'=action
   AND (result->>'enabled')::boolean=(action='enable') AND jsonb_typeof(result->'changed')='boolean'
   AND (result->>'version')::integer>=0 AND result->>'sourceRead'='none' AND (result->>'snapshotsPublished')::integer=0,false))
);
CREATE INDEX garment_target_commands_order_idx ON ainuoke_garment_target_commands(sales_order_id,source_key);
CREATE INDEX garment_target_commands_owner_idx ON ainuoke_garment_target_commands(source_owner_order_id) WHERE source_owner_order_id IS NOT NULL;
CREATE FUNCTION protect_garment_target_command() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target ainuoke_garment_shipment_targets;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'garment target receipts are immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO target FROM ainuoke_garment_shipment_targets WHERE source_key=NEW.source_key AND sales_order_id=NEW.sales_order_id FOR SHARE;
 IF NEW.action='enable' THEN
  PERFORM require_effective_order_write_owner(NEW.sales_order_id);
  IF target.source_key IS NULL OR NOT target.enabled OR target.version::text IS DISTINCT FROM NEW.result->>'version'
   OR target.account_fingerprint IS DISTINCT FROM NEW.scope->'desired'->>'accountFingerprint'
   OR target.verification_sha256 IS DISTINCT FROM NEW.scope->'desired'->>'verificationSha256'
   OR target.freshness_ms::text IS DISTINCT FROM NEW.scope->'desired'->>'freshnessMs'
  THEN RAISE EXCEPTION 'exact enabled garment target receipt required' USING ERRCODE='23514'; END IF;
 ELSIF target.source_key IS NULL THEN
  IF NEW.result->>'version' IS DISTINCT FROM '0' OR NEW.result->>'changed' IS DISTINCT FROM 'false'
  THEN RAISE EXCEPTION 'exact absent garment target receipt required' USING ERRCODE='23514'; END IF;
 ELSIF target.enabled OR target.version::text IS DISTINCT FROM NEW.result->>'version' THEN
  RAISE EXCEPTION 'exact disabled garment target receipt required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER garment_target_command_guard BEFORE INSERT OR UPDATE OR DELETE ON ainuoke_garment_target_commands
 FOR EACH ROW EXECUTE FUNCTION protect_garment_target_command();
