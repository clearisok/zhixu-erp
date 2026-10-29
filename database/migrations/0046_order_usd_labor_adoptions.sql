-- Additive labor-channel adoption; no old price, source, batch or closing backfill.
ALTER TABLE sales_order_commercial_versions DROP CONSTRAINT sales_order_commercial_versions_change_kind_check;
ALTER TABLE sales_order_commercial_versions ADD CONSTRAINT sales_order_commercial_versions_change_kind_check
 CHECK(change_kind IN ('source_adoption','sale_adjustment','source_replacement','labor_adoption'));
ALTER TABLE sales_order_commercial_lines ADD COLUMN labor_confirmation_source JSONB;
ALTER TABLE sales_order_commercial_lines ADD CONSTRAINT labor_confirmation_evidence CHECK(labor_confirmation_source IS NULL OR ((
 jsonb_typeof(labor_confirmation_source)='object' AND octet_length(labor_confirmation_source::text)<=4096
 AND labor_confirmation_source->>'schemaVersion'='quote-labor-confirmation.v1'
 AND labor_confirmation_source->>'currency'='USD' AND labor_currency='USD'
 AND labor_confirmation_source->>'price'=labor_price::text
 AND labor_confirmation_source->>'sourceKind' IN ('cct','quote_confirmation')
 AND length(labor_confirmation_source->>'productHash')=64) IS TRUE));

CREATE TABLE order_labor_adoption_commands (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 declared_order_id UUID NOT NULL,
 sales_order_id UUID REFERENCES sales_orders(id) ON DELETE RESTRICT,
 before_version_id UUID,
 after_version_id UUID,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 command JSONB NOT NULL CHECK(jsonb_typeof(command)='object' AND octet_length(command::text)<=131072),
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=4096),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,request_id),
 FOREIGN KEY(sales_order_id,before_version_id) REFERENCES sales_order_commercial_versions(sales_order_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(sales_order_id,after_version_id) REFERENCES sales_order_commercial_versions(sales_order_id,id) ON DELETE RESTRICT,
 CHECK(sales_order_id IS NULL OR sales_order_id=declared_order_id)
);
CREATE INDEX labor_adoption_order_history ON order_labor_adoption_commands(sales_order_id,created_at,actor_id,request_id);
CREATE TRIGGER labor_adoption_receipt_immutable BEFORE UPDATE OR DELETE ON order_labor_adoption_commands
 FOR EACH ROW EXECUTE FUNCTION protect_order_commercial_version();
CREATE FUNCTION guard_labor_adoption_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE outcome TEXT; BEGIN
 IF current_setting('zhixu.labor_adoption',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'labor adoption command context required' USING ERRCODE='23514';
 END IF;
 outcome:=NEW.result->>'status';
 IF NEW.command->>'requestId' IS DISTINCT FROM NEW.request_id::text
 OR NEW.command->'intent'->>'orderId' IS DISTINCT FROM NEW.declared_order_id::text
 OR NEW.result->>'requestId' IS DISTINCT FROM NEW.request_id::text
 OR outcome IS NULL OR outcome NOT IN ('applied','unchanged','rejected') THEN
  RAISE EXCEPTION 'invalid labor adoption receipt' USING ERRCODE='23514';
 END IF;
 IF outcome='rejected' THEN
  IF NEW.before_version_id IS NOT NULL OR NEW.after_version_id IS NOT NULL THEN
   RAISE EXCEPTION 'rejected labor adoption cannot reference an applied version' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NEW.sales_order_id IS NULL OR NEW.before_version_id IS NULL OR NEW.after_version_id IS NULL
   OR NEW.result->>'commercialVersionId' IS DISTINCT FROM NEW.after_version_id::text THEN
   RAISE EXCEPTION 'labor adoption version evidence required' USING ERRCODE='23514';
  END IF;
  IF outcome='applied' AND (NEW.before_version_id=NEW.after_version_id OR NOT EXISTS(
   SELECT 1 FROM sales_order_commercial_versions v WHERE v.id=NEW.after_version_id AND v.sales_order_id=NEW.sales_order_id
    AND v.previous_version_id=NEW.before_version_id AND v.actor_id=NEW.actor_id AND v.request_id=NEW.request_id
    AND v.change_kind='labor_adoption')) THEN
   RAISE EXCEPTION 'labor adoption result must reference its exact version' USING ERRCODE='23514';
  END IF;
  IF outcome='unchanged' AND NEW.before_version_id<>NEW.after_version_id THEN
   RAISE EXCEPTION 'unchanged labor adoption cannot advance a version' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER labor_adoption_receipt_guard BEFORE INSERT ON order_labor_adoption_commands
 FOR EACH ROW EXECUTE FUNCTION guard_labor_adoption_receipt();
