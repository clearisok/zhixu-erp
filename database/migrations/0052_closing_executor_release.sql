-- Explicit zero-output attribution recovery. Never edits production, quantities,
-- source facts, prices, months, frozen periods or an existing immutable version.
ALTER TABLE server_closing_month_plan_versions DROP CONSTRAINT server_closing_month_plan_versions_action_check;
ALTER TABLE server_closing_month_plan_versions ADD CONSTRAINT server_closing_month_plan_versions_action_check
 CHECK(action IN ('initialize','move_months','match_executors','reconcile_source','release_executors'));

CREATE FUNCTION validate_closing_executor_release() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior server_closing_month_plan_versions%ROWTYPE; changed JSONB; expected JSONB; retained JSONB; original JSONB; intent JSONB; result JSONB;
BEGIN
 IF NEW.action<>'release_executors' THEN RETURN NEW; END IF;
 SELECT * INTO prior FROM server_closing_month_plan_versions WHERE sales_order_id=NEW.sales_order_id AND version=NEW.version-1;
 IF prior.id IS NULL OR NEW.source_quantity IS DISTINCT FROM prior.source_quantity
  OR NEW.quantity_state<>prior.quantity_state OR NEW.source_fingerprint<>prior.source_fingerprint
  OR NEW.source_observation IS NOT NULL THEN
  RAISE EXCEPTION 'Recovery must retain original Source facts' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(jsonb_agg(b.value->>'assignmentId' ORDER BY b.value->>'assignmentId'),'[]'::jsonb) INTO changed
 FROM jsonb_array_elements(prior.executor_basis) b(value)
 LEFT JOIN production_schedule_assignments a ON a.id=(b.value->>'assignmentId')::uuid AND a.sales_order_id=NEW.sales_order_id
 WHERE a.id IS NULL OR b.value->>'colorId' IS DISTINCT FROM a.color_id::text
  OR b.value->>'executionType' IS DISTINCT FROM a.execution_type
  OR b.value->>'executorId' IS DISTINCT FROM coalesce(a.production_group_id,a.outsource_factory_id)::text
  OR b.value->>'resourceSnapshotHash' IS DISTINCT FROM a.resource_snapshot_hash;
 IF changed='[]'::jsonb OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(changed) x(id)
  WHERE NOT EXISTS(SELECT 1 FROM production_schedule_assignments a WHERE a.id=x.id::uuid AND a.sales_order_id=NEW.sales_order_id)) THEN
  RAISE EXCEPTION 'Recovery requires actual changed assignments of this order' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM production_schedule_execution_versions e WHERE changed ? e.assignment_id::text AND (e.snapshot->>'completed_quantity')::numeric>0)
  OR EXISTS(SELECT 1 FROM production_schedule_executions e WHERE changed ? e.assignment_id::text AND e.completed_quantity>0)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior.executor_basis) b WHERE changed ? (b->>'assignmentId') AND coalesce((b->'execution'->>'completedQuantity')::numeric,0)>0) THEN
  RAISE EXCEPTION 'Actual output history cannot be released' USING ERRCODE='23514';
 END IF;
 SELECT jsonb_agg(CASE WHEN changed ? (line->>'assignmentId') THEN jsonb_set(line,'{assignmentId}','null'::jsonb) ELSE line END ORDER BY line->>'id')
 INTO expected FROM jsonb_array_elements(prior.lines) line;
 SELECT coalesce(jsonb_agg(b.value ORDER BY b.ordinality),'[]'::jsonb) INTO retained
 FROM jsonb_array_elements(prior.executor_basis) WITH ORDINALITY b(value,ordinality) WHERE NOT changed ? (b.value->>'assignmentId');
 IF NEW.lines IS DISTINCT FROM expected OR NEW.executor_basis IS DISTINCT FROM retained THEN
  RAISE EXCEPTION 'Recovery must only release every changed assignment, keeping exact portions' USING ERRCODE='23514';
 END IF;
 -- Deferred: the version and its original result are recorded in one transaction.
 SELECT c.command,c.result INTO original,result FROM server_closing_month_commands c WHERE c.actor_id=NEW.actor_id AND c.request_id=NEW.request_id;
 intent:=original->'intent';
 IF jsonb_typeof(intent) IS DISTINCT FROM 'object' OR jsonb_typeof(intent->'assignmentIds') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Recovery requires its original explicit command' USING ERRCODE='23514';
 END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(intent))<>6
  OR intent->>'action' IS DISTINCT FROM 'release_executors' OR intent->>'orderId' IS DISTINCT FROM NEW.sales_order_id::text
  OR intent->>'expectedVersion' IS DISTINCT FROM prior.version::text OR intent->>'reason' IS DISTINCT FROM NEW.reason
  OR intent->'assignmentIds' IS DISTINCT FROM changed
  OR (intent->>'observedExecutorFingerprint' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
  OR original->>'requestId' IS DISTINCT FROM NEW.request_id::text
  OR result->>'status' IS DISTINCT FROM 'applied' OR result->>'versionId' IS DISTINCT FROM NEW.id::text
  OR result->>'orderId' IS DISTINCT FROM NEW.sales_order_id::text OR result->>'version' IS DISTINCT FROM NEW.version::text
  OR result->>'requestId' IS DISTINCT FROM NEW.request_id::text OR result->>'operationId' IS DISTINCT FROM NEW.operation_id THEN
  RAISE EXCEPTION 'Recovery must equal its original command and receipt' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER month_executor_release_validation AFTER INSERT ON server_closing_month_plan_versions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_closing_executor_release();
