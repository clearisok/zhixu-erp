-- Explicitly match unassigned month portions to real production assignments.
-- No quantity/month backfill, executor inference, financial rows or old-history edit.
ALTER TABLE server_closing_month_plan_versions
 ADD COLUMN executor_basis JSONB NOT NULL DEFAULT '[]'::jsonb
 CHECK(jsonb_typeof(executor_basis)='array' AND jsonb_array_length(executor_basis)<=500 AND octet_length(executor_basis::text)<=262144);
ALTER TABLE server_closing_month_plan_versions DROP CONSTRAINT server_closing_month_plan_versions_action_check;
ALTER TABLE server_closing_month_plan_versions ADD CONSTRAINT server_closing_month_plan_versions_action_check
 CHECK(action IN ('initialize','move_months','match_executors'));

CREATE FUNCTION validate_closing_executor_matching() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior server_closing_month_plan_versions%ROWTYPE; basis JSONB; assigned UUID; scope_quantity NUMERIC; matches_current BOOLEAN;
BEGIN
 SELECT v.* INTO prior FROM server_closing_month_plan_heads h JOIN server_closing_month_plan_versions v ON v.id=h.current_version_id
 WHERE h.sales_order_id=NEW.sales_order_id;
 IF NEW.action='initialize' AND NEW.executor_basis<>'[]'::jsonb THEN
  RAISE EXCEPTION 'Initialization cannot infer an executor' USING ERRCODE='23514';
 END IF;
 IF NEW.action='move_months' AND NEW.executor_basis IS DISTINCT FROM prior.executor_basis THEN
  RAISE EXCEPTION 'Month move cannot replace executor evidence' USING ERRCODE='23514';
 END IF;
 IF NEW.action='match_executors' THEN
  IF NEW.source_quantity IS DISTINCT FROM prior.source_quantity OR NEW.quantity_state<>prior.quantity_state OR NEW.source_fingerprint<>prior.source_fingerprint THEN
   RAISE EXCEPTION 'Executor matching cannot replace Source facts' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
   WITH o AS (SELECT jsonb_build_array(value->'colorId',value->'month') scope,sum((value->>'quantity')::numeric) quantity FROM jsonb_array_elements(prior.lines) GROUP BY 1),
        n AS (SELECT jsonb_build_array(value->'colorId',value->'month') scope,sum((value->>'quantity')::numeric) quantity FROM jsonb_array_elements(NEW.lines) GROUP BY 1)
   SELECT 1 FROM o FULL JOIN n USING(scope) WHERE o.quantity IS DISTINCT FROM n.quantity
  ) THEN RAISE EXCEPTION 'Executor matching must preserve every color/month quantity' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(prior.lines) line WHERE line->>'assignmentId' IS NOT NULL AND NOT NEW.lines @> jsonb_build_array(line))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior.executor_basis) old_basis WHERE NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(NEW.executor_basis) new_basis WHERE
     new_basis->>'assignmentId'=old_basis->>'assignmentId' AND (new_basis-ARRAY['assignmentVersion','plannedQuantity','planStatus','execution'])
      IS NOT DISTINCT FROM (old_basis-ARRAY['assignmentVersion','plannedQuantity','planStatus','execution']))) THEN
   RAISE EXCEPTION 'Previously matched executor history is immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(NEW.executor_basis)) <>
    (SELECT count(DISTINCT value->>'assignmentId') FROM jsonb_array_elements(NEW.executor_basis)) THEN
  RAISE EXCEPTION 'Executor evidence must be unique' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.executor_basis) b WHERE NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(NEW.lines) line WHERE line->>'assignmentId'=b->>'assignmentId')) THEN
  RAISE EXCEPTION 'Unused executor evidence' USING ERRCODE='23514';
 END IF;
 FOR assigned,scope_quantity IN SELECT (value->>'assignmentId')::uuid,sum((value->>'quantity')::numeric)
   FROM jsonb_array_elements(NEW.lines) WHERE value->>'assignmentId' IS NOT NULL GROUP BY 1 LOOP
  SELECT value INTO basis FROM jsonb_array_elements(NEW.executor_basis) WHERE value->>'assignmentId'=assigned::text;
  IF basis IS NULL OR jsonb_typeof(basis)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(basis))<>10
   OR NOT basis ?& ARRAY['assignmentId','salesOrderId','assignmentVersion','colorId','executionType','executorId','resourceSnapshotHash','plannedQuantity','planStatus','execution']
   OR jsonb_typeof(basis->'assignmentVersion')<>'number' OR jsonb_typeof(basis->'plannedQuantity')<>'string'
   OR basis->>'salesOrderId' IS DISTINCT FROM NEW.sales_order_id::text THEN
   RAISE EXCEPTION 'Missing executor evidence' USING ERRCODE='23514';
  END IF;
  -- Old evidence survives subsequent production edits; only newly matched scopes
  -- must equal the current trusted assignment and its immutable resource snapshot.
  IF NEW.action='match_executors' AND scope_quantity>coalesce((SELECT sum((line->>'quantity')::numeric) FROM jsonb_array_elements(prior.lines) line
     WHERE line->>'assignmentId'=assigned::text),0) THEN
   SELECT true INTO matches_current FROM production_schedule_assignments a LEFT JOIN production_schedule_executions e ON e.assignment_id=a.id
    WHERE a.id=assigned AND a.sales_order_id=NEW.sales_order_id AND basis->>'colorId' IS NOT DISTINCT FROM a.color_id::text
      AND basis->>'executionType'=a.execution_type AND basis->>'executorId'=coalesce(a.production_group_id,a.outsource_factory_id)::text
      AND basis->>'resourceSnapshotHash'=a.resource_snapshot_hash
      AND basis->>'assignmentVersion'=a.version::text AND basis->>'plannedQuantity'=trim_scale(a.planned_quantity)::text AND basis->>'planStatus'=a.status
      AND basis->'execution' IS NOT DISTINCT FROM CASE WHEN e.assignment_id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object(
       'version',e.version,'status',e.status,'completedQuantity',trim_scale(e.completed_quantity)::text,
       'actualStartDate',e.actual_start_date::text,'actualCompletedDate',e.actual_completed_date::text) END;
   IF matches_current IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Executor evidence no longer matches production' USING ERRCODE='23514';
   END IF;
  ELSIF NEW.action='match_executors' AND basis IS DISTINCT FROM (SELECT value FROM jsonb_array_elements(prior.executor_basis) WHERE value->>'assignmentId'=assigned::text) THEN
   RAISE EXCEPTION 'Untouched executor evidence cannot be refreshed' USING ERRCODE='23514';
  END IF;
 END LOOP;
 RETURN NEW;
END; $$;
CREATE TRIGGER month_executor_validation BEFORE INSERT ON server_closing_month_plan_versions
 FOR EACH ROW EXECUTE FUNCTION validate_closing_executor_matching();
