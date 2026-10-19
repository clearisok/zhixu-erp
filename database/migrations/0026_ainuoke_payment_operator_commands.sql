-- Technical one-shot receipts only. No target/account/source activation or backfill.
CREATE TABLE ainuoke_payment_operator_commands (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK(kind IN ('enable','disable','collect')),
 scope_hash TEXT NOT NULL CHECK(scope_hash ~ '^[a-f0-9]{64}$'),
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 state TEXT NOT NULL CHECK(state IN ('started','completed')),
 result JSONB,
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 completed_at TIMESTAMPTZ,
 PRIMARY KEY(actor_id,request_id),
 CHECK((state='started' AND result IS NULL AND completed_at IS NULL)
   OR (state='completed' AND result IS NOT NULL AND jsonb_typeof(result)='object'
     AND octet_length(result::text)<=65536 AND completed_at IS NOT NULL AND completed_at>=started_at))
);
CREATE FUNCTION protect_payment_operator_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'payment operator receipts cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' AND NEW.state<>'started' THEN
  RAISE EXCEPTION 'payment operator command must start explicitly' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (OLD.state<>'started' OR NEW.state<>'completed'
   OR NEW.actor_id<>OLD.actor_id OR NEW.request_id<>OLD.request_id
   OR NEW.source_key<>OLD.source_key OR NEW.kind<>OLD.kind
   OR NEW.scope_hash<>OLD.scope_hash OR NEW.payload_hash<>OLD.payload_hash
   OR NEW.started_at<>OLD.started_at) THEN
  RAISE EXCEPTION 'payment operator command identity or terminal state is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER payment_operator_command_guard BEFORE INSERT OR UPDATE OR DELETE
 ON ainuoke_payment_operator_commands FOR EACH ROW EXECUTE FUNCTION protect_payment_operator_command();
