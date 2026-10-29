-- Unpriced order-month ownership. No historical initialization, price copy,
-- Browser import, period creation, tax default, Source activation or scheduler.
CREATE TABLE server_closing_month_commands (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 command JSONB NOT NULL CHECK(jsonb_typeof(command)='object' AND octet_length(command::text)<=16384),
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=8192),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE server_closing_month_plans (
 sales_order_id UUID PRIMARY KEY REFERENCES sales_orders(id) ON DELETE RESTRICT,
 default_month TEXT CHECK(default_month ~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'),
 source_delivery_date DATE,
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(default_month IS NOT DISTINCT FROM to_char(source_delivery_date,'YYYY-MM'))
);
CREATE TABLE server_closing_month_plan_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 sales_order_id UUID NOT NULL REFERENCES server_closing_month_plans(sales_order_id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0),
 source_quantity NUMERIC CHECK(source_quantity>=0),
 quantity_state TEXT NOT NULL CHECK(quantity_state IN ('ready','unknown','unsupported')),
 source_fingerprint TEXT NOT NULL CHECK(source_fingerprint ~ '^[a-f0-9]{64}$'),
 lines JSONB NOT NULL CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines)<=2000 AND octet_length(lines::text)<=262144),
 action TEXT NOT NULL CHECK(action IN ('initialize','move_months')),
 reason TEXT NOT NULL CHECK(length(reason)<=2000),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID,
 operation_id TEXT NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(sales_order_id,version), UNIQUE(sales_order_id,id,version),
 FOREIGN KEY(actor_id,request_id) REFERENCES server_closing_month_commands(actor_id,request_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((action='initialize')=(request_id IS NULL)),
 CHECK((version=1)=(action='initialize'))
 ,CHECK((quantity_state='unknown')=(source_quantity IS NULL))
 ,CHECK(quantity_state<>'ready' OR (source_quantity<1000000000000 AND scale(source_quantity)<=6))
 ,CHECK(quantity_state<>'unsupported' OR source_quantity>=1000000000000 OR scale(source_quantity)>6)
);
CREATE TABLE server_closing_month_plan_heads (
 sales_order_id UUID PRIMARY KEY REFERENCES server_closing_month_plans(sales_order_id) ON DELETE RESTRICT,
 current_version_id UUID NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 FOREIGN KEY(sales_order_id,current_version_id,version) REFERENCES server_closing_month_plan_versions(sales_order_id,id,version) ON DELETE RESTRICT
);
CREATE FUNCTION require_closing_month_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('zhixu.closing_month_command',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Closing month command context required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION validate_closing_month_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line JSONB; total NUMERIC:=0; ids UUID[]:='{}'; line_id UUID; color UUID; assignment UUID; prior server_closing_month_plan_versions%ROWTYPE;
BEGIN
 SELECT v.* INTO prior FROM server_closing_month_plan_heads h JOIN server_closing_month_plan_versions v ON v.id=h.current_version_id WHERE h.sales_order_id=NEW.sales_order_id;
 IF NEW.version<>COALESCE(prior.version,0)+1 THEN
  RAISE EXCEPTION 'Closing month version must advance once' USING ERRCODE='23514';
 END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(NEW.lines) LOOP
  IF jsonb_typeof(line)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(line))<>5
    OR NOT line ?& ARRAY['id','colorId','assignmentId','month','quantity']
    OR jsonb_typeof(line->'id')<>'string' OR jsonb_typeof(line->'quantity')<>'string'
    OR (line->>'quantity') !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$'
    OR (line->>'quantity')::numeric<=0 OR line->>'quantity' IS DISTINCT FROM trim_scale((line->>'quantity')::numeric)::text
    OR NOT ((jsonb_typeof(line->'month')='null') OR (jsonb_typeof(line->'month')='string' AND line->>'month' ~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'))
    OR jsonb_typeof(line->'colorId') NOT IN ('string','null') OR jsonb_typeof(line->'assignmentId') NOT IN ('string','null') THEN
   RAISE EXCEPTION 'Invalid closing month line' USING ERRCODE='23514';
  END IF;
  line_id:=(line->>'id')::uuid; color:=(line->>'colorId')::uuid; assignment:=(line->>'assignmentId')::uuid;
  IF line_id=ANY(ids) THEN RAISE EXCEPTION 'Duplicate closing month line' USING ERRCODE='23514'; END IF;
  ids:=array_append(ids,line_id); total:=total+(line->>'quantity')::numeric;
  IF color IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales_order_color_identities WHERE sales_order_id=NEW.sales_order_id AND id=color) THEN
   RAISE EXCEPTION 'Closing month color owner mismatch' USING ERRCODE='23514';
  END IF;
  IF assignment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM production_schedule_assignments WHERE sales_order_id=NEW.sales_order_id AND id=assignment AND (color_id IS NULL OR color_id IS NOT DISTINCT FROM color)) THEN
   RAISE EXCEPTION 'Closing month execution owner mismatch' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF (NEW.quantity_state<>'ready' AND jsonb_array_length(NEW.lines)<>0) OR (NEW.quantity_state='ready' AND total<>NEW.source_quantity) THEN
  RAISE EXCEPTION 'Closing month quantities must conserve order quantity' USING ERRCODE='23514';
 END IF;
 IF NEW.action='move_months' THEN
  IF NEW.source_quantity IS DISTINCT FROM prior.source_quantity OR NEW.quantity_state<>prior.quantity_state OR NEW.source_fingerprint<>prior.source_fingerprint THEN
   RAISE EXCEPTION 'Month move cannot replace order source facts' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
   WITH old_scopes AS (SELECT jsonb_build_array(value->'colorId',value->'assignmentId') AS scope,sum((value->>'quantity')::numeric) AS quantity FROM jsonb_array_elements(prior.lines) GROUP BY 1),
        new_scopes AS (SELECT jsonb_build_array(value->'colorId',value->'assignmentId') AS scope,sum((value->>'quantity')::numeric) AS quantity FROM jsonb_array_elements(NEW.lines) GROUP BY 1)
   SELECT 1 FROM old_scopes o FULL JOIN new_scopes n USING(scope) WHERE o.quantity IS DISTINCT FROM n.quantity
  ) THEN
   RAISE EXCEPTION 'Month move must preserve color and execution quantities' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION protect_closing_month_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Closing month head cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.sales_order_id<>OLD.sales_order_id OR NEW.version<>OLD.version+1) THEN
  RAISE EXCEPTION 'Closing month head must advance once' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['server_closing_month_commands','server_closing_month_plans','server_closing_month_plan_versions'] LOOP
  EXECUTE format('CREATE TRIGGER month_history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_server_closing_immutable()',t);
  EXECUTE format('CREATE TRIGGER month_insert_gate BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION require_closing_month_command()',t);
 END LOOP;
END; $$;
CREATE TRIGGER month_version_validation BEFORE INSERT ON server_closing_month_plan_versions FOR EACH ROW EXECUTE FUNCTION validate_closing_month_version();
CREATE TRIGGER month_head_gate BEFORE INSERT OR UPDATE ON server_closing_month_plan_heads FOR EACH ROW EXECUTE FUNCTION require_closing_month_command();
CREATE TRIGGER month_head_forward BEFORE UPDATE OR DELETE ON server_closing_month_plan_heads FOR EACH ROW EXECUTE FUNCTION protect_closing_month_head();
