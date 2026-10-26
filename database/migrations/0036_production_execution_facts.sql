-- Add actual execution independently of 0035 planning. No business seed, import, price,
-- source refresh, order lifecycle rewrite, permission grant or closing fact.
-- A pre-existing technical epoch makes first-execution phantoms detectable to
-- old REPEATABLE READ writers. Zero is a fence version, never actual output.
CREATE TABLE production_schedule_execution_epochs (
 assignment_id UUID PRIMARY KEY REFERENCES production_schedule_assignments(id) ON DELETE RESTRICT,
 version BIGINT NOT NULL CHECK(version>=0)
);
INSERT INTO production_schedule_execution_epochs(assignment_id,version) SELECT id,0 FROM production_schedule_assignments;
CREATE FUNCTION protect_production_execution_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (TG_OP='INSERT' AND NEW.version<>0) OR (TG_OP='UPDATE' AND (NEW.assignment_id<>OLD.assignment_id OR NEW.version<>OLD.version+1)) THEN
  RAISE EXCEPTION 'execution fence identity and exact version are protected' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER production_execution_epoch_guard BEFORE INSERT OR UPDATE OR DELETE ON production_schedule_execution_epochs FOR EACH ROW EXECUTE FUNCTION protect_production_execution_epoch();
CREATE FUNCTION initialize_production_execution_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO production_schedule_execution_epochs(assignment_id,version) VALUES(NEW.id,0); RETURN NEW; END $$;
CREATE TRIGGER production_assignment_execution_epoch AFTER INSERT ON production_schedule_assignments FOR EACH ROW EXECUTE FUNCTION initialize_production_execution_epoch();
CREATE TABLE production_schedule_executions (
 assignment_id UUID PRIMARY KEY,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0),
 assignment_version INTEGER NOT NULL CHECK(assignment_version>0),
 attribution JSONB NOT NULL CHECK(jsonb_typeof(attribution)='object' AND octet_length(attribution::text)<=1048576),
 status TEXT NOT NULL CHECK(status IN ('in_progress','completed')),
 completed_quantity NUMERIC NOT NULL CHECK(completed_quantity>=0 AND completed_quantity::text NOT IN ('NaN','Infinity','-Infinity')),
 actual_start_date DATE CHECK(actual_start_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 actual_completed_date DATE CHECK(actual_completed_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(sales_order_id,assignment_id),
 FOREIGN KEY(sales_order_id,assignment_id) REFERENCES production_schedule_assignments(sales_order_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(assignment_id,assignment_version) REFERENCES production_schedule_plan_versions(assignment_id,version) ON DELETE RESTRICT,
 CHECK((status='completed')=(actual_completed_date IS NOT NULL)),
 CHECK(actual_start_date IS NULL OR actual_completed_date IS NULL OR actual_start_date<=actual_completed_date)
);
CREATE INDEX production_execution_order ON production_schedule_executions(sales_order_id,assignment_id);
CREATE TABLE production_schedule_execution_versions (
 assignment_id UUID NOT NULL,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=1048576),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 operation_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(reason)<=2000),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(assignment_id,version),
 FOREIGN KEY(sales_order_id,assignment_id) REFERENCES production_schedule_executions(sales_order_id,assignment_id) ON DELETE RESTRICT
);
CREATE FUNCTION production_execution_attribution(a production_schedule_assignments) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('assignmentId',a.id::text,'orderId',a.sales_order_id::text,'executionType',a.execution_type,
  'productionGroupId',a.production_group_id::text,'outsourceFactoryId',a.outsource_factory_id::text,
  'colorId',a.color_id::text,'colorNameSnapshot',a.color_name_snapshot,'resourceSnapshotHash',a.resource_snapshot_hash);
$$;
CREATE FUNCTION production_execution_row_snapshot(e production_schedule_executions) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT to_jsonb(e)||jsonb_build_object('completed_quantity',e.completed_quantity::text,'created_by',e.created_by::text,'updated_by',e.updated_by::text);
$$;
CREATE FUNCTION protect_production_execution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan production_schedule_assignments;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'production execution cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO plan FROM production_schedule_assignments WHERE id=NEW.assignment_id FOR SHARE;
 IF NOT FOUND OR NEW.sales_order_id<>plan.sales_order_id OR NEW.assignment_version<>plan.version
  OR NEW.attribution IS DISTINCT FROM production_execution_attribution(plan) THEN
  RAISE EXCEPTION 'execution requires the current exact assignment attribution' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' AND (NEW.version<>1 OR plan.status='cancelled') THEN
  RAISE EXCEPTION 'execution starts at one on an uncancelled assignment' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.assignment_id<>OLD.assignment_id OR NEW.sales_order_id<>OLD.sales_order_id
  OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.attribution IS DISTINCT FROM OLD.attribution
  OR NEW.version<>OLD.version+1) THEN
  RAISE EXCEPTION 'execution identity, attribution or version is immutable' USING ERRCODE='23514';
 END IF;
 -- Always Assignment -> epoch. Old RR snapshots fail with 40001 when locking
 -- an epoch changed by the first (or any later) execution event.
 UPDATE production_schedule_execution_epochs SET version=version+1 WHERE assignment_id=NEW.assignment_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'execution fence is missing' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER production_execution_guard BEFORE INSERT OR UPDATE OR DELETE ON production_schedule_executions FOR EACH ROW EXECUTE FUNCTION protect_production_execution();
CREATE TRIGGER production_execution_effective BEFORE INSERT OR UPDATE OR DELETE ON production_schedule_executions FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER production_execution_revision_immutable BEFORE UPDATE OR DELETE ON production_schedule_execution_versions FOR EACH ROW EXECUTE FUNCTION protect_production_plan_history();
CREATE TRIGGER production_execution_revision_effective BEFORE INSERT ON production_schedule_execution_versions FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE FUNCTION validate_production_execution_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE correction boolean := false;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM production_schedule_execution_versions v WHERE v.assignment_id=NEW.assignment_id AND v.version=NEW.version AND v.snapshot=production_execution_row_snapshot(NEW)) THEN
  RAISE EXCEPTION 'every execution event requires its exact immutable revision' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN
  correction := NEW.completed_quantity<OLD.completed_quantity
   OR (OLD.actual_start_date IS NOT NULL AND NEW.actual_start_date IS DISTINCT FROM OLD.actual_start_date)
   OR (OLD.actual_completed_date IS NOT NULL AND NEW.actual_completed_date IS DISTINCT FROM OLD.actual_completed_date)
   OR (OLD.status='completed' AND NEW.status<>'completed');
 END IF;
 IF correction OR EXISTS(SELECT 1 FROM production_schedule_assignments WHERE id=NEW.assignment_id AND status='cancelled') THEN
  IF NOT EXISTS(SELECT 1 FROM production_schedule_execution_versions WHERE assignment_id=NEW.assignment_id AND version=NEW.version AND length(btrim(reason))>0) THEN
   RAISE EXCEPTION 'execution correction requires a recorded reason' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER production_execution_revision_required AFTER INSERT OR UPDATE ON production_schedule_executions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_production_execution_revision();
CREATE FUNCTION validate_production_execution_revision_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_row production_schedule_executions;
BEGIN
 SELECT * INTO current_row FROM production_schedule_executions WHERE assignment_id=NEW.assignment_id;
 IF NOT FOUND OR NEW.version<>current_row.version OR NEW.sales_order_id<>current_row.sales_order_id OR NEW.snapshot IS DISTINCT FROM production_execution_row_snapshot(current_row) THEN
  RAISE EXCEPTION 'execution revision must record the exact current event' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER production_execution_revision_head_required BEFORE INSERT ON production_schedule_execution_versions FOR EACH ROW EXECUTE FUNCTION validate_production_execution_revision_insert();
CREATE FUNCTION protect_executed_production_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM version FROM production_schedule_execution_epochs WHERE assignment_id=OLD.id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'execution fence is missing' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM production_schedule_executions WHERE assignment_id=OLD.id) THEN
  IF production_execution_attribution(NEW) IS DISTINCT FROM production_execution_attribution(OLD) THEN
   RAISE EXCEPTION 'executed assignment attribution and adopted resource facts are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.date_mode='auto_queue' AND (NEW.planned_start_date IS DISTINCT FROM OLD.planned_start_date
   OR NEW.first_production_date IS DISTINCT FROM OLD.first_production_date OR NEW.planned_end_date IS DISTINCT FROM OLD.planned_end_date
   OR NEW.non_working_day_count IS DISTINCT FROM OLD.non_working_day_count) THEN
   RAISE EXCEPTION 'executed assignment dates cannot move automatically' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER production_executed_assignment_guard BEFORE UPDATE ON production_schedule_assignments FOR EACH ROW EXECUTE FUNCTION protect_executed_production_assignment();
CREATE FUNCTION validate_executed_production_plan_reason() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM production_schedule_executions WHERE assignment_id=NEW.id) AND NOT EXISTS(
  SELECT 1 FROM production_schedule_plan_versions WHERE assignment_id=NEW.id AND version=NEW.version AND length(btrim(reason))>0
 ) THEN RAISE EXCEPTION 'changing an executed plan requires a recorded reason' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER production_executed_plan_reason AFTER UPDATE ON production_schedule_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_executed_production_plan_reason();
ALTER TABLE production_schedule_commands DROP CONSTRAINT production_schedule_commands_action_check;
ALTER TABLE production_schedule_commands ADD CONSTRAINT production_schedule_commands_action_check CHECK(action IN ('create','update','cancel','replan','record_execution'));
