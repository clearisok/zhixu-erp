-- Empty additive Server closing schema. No Browser import, seed, backfill or live activation.
CREATE TABLE server_closing_commands (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('create_period','create_allocation','update_allocation','review_allocation','void_allocation','confirm_period','unconfirm_period','lock_period','reopen_period')),
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 command JSONB NOT NULL CHECK(jsonb_typeof(command)='object' AND octet_length(command::text)<=16384),
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=8192),
 required_permissions TEXT[] NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE server_closing_periods (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 month TEXT NOT NULL UNIQUE CHECK(month ~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE server_closing_period_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 period_id UUID NOT NULL REFERENCES server_closing_periods(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0),
 status TEXT NOT NULL CHECK(status IN ('open','confirmed','locked')),
 tax_rate_percent NUMERIC NOT NULL CHECK(tax_rate_percent BETWEEN 0 AND 100 AND scale(tax_rate_percent)<=6),
 remark TEXT NOT NULL CHECK(length(remark)<=2000),
 allocation_manifest JSONB CHECK(allocation_manifest IS NULL OR (jsonb_typeof(allocation_manifest)='array' AND jsonb_array_length(allocation_manifest)<=5000 AND octet_length(allocation_manifest::text)<=1048576)),
 actor_id BIGINT NOT NULL,
 actor_name TEXT NOT NULL CHECK(length(actor_name)<=2000),
 request_id UUID NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('create_period','allocation_change','confirm_period','unconfirm_period','lock_period','reopen_period')),
 reason TEXT NOT NULL CHECK(length(reason)<=2000),
 operation_id TEXT NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(period_id,version), UNIQUE(period_id,id,version),
 FOREIGN KEY(actor_id,request_id) REFERENCES server_closing_commands(actor_id,request_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((status='open')=(allocation_manifest IS NULL))
);
CREATE TABLE server_closing_period_heads (
 period_id UUID PRIMARY KEY REFERENCES server_closing_periods(id) ON DELETE RESTRICT,
 current_version_id UUID NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 FOREIGN KEY(period_id,current_version_id,version) REFERENCES server_closing_period_versions(period_id,id,version) ON DELETE RESTRICT
);
CREATE TABLE server_closing_allocations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 period_id UUID NOT NULL REFERENCES server_closing_periods(id) ON DELETE RESTRICT,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,period_id,sales_order_id)
);
CREATE TABLE server_closing_allocation_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 allocation_id UUID NOT NULL,
 period_id UUID NOT NULL,
 sales_order_id UUID NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 status TEXT NOT NULL CHECK(status IN ('active','voided')),
 commercial_version_id UUID NOT NULL,
 color_id UUID,
 assignment_id UUID,
 assignment_version INTEGER,
 execution_version INTEGER,
 review_assignment_version INTEGER,
 review_execution_version INTEGER,
 quantity NUMERIC NOT NULL CHECK(quantity>0 AND quantity<1000000000000 AND scale(quantity)<=6),
 include_sales BOOLEAN NOT NULL,
 include_work BOOLEAN NOT NULL,
 sale_price NUMERIC,
 work_price NUMERIC,
 tax_rate_percent NUMERIC NOT NULL CHECK(tax_rate_percent BETWEEN 0 AND 100 AND scale(tax_rate_percent)<=6),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=131072),
 actor_id BIGINT NOT NULL,
 actor_name TEXT NOT NULL CHECK(length(actor_name)<=2000),
 request_id UUID NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('create_allocation','update_allocation','review_allocation','void_allocation')),
 reason TEXT NOT NULL CHECK(length(reason)<=2000),
 operation_id TEXT NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(allocation_id,version), UNIQUE(allocation_id,id,version),
 FOREIGN KEY(allocation_id,period_id,sales_order_id) REFERENCES server_closing_allocations(id,period_id,sales_order_id) ON DELETE RESTRICT,
 FOREIGN KEY(sales_order_id,commercial_version_id) REFERENCES sales_order_commercial_versions(sales_order_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(sales_order_id,color_id) REFERENCES sales_order_color_identities(sales_order_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(sales_order_id,assignment_id) REFERENCES production_schedule_assignments(sales_order_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(assignment_id,assignment_version) REFERENCES production_schedule_plan_versions(assignment_id,version) ON DELETE RESTRICT,
 FOREIGN KEY(assignment_id,execution_version) REFERENCES production_schedule_execution_versions(assignment_id,version) ON DELETE RESTRICT,
 FOREIGN KEY(assignment_id,review_assignment_version) REFERENCES production_schedule_plan_versions(assignment_id,version) ON DELETE RESTRICT,
 FOREIGN KEY(assignment_id,review_execution_version) REFERENCES production_schedule_execution_versions(assignment_id,version) ON DELETE RESTRICT,
 FOREIGN KEY(actor_id,request_id) REFERENCES server_closing_commands(actor_id,request_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(include_sales OR include_work),
 CHECK((assignment_id IS NULL AND assignment_version IS NULL AND execution_version IS NULL AND review_assignment_version IS NULL AND review_execution_version IS NULL)
   OR (assignment_id IS NOT NULL AND assignment_version>0 AND review_assignment_version>0)),
 CHECK((include_sales AND sale_price>=0 AND sale_price::text NOT IN ('NaN','Infinity','-Infinity')) OR (NOT include_sales AND sale_price IS NULL)),
 CHECK((include_work AND work_price>=0 AND work_price::text NOT IN ('NaN','Infinity','-Infinity')) OR (NOT include_work AND work_price IS NULL)),
 CHECK(COALESCE(snapshot->>'schemaVersion'='server-closing-allocation.v1'
   AND snapshot->'order'->>'id'=sales_order_id::text
   AND snapshot->'commercial'->>'id'=commercial_version_id::text
   AND snapshot->>'quantity'=quantity::text
   AND (snapshot->>'colorId') IS NOT DISTINCT FROM color_id::text
   AND (snapshot->>'assignmentId') IS NOT DISTINCT FROM assignment_id::text
   AND snapshot->'channels'->>'sales'=include_sales::text AND snapshot->'channels'->>'work'=include_work::text
   AND snapshot->>'taxRatePercent'=tax_rate_percent::text
   AND (snapshot->'prices' ? 'sale')=include_sales AND (snapshot->'prices' ? 'work')=include_work
   AND (NOT include_sales OR (snapshot->'prices'->'sale'->>'currency'='CNY' AND snapshot->'prices'->'sale'->>'price'=sale_price::text AND snapshot->'order'->>'businessType'='ainuoke_contract'))
   AND (NOT include_work OR (snapshot->'prices'->'work'->>'currency'='USD' AND snapshot->'prices'->'work'->>'price'=work_price::text))
   AND jsonb_typeof(snapshot->'productionBasis')='array' AND jsonb_array_length(snapshot->'productionBasis')<=1
   AND jsonb_typeof(snapshot->'reviewBasis')='array' AND jsonb_array_length(snapshot->'reviewBasis')<=1
   AND (snapshot->'productionBasis'->0->>'assignmentVersion') IS NOT DISTINCT FROM assignment_version::text
   AND (snapshot->'productionBasis'->0->'execution'->>'version') IS NOT DISTINCT FROM execution_version::text
   AND (snapshot->'reviewBasis'->0->>'assignmentVersion') IS NOT DISTINCT FROM review_assignment_version::text
   AND (snapshot->'reviewBasis'->0->'execution'->>'version') IS NOT DISTINCT FROM review_execution_version::text,false))
);
CREATE INDEX server_closing_allocation_period ON server_closing_allocations(period_id,created_at,id);
CREATE INDEX server_closing_allocation_order ON server_closing_allocations(sales_order_id,period_id);
CREATE TABLE server_closing_allocation_heads (
 allocation_id UUID PRIMARY KEY REFERENCES server_closing_allocations(id) ON DELETE RESTRICT,
 current_version_id UUID NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 FOREIGN KEY(allocation_id,current_version_id,version) REFERENCES server_closing_allocation_versions(allocation_id,id,version) ON DELETE RESTRICT
);

CREATE FUNCTION require_server_closing_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('zhixu.closing_command',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Server closing command context required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION protect_server_closing_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Server closing history and identity are immutable' USING ERRCODE='23514'; END; $$;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['server_closing_commands','server_closing_periods','server_closing_period_versions','server_closing_allocations','server_closing_allocation_versions'] LOOP
  EXECUTE format('CREATE TRIGGER closing_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_server_closing_immutable()',t);
  EXECUTE format('CREATE TRIGGER closing_insert_gate BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION require_server_closing_command()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['server_closing_period_heads','server_closing_allocation_heads'] LOOP
  EXECUTE format('CREATE TRIGGER closing_head_gate BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION require_server_closing_command()',t);
  EXECUTE format('CREATE TRIGGER closing_no_head_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_server_closing_immutable()',t);
 END LOOP;
END; $$;
CREATE FUNCTION validate_server_closing_period_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_version server_closing_period_versions; prior_version server_closing_period_versions; manifest JSONB;
BEGIN
 SELECT * INTO STRICT next_version FROM server_closing_period_versions WHERE id=NEW.current_version_id AND period_id=NEW.period_id AND version=NEW.version;
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 OR next_version.status<>'open' OR next_version.action<>'create_period' THEN RAISE EXCEPTION 'initial closing period required' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO STRICT prior_version FROM server_closing_period_versions WHERE id=OLD.current_version_id;
  IF OLD.period_id<>NEW.period_id OR NEW.version<>OLD.version+1 OR next_version.tax_rate_percent<>prior_version.tax_rate_percent
    OR NOT ((prior_version.status='open' AND next_version.status IN ('open','confirmed')) OR (prior_version.status='confirmed' AND next_version.status IN ('open','locked')) OR (prior_version.status='locked' AND next_version.status='open'))
  THEN RAISE EXCEPTION 'closing period transition or identity conflict' USING ERRCODE='23514'; END IF;
 END IF;
 IF next_version.status IN ('confirmed','locked') THEN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('allocationId',a.id::text,'versionId',h.current_version_id::text,'version',h.version) ORDER BY a.id),'[]') INTO manifest
   FROM server_closing_allocations a JOIN server_closing_allocation_heads h ON h.allocation_id=a.id WHERE a.period_id=NEW.period_id;
  IF manifest IS DISTINCT FROM next_version.allocation_manifest THEN RAISE EXCEPTION 'exact closing period allocation manifest required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER closing_period_head_validation BEFORE INSERT OR UPDATE ON server_closing_period_heads FOR EACH ROW EXECUTE FUNCTION validate_server_closing_period_head();
CREATE FUNCTION validate_server_closing_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v sales_order_commercial_versions; l sales_order_commercial_lines; period server_closing_period_versions; prior_allocation server_closing_allocation_versions; current_version INTEGER;
BEGIN
 SELECT pv.* INTO STRICT period FROM server_closing_period_heads h JOIN server_closing_period_versions pv ON pv.id=h.current_version_id WHERE h.period_id=NEW.period_id;
 IF period.status<>'open' OR period.tax_rate_percent<>NEW.tax_rate_percent THEN RAISE EXCEPTION 'open period and fixed tax basis required' USING ERRCODE='23514'; END IF;
 SELECT av.* INTO prior_allocation FROM server_closing_allocation_heads h JOIN server_closing_allocation_versions av ON av.id=h.current_version_id WHERE h.allocation_id=NEW.allocation_id;
 current_version:=COALESCE(prior_allocation.version,0);
 IF NEW.version<>current_version+1 OR (current_version=0)<>(NEW.action='create_allocation') OR (current_version>0 AND prior_allocation.status='voided') THEN
  RAISE EXCEPTION 'closing allocation version conflict' USING ERRCODE='23514';
 END IF;
 IF NEW.action='void_allocation' THEN
  IF NEW.status<>'voided' OR NEW.snapshot IS DISTINCT FROM prior_allocation.snapshot THEN RAISE EXCEPTION 'void preserves closing snapshot' USING ERRCODE='23514'; END IF;
 ELSIF NEW.status<>'active' THEN RAISE EXCEPTION 'active closing revision required' USING ERRCODE='23514'; END IF;
 IF NEW.action='review_allocation' AND (NEW.snapshot-'reviewBasis') IS DISTINCT FROM (prior_allocation.snapshot-'reviewBasis') THEN
  RAISE EXCEPTION 'review cannot change closing business terms' USING ERRCODE='23514';
 END IF;
 SELECT * INTO STRICT v FROM sales_order_commercial_versions WHERE id=NEW.commercial_version_id AND sales_order_id=NEW.sales_order_id;
 IF NEW.action IN ('create_allocation','update_allocation') AND NOT EXISTS(SELECT 1 FROM sales_order_commercial_heads h WHERE h.sales_order_id=NEW.sales_order_id AND h.current_version_id=v.id) THEN
  RAISE EXCEPTION 'current adopted commercial version required' USING ERRCODE='23514';
 END IF;
 IF v.pricing_scope='legacy_uniform' THEN
  IF v.quote_type<>'processing' OR NEW.color_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM processing_order_batch_consumptions c WHERE c.sales_order_id=NEW.sales_order_id AND c.commercial_version_id=v.id)
   OR NEW.include_sales OR (NEW.include_work AND (v.labor_currency<>'USD' OR NEW.work_price IS DISTINCT FROM v.confirmed_labor_price)) THEN
   RAISE EXCEPTION 'exact processing batch closing basis required' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT * INTO STRICT l FROM sales_order_commercial_lines WHERE sales_order_id=NEW.sales_order_id AND commercial_version_id=v.id AND color_id IS NOT DISTINCT FROM NEW.color_id;
  IF (NEW.include_sales AND (v.quote_type<>'distribution' OR NEW.sale_price IS DISTINCT FROM l.actual_sale_price))
    OR (NEW.include_work AND (l.labor_currency<>'USD' OR NEW.work_price IS DISTINCT FROM l.labor_price)) THEN
   RAISE EXCEPTION 'exact adopted closing price required' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER closing_allocation_validation BEFORE INSERT ON server_closing_allocation_versions FOR EACH ROW EXECUTE FUNCTION validate_server_closing_allocation();
CREATE FUNCTION validate_server_closing_allocation_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state TEXT; BEGIN
 SELECT pv.status INTO state FROM server_closing_allocations a JOIN server_closing_period_heads ph ON ph.period_id=a.period_id JOIN server_closing_period_versions pv ON pv.id=ph.current_version_id WHERE a.id=NEW.allocation_id;
 IF state IS DISTINCT FROM 'open' OR (TG_OP='INSERT' AND NEW.version<>1)
   OR (TG_OP='UPDATE' AND (NEW.allocation_id<>OLD.allocation_id OR NEW.version<>OLD.version+1)) THEN
  RAISE EXCEPTION 'open closing allocation head required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER closing_allocation_head_validation BEFORE INSERT OR UPDATE ON server_closing_allocation_heads FOR EACH ROW EXECUTE FUNCTION validate_server_closing_allocation_head();
