-- Unpriced month portions reference the existing immutable 0045 financial ledger.
-- No historical linking, price copy, currency conversion or automatic recognition.
ALTER TABLE server_closing_commands DROP CONSTRAINT server_closing_commands_action_check;
ALTER TABLE server_closing_commands ADD CONSTRAINT server_closing_commands_action_check CHECK(action IN
 ('create_period','create_allocation','update_allocation','review_allocation','void_allocation','confirm_period','unconfirm_period','lock_period','reopen_period','sync_month_outputs'));
CREATE TABLE server_closing_month_financial_links (
 allocation_id UUID PRIMARY KEY,
 period_id UUID NOT NULL,
 sales_order_id UUID NOT NULL,
 month_plan_version_id UUID NOT NULL,
 month_plan_version INTEGER NOT NULL,
 line_id UUID NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('sales','work')),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(allocation_id,period_id,sales_order_id) REFERENCES server_closing_allocations(id,period_id,sales_order_id) ON DELETE RESTRICT,
 FOREIGN KEY(sales_order_id,month_plan_version_id,month_plan_version)
  REFERENCES server_closing_month_plan_versions(sales_order_id,id,version) ON DELETE RESTRICT
);
CREATE INDEX closing_month_financial_scope ON server_closing_month_financial_links(period_id,sales_order_id,line_id,channel);
CREATE FUNCTION validate_closing_month_financial_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line JSONB; snapshot server_closing_allocation_versions; basis JSONB; plan server_closing_month_plan_versions;
BEGIN
 IF current_setting('zhixu.closing_month_financial_command',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Explicit month financial command required' USING ERRCODE='23514';
 END IF;
 SELECT v.* INTO STRICT plan FROM server_closing_month_plan_heads h JOIN server_closing_month_plan_versions v ON v.id=h.current_version_id
  WHERE h.sales_order_id=NEW.sales_order_id AND v.id=NEW.month_plan_version_id AND v.version=NEW.month_plan_version;
 SELECT value INTO line FROM jsonb_array_elements(plan.lines) WHERE value->>'id'=NEW.line_id::text;
 SELECT v.* INTO STRICT snapshot FROM server_closing_allocation_heads h JOIN server_closing_allocation_versions v ON v.id=h.current_version_id WHERE h.allocation_id=NEW.allocation_id;
 IF line IS NULL OR snapshot.status<>'active' OR snapshot.quantity::text IS DISTINCT FROM line->>'quantity'
  OR snapshot.color_id::text IS DISTINCT FROM line->>'colorId' OR snapshot.assignment_id::text IS DISTINCT FROM line->>'assignmentId'
  OR snapshot.include_sales IS DISTINCT FROM (NEW.channel='sales') OR snapshot.include_work IS DISTINCT FROM (NEW.channel='work')
  OR NOT EXISTS(SELECT 1 FROM server_closing_periods p WHERE p.id=NEW.period_id AND p.month=line->>'month') THEN
  RAISE EXCEPTION 'Exact month portion and one financial channel required' USING ERRCODE='23514';
 END IF;
 IF snapshot.assignment_id IS NULL THEN
  IF snapshot.snapshot->'executor' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Unassigned month cannot infer an executor' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT value INTO basis FROM jsonb_array_elements(plan.executor_basis) WHERE value->>'assignmentId'=snapshot.assignment_id::text;
  IF basis IS NULL OR basis->>'executionType' IS DISTINCT FROM snapshot.snapshot->'executor'->>'type'
   OR basis->>'executorId' IS DISTINCT FROM snapshot.snapshot->'executor'->>'id'
   OR basis->>'resourceSnapshotHash' IS DISTINCT FROM snapshot.snapshot->'executor'->>'resourceSnapshotHash' THEN
   RAISE EXCEPTION 'Financial executor must preserve month attribution' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER closing_month_link_gate BEFORE INSERT ON server_closing_month_financial_links FOR EACH ROW EXECUTE FUNCTION validate_closing_month_financial_link();
CREATE TRIGGER closing_month_link_immutable BEFORE UPDATE OR DELETE ON server_closing_month_financial_links FOR EACH ROW EXECUTE FUNCTION protect_server_closing_immutable();

CREATE FUNCTION protect_linked_closing_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE link server_closing_month_financial_links; line JSONB;
BEGIN
 SELECT * INTO link FROM server_closing_month_financial_links WHERE allocation_id=NEW.allocation_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF NEW.action<>'review_allocation' AND current_setting('zhixu.closing_month_financial_command',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Linked financial records require the month command' USING ERRCODE='23514';
 END IF;
 SELECT value INTO line FROM server_closing_month_plan_versions v,jsonb_array_elements(v.lines)
  WHERE v.id=link.month_plan_version_id AND value->>'id'=link.line_id::text;
 IF line IS NULL OR NEW.quantity::text IS DISTINCT FROM line->>'quantity' OR NEW.color_id::text IS DISTINCT FROM line->>'colorId'
  OR NEW.assignment_id::text IS DISTINCT FROM line->>'assignmentId' OR NEW.include_sales IS DISTINCT FROM (link.channel='sales')
  OR NEW.include_work IS DISTINCT FROM (link.channel='work') THEN
  RAISE EXCEPTION 'Linked month quantity and channel are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER linked_closing_allocation_guard BEFORE INSERT ON server_closing_allocation_versions FOR EACH ROW EXECUTE FUNCTION protect_linked_closing_allocation();
CREATE FUNCTION unique_active_closing_month_channel() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE link server_closing_month_financial_links;
BEGIN
 SELECT * INTO link FROM server_closing_month_financial_links WHERE allocation_id=NEW.allocation_id;
 IF FOUND AND (SELECT count(*) FROM server_closing_month_financial_links l JOIN server_closing_allocation_heads h ON h.allocation_id=l.allocation_id
   JOIN server_closing_allocation_versions v ON v.id=h.current_version_id WHERE l.period_id=link.period_id AND l.sales_order_id=link.sales_order_id
   AND l.line_id=link.line_id AND l.channel=link.channel AND v.status='active')>1 THEN
  RAISE EXCEPTION 'Only one active financial record per month portion/channel' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER closing_month_active_link AFTER INSERT ON server_closing_month_financial_links
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION unique_active_closing_month_channel();
CREATE CONSTRAINT TRIGGER closing_month_active_head AFTER INSERT OR UPDATE ON server_closing_allocation_heads
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION unique_active_closing_month_channel();
