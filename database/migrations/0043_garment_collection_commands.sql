-- Durable technical commands only. No target seed/activation, backfill or Source IO.
CREATE TABLE ainuoke_garment_collection_commands (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 source_key TEXT NOT NULL,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 source_owner_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 scope_hash TEXT NOT NULL CHECK(scope_hash ~ '^[a-f0-9]{64}$'),
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 expires_at TIMESTAMPTZ NOT NULL,
 scope JSONB NOT NULL CHECK(jsonb_typeof(scope)='object' AND octet_length(scope::text)<=16384),
 state TEXT NOT NULL CHECK(state IN ('started','completed')),
 publication_id UUID,
 result JSONB,
 started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 completed_at TIMESTAMPTZ,
 PRIMARY KEY(actor_id,request_id),
 FOREIGN KEY(source_key,sales_order_id) REFERENCES ainuoke_garment_shipment_targets(source_key,sales_order_id) ON DELETE RESTRICT,
 FOREIGN KEY(source_key,sales_order_id,publication_id) REFERENCES ainuoke_garment_shipment_snapshots(source_key,sales_order_id,id) ON DELETE RESTRICT,
 CHECK(expires_at>started_at AND expires_at<=started_at+interval '10 minutes'),
 CHECK(COALESCE(scope->>'schemaVersion'='ainuoke-garment-collection-scope.v1'
   AND scope->'context'->>'sourceKey'=source_key AND scope->'context'->>'salesOrderId'=sales_order_id::text
   AND scope->'context'->>'sourceOwnerOrderId'=source_owner_order_id::text,false)),
 CHECK((state='started' AND result IS NULL AND publication_id IS NULL AND completed_at IS NULL)
   OR (state='completed' AND result IS NOT NULL AND jsonb_typeof(result)='object' AND octet_length(result::text)<=16384
     AND completed_at IS NOT NULL AND completed_at>=started_at
     AND COALESCE(result->>'schemaVersion'='ainuoke-garment-collection-outcome.v1',false)
     AND ((publication_id IS NOT NULL AND COALESCE(result->>'outcome'='published'
       AND result->>'publicationId'=publication_id::text,false))
       OR (publication_id IS NULL AND COALESCE(result->>'outcome'='not_published',false)))))
);
CREATE FUNCTION protect_garment_collection_command() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE published ainuoke_garment_shipment_snapshots;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'garment collection commands cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'started' THEN RAISE EXCEPTION 'garment collection must start explicitly' USING ERRCODE='23514'; END IF;
  PERFORM require_effective_order_write_owner(NEW.sales_order_id);
 ELSE
  IF OLD.state<>'started' OR NEW.state<>'completed' OR NEW.actor_id<>OLD.actor_id OR NEW.request_id<>OLD.request_id
   OR NEW.source_key<>OLD.source_key OR NEW.sales_order_id<>OLD.sales_order_id OR NEW.source_owner_order_id<>OLD.source_owner_order_id
   OR NEW.scope_hash<>OLD.scope_hash OR NEW.payload_hash<>OLD.payload_hash OR NEW.expires_at<>OLD.expires_at OR NEW.scope IS DISTINCT FROM OLD.scope
   OR NEW.started_at<>OLD.started_at
  THEN RAISE EXCEPTION 'garment collection identity and terminal result are immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.publication_id IS NOT NULL THEN
  SELECT * INTO published FROM ainuoke_garment_shipment_snapshots WHERE id=NEW.publication_id;
  IF NOT FOUND OR published.source_key<>NEW.source_key OR published.sales_order_id<>NEW.sales_order_id
   OR published.source_owner_order_id<>NEW.source_owner_order_id OR published.actor_id<>NEW.actor_id
   OR published.publication_context IS DISTINCT FROM NEW.scope->'context'
   OR published.snapshot_id IS DISTINCT FROM NEW.result->>'snapshotId'
   OR published.generation::text IS DISTINCT FROM NEW.result->>'generation'
  THEN RAISE EXCEPTION 'exact garment publication receipt required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER garment_collection_command_guard BEFORE INSERT OR UPDATE OR DELETE ON ainuoke_garment_collection_commands
 FOR EACH ROW EXECUTE FUNCTION protect_garment_collection_command();
