-- Forward-only protection for every confirmed/locked month slice. No backfill,
-- historical repair, price/production changes or replacement of old guards.
CREATE FUNCTION validate_closing_frozen_month_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior_lines JSONB;
BEGIN
 SELECT lines INTO prior_lines FROM server_closing_month_plan_versions
 WHERE sales_order_id=NEW.sales_order_id AND version=NEW.version-1;
 IF EXISTS (
  WITH frozen AS (
   SELECT p.month FROM server_closing_periods p
   JOIN server_closing_period_heads h ON h.period_id=p.id
   JOIN server_closing_period_versions v ON v.id=h.current_version_id
   WHERE v.status<>'open'
  ), previous_slices AS (
   SELECT value->>'month' AS month,jsonb_agg(value ORDER BY value->>'id') AS lines
   FROM jsonb_array_elements(coalesce(prior_lines,'[]'::jsonb)) GROUP BY 1
  ), next_slices AS (
   SELECT value->>'month' AS month,jsonb_agg(value ORDER BY value->>'id') AS lines
   FROM jsonb_array_elements(NEW.lines) GROUP BY 1
  )
  SELECT 1 FROM frozen f LEFT JOIN previous_slices o USING(month) LEFT JOIN next_slices n USING(month)
  WHERE coalesce(o.lines,'[]'::jsonb) IS DISTINCT FROM coalesce(n.lines,'[]'::jsonb)
 ) THEN
  RAISE EXCEPTION 'Frozen closing month lines must remain exact' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER month_frozen_lines_validation BEFORE INSERT ON server_closing_month_plan_versions
 FOR EACH ROW EXECUTE FUNCTION validate_closing_frozen_month_lines();
