-- Server-owned manual expected arrivals. No seed, source-date conversion,
-- Browser migration, inventory event, production, commercial or closing write.
CREATE TABLE material_arrival_demands (
 id UUID PRIMARY KEY,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 canonical_key TEXT NOT NULL CHECK(canonical_key ~ '^material-(fabric|trim)-[a-z0-9]{1,16}$'),
 identity_key TEXT NOT NULL CHECK(identity_key ~ '^[0-9a-f]{64}$'),
 identity JSONB NOT NULL CHECK(jsonb_typeof(identity)='object' AND octet_length(identity::text)<=8192),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(sales_order_id,identity_key), UNIQUE(sales_order_id,id)
);
CREATE TABLE material_arrival_plans (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 canonical_key TEXT NOT NULL CHECK(canonical_key ~ '^material-(fabric|trim)-[a-z0-9]{1,16}$'),
 canonical_identity JSONB NOT NULL CHECK(jsonb_typeof(canonical_identity)='object'),
 supply_hub_id UUID REFERENCES production_supply_hubs(id) ON DELETE RESTRICT,
 source_run_id UUID NOT NULL,
 data JSONB NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=24576),
 version INTEGER NOT NULL CHECK(version>0),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(sales_order_id,canonical_key), UNIQUE(sales_order_id,id),
 FOREIGN KEY(source_run_id,sales_order_id) REFERENCES ainuoke_material_source_snapshots(run_id,sales_order_id) ON DELETE RESTRICT
);
CREATE TABLE material_arrival_plan_versions (
 plan_id UUID NOT NULL,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=32768),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 operation_id TEXT NOT NULL CHECK(char_length(operation_id) BETWEEN 1 AND 200),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(plan_id,version),
 FOREIGN KEY(sales_order_id,plan_id) REFERENCES material_arrival_plans(sales_order_id,id) ON DELETE RESTRICT
);
CREATE TABLE material_arrival_commands (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 command JSONB NOT NULL CHECK(jsonb_typeof(command)='object' AND octet_length(command::text)<=65536),
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=65536),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE material_arrival_command_orders (
 actor_id BIGINT NOT NULL,
 request_id UUID NOT NULL,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 PRIMARY KEY(actor_id,request_id,sales_order_id),
 FOREIGN KEY(actor_id,request_id) REFERENCES material_arrival_commands(actor_id,request_id) ON DELETE RESTRICT
);
CREATE INDEX material_arrival_versions_order_idx ON material_arrival_plan_versions(sales_order_id);
CREATE INDEX material_arrival_commands_order_idx ON material_arrival_command_orders(sales_order_id);
CREATE TRIGGER material_arrival_demand_immutable BEFORE UPDATE OR DELETE ON material_arrival_demands FOR EACH ROW EXECUTE FUNCTION protect_production_plan_history();
CREATE TRIGGER material_arrival_demand_effective BEFORE INSERT ON material_arrival_demands FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER material_arrival_command_immutable BEFORE UPDATE OR DELETE ON material_arrival_commands FOR EACH ROW EXECUTE FUNCTION protect_production_plan_history();
CREATE TRIGGER material_arrival_command_order_immutable BEFORE UPDATE OR DELETE ON material_arrival_command_orders FOR EACH ROW EXECUTE FUNCTION protect_production_plan_history();
CREATE FUNCTION material_arrival_plan_row_snapshot(p material_arrival_plans) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT to_jsonb(p)||jsonb_build_object('created_by',p.created_by::text,'updated_by',p.updated_by::text);
$$;
CREATE FUNCTION protect_material_arrival_plan() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lifecycle text; batch jsonb; allocation jsonb; demand jsonb; amount numeric; capacity numeric; registry material_arrival_demands;
        tracking production_order_execution_trackings; source ainuoke_material_source_snapshots; quantity_text text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'arrival plan cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT lifecycle_state INTO lifecycle FROM sales_orders WHERE id=NEW.sales_order_id FOR SHARE;
 IF lifecycle IN ('completed','cancelled') THEN RAISE EXCEPTION 'frozen arrival plan is read only' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 OR jsonb_array_length(NEW.data->'batches')=0 THEN RAISE EXCEPTION 'arrival starts at one with a manual batch' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.sales_order_id<>OLD.sales_order_id OR NEW.canonical_key<>OLD.canonical_key OR NEW.canonical_identity<>OLD.canonical_identity
   OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 THEN
   RAISE EXCEPTION 'arrival identity, creation and exact version are protected' USING ERRCODE='23514';
  END IF;
  IF NEW.data=OLD.data THEN RAISE EXCEPTION 'arrival revision requires change' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.data->>'dateSource' IS DISTINCT FROM 'manual' OR jsonb_typeof(NEW.data->'batches') IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.data->'demands') IS DISTINCT FROM 'array'
  OR jsonb_array_length(NEW.data->'batches')>100 OR jsonb_array_length(NEW.data->'demands')>200
  OR NEW.data->'source'->>'runId' IS DISTINCT FROM NEW.source_run_id::text THEN
  RAISE EXCEPTION 'invalid arrival evidence' USING ERRCODE='23514';
 END IF;
 SELECT * INTO source FROM ainuoke_material_source_snapshots WHERE run_id=NEW.source_run_id AND sales_order_id=NEW.sales_order_id;
 IF NOT FOUND OR NEW.data->'source'->>'contentHash' IS DISTINCT FROM source.content_hash THEN
  RAISE EXCEPTION 'arrival source evidence mismatch' USING ERRCODE='23514';
 END IF;
 SELECT * INTO tracking FROM production_order_execution_trackings WHERE sales_order_id=NEW.sales_order_id FOR SHARE;
 IF NEW.supply_hub_id IS DISTINCT FROM tracking.supply_hub_id
  OR NEW.data->'tracking'->>'supplyHubId' IS DISTINCT FROM tracking.supply_hub_id::text
  OR NEW.data->'tracking'->>'id' IS DISTINCT FROM tracking.id::text
  OR (NEW.data->'tracking'->>'version')::integer IS DISTINCT FROM tracking.version
  OR NEW.data->'tracking'->'hubSnapshot' IS DISTINCT FROM COALESCE(tracking.hub_snapshot - 'remark','null'::jsonb)
  OR (jsonb_array_length(NEW.data->'batches')>0 AND NEW.supply_hub_id IS NULL) THEN
  RAISE EXCEPTION 'arrival requires exact explicitly persisted hub' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.data->'batches') b GROUP BY b->>'id' HAVING count(*)>1)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.data->'demands') d GROUP BY d->>'id' HAVING count(*)>1) THEN
  RAISE EXCEPTION 'duplicate arrival identity' USING ERRCODE='23514';
 END IF;
 FOR batch IN SELECT * FROM jsonb_array_elements(NEW.data->'batches') LOOP
  IF jsonb_typeof(batch->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(batch->'expectedArrivalAtHubDate') IS DISTINCT FROM 'string' THEN
   RAISE EXCEPTION 'arrival batch identity and date are required' USING ERRCODE='23514';
  END IF;
  PERFORM (batch->>'id')::uuid;
  IF batch->>'expectedArrivalAtHubDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR to_char((batch->>'expectedArrivalAtHubDate')::date,'YYYY-MM-DD')<>batch->>'expectedArrivalAtHubDate'
   OR jsonb_typeof(batch->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(batch->'allocations')=0
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(batch->'allocations') a GROUP BY a->>'materialDemandId' HAVING count(*)>1) THEN
   RAISE EXCEPTION 'invalid arrival batch' USING ERRCODE='23514';
  END IF;
  FOR allocation IN SELECT * FROM jsonb_array_elements(batch->'allocations') LOOP
   quantity_text=allocation->>'quantity';
   IF jsonb_typeof(allocation->'quantity') IS DISTINCT FROM 'string' OR char_length(quantity_text)>128 OR quantity_text !~ '^[0-9]+(\.[0-9]+)?$' OR quantity_text::numeric<=0 THEN
    RAISE EXCEPTION 'arrival allocation must be a positive decimal string' USING ERRCODE='23514';
   END IF;
   SELECT * INTO registry FROM material_arrival_demands WHERE id=(allocation->>'materialDemandId')::uuid;
   IF NOT FOUND OR registry.sales_order_id<>NEW.sales_order_id OR registry.canonical_key<>NEW.canonical_key THEN
    RAISE EXCEPTION 'arrival allocation outside physical order or material' USING ERRCODE='23514';
   END IF;
   SELECT d INTO demand FROM jsonb_array_elements(NEW.data->'demands') d WHERE d->>'id'=registry.id::text;
   IF NOT FOUND OR demand->>'identityKey' IS DISTINCT FROM registry.identity_key OR demand->'identity' IS DISTINCT FROM registry.identity
    OR jsonb_typeof(demand->'unit') IS DISTINCT FROM 'string' OR btrim(demand->>'unit')=''
    OR jsonb_typeof(demand->'requiredQuantity') IS DISTINCT FROM 'string' OR demand->>'requiredQuantity' !~ '^[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'arrival demand evidence mismatch' USING ERRCODE='23514';
   END IF;
   capacity=(demand->>'requiredQuantity')::numeric;
   SELECT sum((a->>'quantity')::numeric) INTO amount FROM jsonb_array_elements(NEW.data->'batches') b,
    LATERAL jsonb_array_elements(b->'allocations') a WHERE a->>'materialDemandId'=registry.id::text;
   IF amount>capacity THEN RAISE EXCEPTION 'arrival allocation exceeds demand' USING ERRCODE='23514'; END IF;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER material_arrival_plan_effective BEFORE INSERT OR UPDATE OR DELETE ON material_arrival_plans FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER material_arrival_plan_guard BEFORE INSERT OR UPDATE OR DELETE ON material_arrival_plans FOR EACH ROW EXECUTE FUNCTION protect_material_arrival_plan();
CREATE TRIGGER material_arrival_revision_effective BEFORE INSERT ON material_arrival_plan_versions FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER material_arrival_revision_immutable BEFORE UPDATE OR DELETE ON material_arrival_plan_versions FOR EACH ROW EXECUTE FUNCTION protect_production_plan_history();
CREATE FUNCTION validate_material_arrival_revision_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_row material_arrival_plans;
BEGIN
 SELECT * INTO current_row FROM material_arrival_plans WHERE id=NEW.plan_id;
 IF NOT FOUND OR NEW.version<>current_row.version OR NEW.sales_order_id<>current_row.sales_order_id
  OR NEW.actor_id<>current_row.updated_by OR NEW.snapshot IS DISTINCT FROM material_arrival_plan_row_snapshot(current_row) THEN
  RAISE EXCEPTION 'arrival revision must record the exact event and actor' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER material_arrival_revision_head BEFORE INSERT ON material_arrival_plan_versions FOR EACH ROW EXECUTE FUNCTION validate_material_arrival_revision_insert();
CREATE FUNCTION validate_material_arrival_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM material_arrival_plan_versions v WHERE v.plan_id=NEW.id AND v.version=NEW.version
  AND v.actor_id=NEW.updated_by AND v.snapshot=material_arrival_plan_row_snapshot(NEW)) THEN
  RAISE EXCEPTION 'every arrival event requires its immutable revision' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER material_arrival_revision_required AFTER INSERT OR UPDATE ON material_arrival_plans DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_material_arrival_revision();
