-- Empty-target additive planning. No Browser import, grants, actual completion,
-- customer delivery mutation, prices, currencies or closing allocations.
CREATE TABLE production_schedule_resource_snapshots (
 hash TEXT PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),
 facts JSONB NOT NULL CHECK(jsonb_typeof(facts)='object' AND octet_length(facts::text)<=1048576),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE production_order_plan_heads (
 sales_order_id UUID PRIMARY KEY REFERENCES sales_orders(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0)
);
CREATE TABLE production_group_plan_heads (
 production_group_id UUID PRIMARY KEY REFERENCES production_groups(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0)
);
CREATE TABLE production_schedule_assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 execution_type TEXT NOT NULL CHECK(execution_type IN ('internal','outsource')),
 production_group_id UUID REFERENCES production_groups(id) ON DELETE RESTRICT,
 outsource_factory_id UUID REFERENCES production_outsource_factories(id) ON DELETE RESTRICT,
 color_id UUID,
 color_name_snapshot TEXT,
 planned_quantity NUMERIC NOT NULL CHECK(planned_quantity>=0 AND planned_quantity::text NOT IN ('NaN','Infinity','-Infinity')),
 duration_mode TEXT NOT NULL CHECK(duration_mode IN ('average_daily_output','workdays')),
 daily_output_snapshot NUMERIC NOT NULL CHECK(daily_output_snapshot>=0 AND daily_output_snapshot::text NOT IN ('NaN','Infinity','-Infinity')),
 required_workdays INTEGER NOT NULL CHECK(required_workdays BETWEEN 1 AND 36600),
 date_mode TEXT NOT NULL CHECK(date_mode IN ('auto_queue','manual_fixed')),
 planned_start_date DATE NOT NULL CHECK(planned_start_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 first_production_date DATE,
 planned_end_date DATE NOT NULL CHECK(planned_end_date BETWEEN planned_start_date AND DATE '9999-12-31'),
 non_working_day_count INTEGER CHECK(non_working_day_count BETWEEN 0 AND 36600),
 queue_sequence BIGINT CHECK(queue_sequence BETWEEN 1 AND 9007199254740991),
 resource_snapshot_hash TEXT NOT NULL REFERENCES production_schedule_resource_snapshots(hash) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','cancelled')),
 remark TEXT NOT NULL DEFAULT '' CHECK(length(remark)<=2000),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(sales_order_id,id),
 FOREIGN KEY(sales_order_id,color_id) REFERENCES sales_order_color_identities(sales_order_id,id) ON DELETE RESTRICT,
 CHECK((color_id IS NULL AND color_name_snapshot IS NULL) OR (color_id IS NOT NULL AND color_name_snapshot IS NOT NULL)),
 CHECK(first_production_date IS NULL OR first_production_date BETWEEN planned_start_date AND planned_end_date),
 CHECK((execution_type='internal' AND production_group_id IS NOT NULL AND outsource_factory_id IS NULL AND queue_sequence IS NOT NULL)
    OR (execution_type='outsource' AND production_group_id IS NULL AND outsource_factory_id IS NOT NULL AND queue_sequence IS NULL AND date_mode='manual_fixed')),
 CHECK(duration_mode<>'average_daily_output' OR daily_output_snapshot>0)
);
CREATE INDEX production_schedule_order ON production_schedule_assignments(sales_order_id,created_at,id);
CREATE INDEX production_schedule_queue ON production_schedule_assignments(production_group_id,queue_sequence,created_at,id) WHERE status='planned';
CREATE TABLE production_schedule_plan_versions (
 assignment_id UUID NOT NULL,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 operation_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(reason)<=2000),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(assignment_id,version),
 FOREIGN KEY(sales_order_id,assignment_id) REFERENCES production_schedule_assignments(sales_order_id,id) ON DELETE RESTRICT
);
CREATE TABLE production_schedule_commands (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('create','update','cancel','replan')),
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 command JSONB NOT NULL CHECK(jsonb_typeof(command)='object' AND octet_length(command::text)<=1048576
  AND (command->>'requestId') IS NOT DISTINCT FROM request_id::text AND (command->'intent'->>'action') IS NOT DISTINCT FROM action),
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=1048576
  AND (result->>'requestId') IS NOT DISTINCT FROM request_id::text AND (result->>'status') IS NOT NULL AND result->>'status' IN ('applied','rejected')),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE production_schedule_command_orders (
 actor_id BIGINT NOT NULL,
 request_id UUID NOT NULL,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 PRIMARY KEY(actor_id,request_id,sales_order_id),
 FOREIGN KEY(actor_id,request_id) REFERENCES production_schedule_commands(actor_id,request_id) ON DELETE RESTRICT
);
CREATE FUNCTION protect_production_plan_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'production plan history is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER production_resource_snapshot_immutable BEFORE UPDATE OR DELETE ON production_schedule_resource_snapshots FOR EACH ROW EXECUTE FUNCTION protect_production_plan_history();
CREATE TRIGGER production_plan_revision_immutable BEFORE UPDATE OR DELETE ON production_schedule_plan_versions FOR EACH ROW EXECUTE FUNCTION protect_production_plan_history();
CREATE TRIGGER production_plan_receipt_immutable BEFORE UPDATE OR DELETE ON production_schedule_commands FOR EACH ROW EXECUTE FUNCTION protect_production_plan_history();
CREATE TRIGGER production_plan_scope_immutable BEFORE UPDATE OR DELETE ON production_schedule_command_orders FOR EACH ROW EXECUTE FUNCTION protect_production_plan_history();
CREATE FUNCTION protect_production_plan_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'production plan heads cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR
  (to_jsonb(NEW)-'version') IS DISTINCT FROM (to_jsonb(OLD)-'version')) THEN
  RAISE EXCEPTION 'production plan collection requires exact version increment' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' AND NEW.version<>1 THEN RAISE EXCEPTION 'production plan collection starts at one' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER production_order_plan_head_guard BEFORE INSERT OR UPDATE OR DELETE ON production_order_plan_heads FOR EACH ROW EXECUTE FUNCTION protect_production_plan_head();
CREATE TRIGGER production_group_plan_head_guard BEFORE INSERT OR UPDATE OR DELETE ON production_group_plan_heads FOR EACH ROW EXECUTE FUNCTION protect_production_plan_head();
CREATE FUNCTION protect_production_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'production assignments cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.version<>1 THEN RAISE EXCEPTION 'production assignment starts at one' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.sales_order_id<>OLD.sales_order_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
  OR OLD.status='cancelled' OR NEW.version<>OLD.version+1) THEN
  RAISE EXCEPTION 'production assignment identity or version is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER production_assignment_guard BEFORE INSERT OR UPDATE OR DELETE ON production_schedule_assignments FOR EACH ROW EXECUTE FUNCTION protect_production_assignment();
CREATE FUNCTION production_plan_row_snapshot(a production_schedule_assignments) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT to_jsonb(a)||jsonb_build_object('planned_quantity',a.planned_quantity::text,'daily_output_snapshot',a.daily_output_snapshot::text,'created_by',a.created_by::text,'updated_by',a.updated_by::text);
$$;
CREATE FUNCTION validate_production_plan_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Validate this event, not only the last head at COMMIT. Two updates in one
 -- transaction must retain both exact intermediate versions.
 IF NOT EXISTS(SELECT 1 FROM production_schedule_plan_versions v WHERE v.assignment_id=NEW.id AND v.version=NEW.version AND v.snapshot=production_plan_row_snapshot(NEW)) THEN
  RAISE EXCEPTION 'production assignment requires exact immutable revision' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER production_assignment_revision_required AFTER INSERT OR UPDATE ON production_schedule_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_production_plan_revision();
CREATE FUNCTION validate_production_revision_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_row production_schedule_assignments;
BEGIN
 SELECT * INTO current_row FROM production_schedule_assignments WHERE id=NEW.assignment_id;
 IF NOT FOUND OR NEW.version<>current_row.version OR NEW.sales_order_id<>current_row.sales_order_id OR NEW.snapshot IS DISTINCT FROM production_plan_row_snapshot(current_row) THEN
  RAISE EXCEPTION 'production revision must record the current exact head' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER production_revision_head_required BEFORE INSERT ON production_schedule_plan_versions FOR EACH ROW EXECUTE FUNCTION validate_production_revision_insert();
CREATE TRIGGER production_order_plan_effective BEFORE INSERT OR UPDATE OR DELETE ON production_order_plan_heads FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER production_assignment_effective BEFORE INSERT OR UPDATE OR DELETE ON production_schedule_assignments FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER production_plan_revision_effective BEFORE INSERT ON production_schedule_plan_versions FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER production_plan_scope_effective BEFORE INSERT ON production_schedule_command_orders FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
-- Parent collection fence also covers insertion/deletion of source colors.
-- Normal repository writers take the parent before touching children. Direct
-- old SQL is still blocked before changing a frozen plan's observed facts.
CREATE FUNCTION freeze_production_source_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM lock_order_attribution_write_guard();
 IF TG_OP<>'INSERT' THEN PERFORM id FROM sales_orders WHERE id=OLD.sales_order_id FOR KEY SHARE; END IF;
 IF TG_OP<>'DELETE' THEN PERFORM id FROM sales_orders WHERE id=NEW.sales_order_id FOR KEY SHARE; RETURN NEW; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER production_source_contract_parent BEFORE INSERT OR UPDATE OR DELETE ON ainuoke_sales_order_contract_mirrors FOR EACH ROW EXECUTE FUNCTION freeze_production_source_parent();
CREATE TRIGGER production_source_colors_parent BEFORE INSERT OR UPDATE OR DELETE ON ainuoke_sales_order_color_mirrors FOR EACH ROW EXECUTE FUNCTION freeze_production_source_parent();
CREATE TRIGGER production_source_link_parent BEFORE INSERT OR UPDATE OR DELETE ON sales_order_source_links FOR EACH ROW EXECUTE FUNCTION freeze_production_source_parent();
CREATE TRIGGER production_delivery_set_parent BEFORE INSERT OR UPDATE OR DELETE ON sales_order_delivery_plan_sets FOR EACH ROW EXECUTE FUNCTION freeze_production_source_parent();
CREATE TRIGGER production_delivery_row_parent BEFORE INSERT OR UPDATE OR DELETE ON sales_order_delivery_plans FOR EACH ROW EXECUTE FUNCTION freeze_production_source_parent();
