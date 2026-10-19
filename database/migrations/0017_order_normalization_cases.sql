-- Gate4 case evidence only. No effective-order reassignment, backfill or execution.
CREATE TABLE sales_order_normalization_cases (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 first_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 second_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(first_order_id < second_order_id),
 UNIQUE(first_order_id,second_order_id),
 UNIQUE(created_by,request_id)
);
CREATE TABLE sales_order_normalization_case_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 case_id UUID NOT NULL REFERENCES sales_order_normalization_cases(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 event_type TEXT NOT NULL CHECK(event_type IN ('opened','review_note','withdrawn','reopened')),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 evidence JSONB NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(case_id,version), UNIQUE(actor_id,request_id)
);
CREATE FUNCTION protect_order_normalization_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'normalization case history is append-only' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER normalization_case_immutable BEFORE UPDATE OR DELETE ON sales_order_normalization_cases FOR EACH ROW EXECUTE FUNCTION protect_order_normalization_history();
CREATE TRIGGER normalization_event_immutable BEFORE UPDATE OR DELETE ON sales_order_normalization_case_events FOR EACH ROW EXECUTE FUNCTION protect_order_normalization_history();
CREATE FUNCTION validate_order_normalization_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior_version INTEGER; prior_type TEXT;
BEGIN
 PERFORM id FROM sales_order_normalization_cases WHERE id=NEW.case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'normalization case missing' USING ERRCODE='23503'; END IF;
 SELECT version,event_type INTO prior_version,prior_type FROM sales_order_normalization_case_events WHERE case_id=NEW.case_id ORDER BY version DESC LIMIT 1;
 IF NOT FOUND THEN
  IF NEW.version<>1 OR NEW.event_type<>'opened' THEN RAISE EXCEPTION 'case must begin with opened version 1' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.version<>prior_version+1 OR NEW.event_type='opened' THEN RAISE EXCEPTION 'case event version conflict' USING ERRCODE='23514'; END IF;
  IF prior_type='withdrawn' AND NEW.event_type<>'reopened' THEN RAISE EXCEPTION 'withdrawn case requires explicit reopen' USING ERRCODE='23514'; END IF;
  IF prior_type<>'withdrawn' AND NEW.event_type='reopened' THEN RAISE EXCEPTION 'only withdrawn case can reopen' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER normalization_event_sequence BEFORE INSERT ON sales_order_normalization_case_events FOR EACH ROW EXECUTE FUNCTION validate_order_normalization_event();
