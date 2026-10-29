-- Explicit review of changed trusted Source quantities. No historical backfill,
-- automatic rescale, price, production, frozen manifest or default-month edit.
ALTER TABLE server_closing_month_plan_versions ADD COLUMN source_observation JSONB
 CHECK(source_observation IS NULL OR (jsonb_typeof(source_observation)='object' AND octet_length(source_observation::text)<=262144));
ALTER TABLE server_closing_month_plan_versions DROP CONSTRAINT server_closing_month_plan_versions_action_check;
ALTER TABLE server_closing_month_plan_versions ADD CONSTRAINT server_closing_month_plan_versions_action_check
 CHECK(action IN ('initialize','move_months','match_executors','reconcile_source'));
ALTER TABLE server_closing_month_plan_versions ADD CONSTRAINT closing_source_observation_scope
 CHECK((action='reconcile_source')=(source_observation IS NOT NULL));

CREATE FUNCTION validate_closing_source_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior server_closing_month_plan_versions%ROWTYPE; observation JSONB; line JSONB; old_line JSONB; color JSONB; used_basis JSONB;
BEGIN
 IF NEW.action<>'reconcile_source' THEN RETURN NEW; END IF;
 SELECT * INTO prior FROM server_closing_month_plan_versions WHERE sales_order_id=NEW.sales_order_id AND version=NEW.version-1;
 observation:=NEW.source_observation;
 IF jsonb_typeof(observation) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Source observation must be an object, not JSON or SQL null' USING ERRCODE='23514';
 END IF;
 IF jsonb_typeof(observation->'colors') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Source colors must be an array' USING ERRCODE='23514';
 END IF;
 IF prior.id IS NULL OR NEW.source_fingerprint=prior.source_fingerprint OR NEW.quantity_state<>'ready'
   OR (SELECT count(*) FROM jsonb_object_keys(observation))<>5
   OR NOT observation ?& ARRAY['fingerprint','quantity','quantityState','businessType','colors']
   OR observation->>'fingerprint' IS DISTINCT FROM NEW.source_fingerprint
   OR observation->>'quantityState' IS DISTINCT FROM 'ready'
   OR jsonb_typeof(observation->'quantity')<>'string'
   OR observation->>'quantity' IS DISTINCT FROM trim_scale(NEW.source_quantity)::text
   OR observation->>'businessType' IS NULL OR observation->>'businessType' NOT IN ('ainuoke_contract','processing')
   OR jsonb_typeof(observation->'colors')<>'array' OR jsonb_array_length(observation->'colors')>2000 THEN
  RAISE EXCEPTION 'Invalid closing Source observation' USING ERRCODE='23514';
 END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(NEW.lines) LOOP
  SELECT value INTO old_line FROM jsonb_array_elements(prior.lines) WHERE value->>'id'=line->>'id';
  IF old_line IS NULL THEN
   IF line->>'month' IS NOT NULL OR line->>'assignmentId' IS NOT NULL THEN
    RAISE EXCEPTION 'New Source quantities must be pending and unassigned' USING ERRCODE='23514';
   END IF;
  ELSIF (line-'quantity') IS DISTINCT FROM (old_line-'quantity') OR (line->>'quantity')::numeric>(old_line->>'quantity')::numeric THEN
   RAISE EXCEPTION 'Source review can only reduce existing quantities' USING ERRCODE='23514';
  END IF;
 END LOOP;
 -- Protect each original frozen line, including its ID, color and executor.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(prior.lines) portion
   JOIN server_closing_periods p ON p.month=portion->>'month'
   JOIN server_closing_period_heads h ON h.period_id=p.id
   JOIN server_closing_period_versions v ON v.id=h.current_version_id
   WHERE v.status<>'open' AND NOT NEW.lines @> jsonb_build_array(portion)) THEN
  RAISE EXCEPTION 'Source review cannot change a frozen month line' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(jsonb_agg(b.value ORDER BY b.ordinality),'[]'::jsonb) INTO used_basis
 FROM jsonb_array_elements(prior.executor_basis) WITH ORDINALITY b(value,ordinality)
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.lines) portion WHERE portion->>'assignmentId'=b.value->>'assignmentId');
 IF NEW.executor_basis IS DISTINCT FROM used_basis THEN
  RAISE EXCEPTION 'Retained Source review executor evidence must stay exact' USING ERRCODE='23514';
 END IF;
 IF observation->>'businessType'='processing' THEN
  IF observation->'colors'<>'[]'::jsonb OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.lines) portion WHERE portion->>'colorId' IS NOT NULL) THEN
   RAISE EXCEPTION 'Processing Source must stay uncolored' USING ERRCODE='23514';
  END IF;
 ELSE
  IF (SELECT count(*) FROM jsonb_array_elements(observation->'colors'))<>
     (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(observation->'colors')) THEN
   RAISE EXCEPTION 'Source colors must be unique' USING ERRCODE='23514';
  END IF;
  FOR color IN SELECT value FROM jsonb_array_elements(observation->'colors') LOOP
   IF jsonb_typeof(color) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Source color evidence must be an object' USING ERRCODE='23514';
   END IF;
   IF (color->>'quantity' ~ '^[0-9]{1,12}(\.[0-9]{1,6})?$') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Source color quantity must be representable' USING ERRCODE='23514';
   END IF;
   IF (SELECT count(*) FROM jsonb_object_keys(color))<>3
      OR NOT color ?& ARRAY['id','quantity','ambiguous'] OR color->'ambiguous'<>'false'::jsonb
      OR jsonb_typeof(color->'id')<>'string' OR jsonb_typeof(color->'quantity')<>'string'
      OR color->>'quantity' !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$'
      OR color->>'quantity' IS DISTINCT FROM trim_scale((color->>'quantity')::numeric)::text
      OR NOT EXISTS(SELECT 1 FROM sales_order_color_identities i WHERE i.sales_order_id=NEW.sales_order_id AND i.id=(color->>'id')::uuid)
      OR (color->>'quantity')::numeric<>coalesce((SELECT sum((portion->>'quantity')::numeric) FROM jsonb_array_elements(NEW.lines) portion WHERE portion->>'colorId'=color->>'id'),0) THEN
    RAISE EXCEPTION 'Source color quantity must match its exact current evidence' USING ERRCODE='23514';
   END IF;
  END LOOP;
  IF coalesce((SELECT sum((value->>'quantity')::numeric) FROM jsonb_array_elements(observation->'colors')),0)<>NEW.source_quantity
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.lines) portion WHERE NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(observation->'colors') observed_color WHERE observed_color->>'id'=portion->>'colorId')) THEN
   RAISE EXCEPTION 'Source color totals cannot compensate for another color' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER month_source_validation BEFORE INSERT ON server_closing_month_plan_versions
 FOR EACH ROW EXECUTE FUNCTION validate_closing_source_reconciliation();

-- The original command is inserted after its version. Check the complete
-- deterministic transformation at commit, against the previous immutable version
-- (not the now-advanced head). Original receipt/history replay remains untouched.
CREATE FUNCTION validate_closing_source_command() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior server_closing_month_plan_versions%ROWTYPE; original JSONB; intent JSONB; item JSONB; line JSONB; amount TEXT; expected JSONB:='[]';
 seed TEXT; digits TEXT; generated TEXT; result JSONB;
BEGIN
 IF NEW.action<>'reconcile_source' THEN RETURN NEW; END IF;
 SELECT * INTO prior FROM server_closing_month_plan_versions WHERE sales_order_id=NEW.sales_order_id AND version=NEW.version-1;
 SELECT command,c.result INTO original,result FROM server_closing_month_commands c WHERE actor_id=NEW.actor_id AND request_id=NEW.request_id;
 intent:=original->'intent';
 IF jsonb_typeof(intent) IS DISTINCT FROM 'object' OR jsonb_typeof(intent->'adjustments') IS DISTINCT FROM 'array'
  OR jsonb_typeof(intent->'additions') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Source command must carry explicit adjustment and addition arrays' USING ERRCODE='23514';
 END IF;
 IF original IS NULL OR intent->>'action' IS DISTINCT FROM 'reconcile_source'
  OR intent->>'orderId' IS DISTINCT FROM NEW.sales_order_id::text OR intent->>'expectedVersion' IS DISTINCT FROM prior.version::text
  OR intent->>'observedSourceFingerprint' IS DISTINCT FROM NEW.source_fingerprint OR intent->>'reason' IS DISTINCT FROM NEW.reason
  OR jsonb_typeof(intent->'adjustments')<>'array' OR jsonb_typeof(intent->'additions')<>'array'
  OR jsonb_array_length(intent->'adjustments')+jsonb_array_length(intent->'additions')>100
  OR result->>'status' IS DISTINCT FROM 'applied' OR result->>'versionId' IS DISTINCT FROM NEW.id::text
  OR result->>'orderId' IS DISTINCT FROM NEW.sales_order_id::text OR result->>'version' IS DISTINCT FROM NEW.version::text
  OR original->>'requestId' IS DISTINCT FROM NEW.request_id::text OR result->>'requestId' IS DISTINCT FROM NEW.request_id::text
  OR result->>'operationId' IS DISTINCT FROM NEW.operation_id THEN
  RAISE EXCEPTION 'Source review requires its exact original command and result' USING ERRCODE='23514';
 END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(intent->'adjustments'))<>(SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(intent->'adjustments'))
  OR (SELECT count(*) FROM jsonb_array_elements(intent->'additions'))<>(SELECT count(DISTINCT coalesce(value->>'colorId','uncolored')) FROM jsonb_array_elements(intent->'additions')) THEN
  RAISE EXCEPTION 'Duplicate Source command scope' USING ERRCODE='23514';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(intent->'adjustments') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR (item->>'quantity' ~ '^[0-9]{1,12}(\.[0-9]{1,6})?$') IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Source quantity reduction must be an object with a representable quantity' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR NOT item ?& ARRAY['lineId','quantity']
    OR jsonb_typeof(item->'quantity')<>'string' OR item->>'quantity' !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$'
    OR item->>'quantity' IS DISTINCT FROM trim_scale((item->>'quantity')::numeric)::text
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(prior.lines) portion WHERE portion->>'id'=item->>'lineId') THEN
   RAISE EXCEPTION 'Invalid Source quantity reduction' USING ERRCODE='23514';
  END IF;
 END LOOP;
 FOR line IN SELECT value FROM jsonb_array_elements(prior.lines) LOOP
  SELECT value->>'quantity' INTO amount FROM jsonb_array_elements(intent->'adjustments') WHERE value->>'lineId'=line->>'id';
  amount:=coalesce(amount,line->>'quantity');
  IF amount::numeric<(line->>'quantity')::numeric AND EXISTS(SELECT 1 FROM jsonb_array_elements(intent->'additions') addition
    WHERE addition->'colorId' IS NOT DISTINCT FROM line->'colorId') THEN
   RAISE EXCEPTION 'Source review cannot replace existing attribution with same-color additions' USING ERRCODE='23514';
  END IF;
  IF amount::numeric>0 THEN expected:=expected||jsonb_build_array(jsonb_set(line,'{quantity}',to_jsonb(amount))); END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(intent->'additions') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR (item->>'quantity' ~ '^[0-9]{1,12}(\.[0-9]{1,6})?$') IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Source addition must be an object with a representable quantity' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR NOT item ?& ARRAY['colorId','quantity']
    OR jsonb_typeof(item->'colorId') NOT IN ('null','string') OR jsonb_typeof(item->'quantity')<>'string'
    OR item->>'quantity' !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' OR (item->>'quantity')::numeric<=0
    OR item->>'quantity' IS DISTINCT FROM trim_scale((item->>'quantity')::numeric)::text THEN
   RAISE EXCEPTION 'Invalid Source pending addition' USING ERRCODE='23514';
  END IF;
  seed:='closing-month-line:'||prior.id::text||':source:'||coalesce(item->>'colorId','uncolored');
  digits:=encode(digest(seed,'sha256'),'hex');
  generated:=substr(digits,1,8)||'-'||substr(digits,9,4)||'-5'||substr(digits,14,3)||'-a'||substr(digits,18,3)||'-'||substr(digits,21,12);
  expected:=expected||jsonb_build_array(jsonb_build_object('id',generated,'colorId',item->'colorId','assignmentId',NULL,'month',NULL,'quantity',item->>'quantity'));
 END LOOP;
 IF jsonb_array_length(expected)<>jsonb_array_length(NEW.lines) OR NOT expected @> NEW.lines OR NOT NEW.lines @> expected THEN
  RAISE EXCEPTION 'Source review differs from the original explicit transformation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER month_source_command_validation AFTER INSERT ON server_closing_month_plan_versions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_closing_source_command();
