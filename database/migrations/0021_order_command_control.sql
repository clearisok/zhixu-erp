-- Operator-owned pause control. No HTTP mutator, backfill, account or price changes.
CREATE TABLE sales_order_command_control (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
 mode TEXT NOT NULL DEFAULT 'enabled' CHECK(mode IN ('enabled','frozen')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 reason TEXT NOT NULL DEFAULT 'Initial compatible command mode' CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sales_order_command_control_events (
 version INTEGER PRIMARY KEY CHECK(version>0),
 previous_mode TEXT CHECK(previous_mode IN ('enabled','frozen')),
 mode TEXT NOT NULL CHECK(mode IN ('enabled','frozen')),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 database_actor TEXT NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO sales_order_command_control(singleton) VALUES(true);
INSERT INTO sales_order_command_control_events(version,mode,reason,database_actor)
 SELECT version,mode,reason,current_user FROM sales_order_command_control;
CREATE FUNCTION protect_order_command_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'order command control cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NEW.singleton IS DISTINCT FROM OLD.singleton OR NEW.created_at IS DISTINCT FROM OLD.created_at
 OR NEW.version<>OLD.version+1 OR NEW.mode=OLD.mode OR NEW.reason IS NOT DISTINCT FROM OLD.reason THEN
  RAISE EXCEPTION 'order command control requires a new mode, reason and exact version' USING ERRCODE='23514';
 END IF;
 NEW.updated_at=now();RETURN NEW;
END; $$;
CREATE TRIGGER order_command_control_protection BEFORE UPDATE OR DELETE ON sales_order_command_control FOR EACH ROW EXECUTE FUNCTION protect_order_command_control();
CREATE FUNCTION record_order_command_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO sales_order_command_control_events(version,previous_mode,mode,reason,database_actor)
 VALUES(NEW.version,OLD.mode,NEW.mode,NEW.reason,current_user);RETURN NULL;
END; $$;
CREATE TRIGGER order_command_control_history AFTER UPDATE ON sales_order_command_control FOR EACH ROW EXECUTE FUNCTION record_order_command_control();
CREATE TRIGGER order_command_control_event_immutable BEFORE UPDATE OR DELETE ON sales_order_command_control_events FOR EACH ROW EXECUTE FUNCTION protect_order_normalization_history();

CREATE FUNCTION validate_order_command_control_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth()<2 OR NOT EXISTS(SELECT 1 FROM sales_order_command_control WHERE singleton AND version=NEW.version AND mode=NEW.mode AND reason=NEW.reason) THEN
  RAISE EXCEPTION 'order command event must be emitted by its control transition' USING ERRCODE='23514';
 END IF;
 NEW.database_actor=current_user;NEW.recorded_at=now();RETURN NEW;
END; $$;
CREATE TRIGGER order_command_control_event_source BEFORE INSERT ON sales_order_command_control_events FOR EACH ROW EXECUTE FUNCTION validate_order_command_control_event();

CREATE FUNCTION require_order_commands_enabled() RETURNS void LANGUAGE plpgsql AS $$
DECLARE current_mode TEXT;
BEGIN
 -- Row lock spans the business transaction. A pause waits for in-flight writes;
 -- a stale RR snapshot aborts on the changed control row instead of reopening it.
 -- Do not take an advisory lock from the control-row UPDATE trigger: the UPDATE
 -- already owns its row lock and that would invert the writer lock order.
 SELECT mode INTO current_mode FROM sales_order_command_control WHERE singleton FOR SHARE;
 IF current_mode IS NULL THEN RAISE EXCEPTION 'order_command_control_unavailable' USING ERRCODE='55000'; END IF;
 IF current_mode<>'enabled' THEN RAISE EXCEPTION 'order_commands_frozen' USING ERRCODE='55000'; END IF;
END; $$;
CREATE FUNCTION protect_order_command_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM require_order_commands_enabled();RETURN NEW;END; $$;
CREATE TRIGGER order_command_gate_create BEFORE INSERT ON sales_orders FOR EACH ROW EXECUTE FUNCTION protect_order_command_write();
CREATE TRIGGER order_command_gate_adopt BEFORE INSERT ON sales_order_commercial_versions FOR EACH ROW EXECUTE FUNCTION protect_order_command_write();
CREATE TRIGGER order_command_gate_commercial_head BEFORE INSERT OR UPDATE ON sales_order_commercial_heads FOR EACH ROW EXECUTE FUNCTION protect_order_command_write();
CREATE TRIGGER order_command_gate_normalize BEFORE INSERT ON sales_order_attribution_changes FOR EACH ROW EXECUTE FUNCTION protect_order_command_write();
CREATE TRIGGER order_command_gate_attribution_head BEFORE INSERT OR UPDATE ON sales_order_attribution_heads FOR EACH ROW EXECUTE FUNCTION protect_order_command_write();
CREATE TRIGGER order_command_gate_legacy_association BEFORE INSERT OR UPDATE ON confirmed_commercial_terms_sales_orders FOR EACH ROW EXECUTE FUNCTION protect_order_command_write();
CREATE FUNCTION protect_legacy_order_cct_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Old order-owned/shared association setters are also paused. Unrelated Quote
 -- confirmation remains available; existing adopted snapshots are never edited.
 IF NEW.ownership_scope='sales_order' THEN
  PERFORM require_order_commands_enabled();
 ELSIF TG_OP='UPDATE' THEN
  IF EXISTS(SELECT 1 FROM confirmed_commercial_terms_sales_orders WHERE confirmed_commercial_terms_id=OLD.id) THEN
   PERFORM require_order_commands_enabled();
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER order_command_gate_legacy_cct BEFORE INSERT OR UPDATE ON confirmed_commercial_terms FOR EACH ROW EXECUTE FUNCTION protect_legacy_order_cct_command();
