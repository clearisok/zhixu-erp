-- Explicit physical-order SupplyHub only. No default, seed, Browser import,
-- material date, demand, actual production, price, lifecycle or closing rewrite.
CREATE TABLE production_order_execution_trackings (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 sales_order_id UUID NOT NULL UNIQUE REFERENCES sales_orders(id) ON DELETE RESTRICT,
 supply_hub_id UUID REFERENCES production_supply_hubs(id) ON DELETE RESTRICT,
 hub_snapshot JSONB,
 remark TEXT NOT NULL CHECK(char_length(remark)<=2000),
 version INTEGER NOT NULL CHECK(version>0),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(sales_order_id,id),
 CHECK((supply_hub_id IS NULL)=(hub_snapshot IS NULL)),
 CHECK(hub_snapshot IS NULL OR (jsonb_typeof(hub_snapshot)='object' AND octet_length(hub_snapshot::text)<=16384))
);
CREATE TABLE production_order_execution_tracking_versions (
 tracking_id UUID NOT NULL,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=32768),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 operation_id TEXT NOT NULL CHECK(char_length(operation_id) BETWEEN 1 AND 200),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tracking_id,version),
 FOREIGN KEY(sales_order_id,tracking_id) REFERENCES production_order_execution_trackings(sales_order_id,id) ON DELETE RESTRICT
);
CREATE FUNCTION production_tracking_hub_snapshot(h production_supply_hubs) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('id',h.id::text,'name',h.name,'enabled',h.enabled,'remark',h.remark,'version',h.version);
$$;
CREATE FUNCTION production_order_tracking_row_snapshot(t production_order_execution_trackings) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT to_jsonb(t)||jsonb_build_object('created_by',t.created_by::text,'updated_by',t.updated_by::text);
$$;
CREATE FUNCTION protect_production_order_tracking() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h production_supply_hubs; lifecycle text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'order tracking cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT lifecycle_state INTO lifecycle FROM sales_orders WHERE id=NEW.sales_order_id FOR SHARE;
 IF lifecycle IN ('completed','cancelled') THEN RAISE EXCEPTION 'frozen order tracking is read only' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 OR (NEW.supply_hub_id IS NULL AND NEW.remark='') THEN
   RAISE EXCEPTION 'tracking starts at one with an explicit fact' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.sales_order_id<>OLD.sales_order_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 THEN
   RAISE EXCEPTION 'tracking identity, creation and exact version are protected' USING ERRCODE='23514';
  END IF;
  IF NEW.supply_hub_id IS NOT DISTINCT FROM OLD.supply_hub_id AND NEW.remark=OLD.remark THEN
   RAISE EXCEPTION 'tracking revision requires a business change' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.supply_hub_id IS NOT NULL THEN
  SELECT * INTO h FROM production_supply_hubs WHERE id=NEW.supply_hub_id FOR SHARE;
  IF NOT FOUND OR NEW.hub_snapshot IS DISTINCT FROM production_tracking_hub_snapshot(h) THEN
   RAISE EXCEPTION 'tracking requires exact current hub facts' USING ERRCODE='23514';
  END IF;
  IF NOT h.enabled AND (TG_OP='INSERT' OR NEW.supply_hub_id IS DISTINCT FROM OLD.supply_hub_id) THEN
   RAISE EXCEPTION 'new hub selection must be enabled' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER production_order_tracking_effective BEFORE INSERT OR UPDATE OR DELETE ON production_order_execution_trackings FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER production_order_tracking_guard BEFORE INSERT OR UPDATE OR DELETE ON production_order_execution_trackings FOR EACH ROW EXECUTE FUNCTION protect_production_order_tracking();
CREATE TRIGGER production_order_tracking_revision_effective BEFORE INSERT ON production_order_execution_tracking_versions FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER production_order_tracking_revision_immutable BEFORE UPDATE OR DELETE ON production_order_execution_tracking_versions FOR EACH ROW EXECUTE FUNCTION protect_production_plan_history();
CREATE FUNCTION validate_production_order_tracking_revision_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_row production_order_execution_trackings;
BEGIN
 SELECT * INTO current_row FROM production_order_execution_trackings WHERE id=NEW.tracking_id;
 IF NOT FOUND OR NEW.version<>current_row.version OR NEW.sales_order_id<>current_row.sales_order_id
  OR NEW.actor_id<>current_row.updated_by OR NEW.snapshot IS DISTINCT FROM production_order_tracking_row_snapshot(current_row) THEN
  RAISE EXCEPTION 'tracking revision must record the exact current event and actor' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER production_order_tracking_revision_head BEFORE INSERT ON production_order_execution_tracking_versions FOR EACH ROW EXECUTE FUNCTION validate_production_order_tracking_revision_insert();
CREATE FUNCTION validate_production_order_tracking_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM production_order_execution_tracking_versions v WHERE v.tracking_id=NEW.id AND v.version=NEW.version
  AND v.actor_id=NEW.updated_by AND v.snapshot=production_order_tracking_row_snapshot(NEW)) THEN
  RAISE EXCEPTION 'every tracking event requires its exact immutable revision' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER production_order_tracking_revision_required AFTER INSERT OR UPDATE ON production_order_execution_trackings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_production_order_tracking_revision();
ALTER TABLE production_schedule_commands DROP CONSTRAINT production_schedule_commands_action_check;
ALTER TABLE production_schedule_commands ADD CONSTRAINT production_schedule_commands_action_check CHECK(action IN ('create','update','cancel','replan','record_execution','set_order_tracking'));
