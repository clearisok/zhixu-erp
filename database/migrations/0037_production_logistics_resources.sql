-- Empty Server logistics resources; no defaults, grants, Browser import or business migration.
CREATE TABLE production_supply_hubs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name TEXT NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 200),
 enabled BOOLEAN NOT NULL,
 remark TEXT NOT NULL CHECK(char_length(remark)<=2000),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE production_supply_routes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name TEXT NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 200),
 enabled BOOLEAN NOT NULL,
 remark TEXT NOT NULL CHECK(char_length(remark)<=2000),
 supply_hub_id UUID NOT NULL REFERENCES production_supply_hubs(id) ON DELETE RESTRICT,
 production_site_id UUID NOT NULL REFERENCES production_sites(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
-- Disabled historical alternatives remain; recommendations must never select an arbitrary active duplicate.
CREATE UNIQUE INDEX production_supply_routes_active_pair_key ON production_supply_routes(supply_hub_id,production_site_id) WHERE enabled;
CREATE INDEX production_supply_routes_site_idx ON production_supply_routes(production_site_id);
CREATE TABLE production_transport_modes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 route_id UUID NOT NULL REFERENCES production_supply_routes(id) ON DELETE RESTRICT,
 name TEXT NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 200),
 enabled BOOLEAN NOT NULL,
 remark TEXT NOT NULL CHECK(char_length(remark)<=2000),
 transit_days INTEGER NOT NULL CHECK(transit_days BETWEEN 0 AND 3650),
 sort_order DOUBLE PRECISION NOT NULL CHECK(sort_order BETWEEN -1000000000 AND 1000000000),
 display_position INTEGER NOT NULL CHECK(display_position BETWEEN 0 AND 99),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(route_id,display_position) DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER protect_production_supply_hub BEFORE UPDATE OR DELETE ON production_supply_hubs FOR EACH ROW EXECUTE FUNCTION protect_production_resource();
CREATE TRIGGER protect_production_supply_route BEFORE UPDATE OR DELETE ON production_supply_routes FOR EACH ROW EXECUTE FUNCTION protect_production_resource();
CREATE TRIGGER protect_production_transport_mode BEFORE UPDATE OR DELETE ON production_transport_modes FOR EACH ROW EXECUTE FUNCTION protect_production_resource();
CREATE FUNCTION protect_production_transport_mode_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.route_id IS DISTINCT FROM OLD.route_id THEN
  RAISE EXCEPTION 'transport mode identity belongs to its original route' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_production_transport_mode_owner BEFORE UPDATE ON production_transport_modes FOR EACH ROW EXECUTE FUNCTION protect_production_transport_mode_owner();
CREATE FUNCTION bound_production_transport_modes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM production_supply_routes WHERE id=NEW.route_id FOR UPDATE;
 IF (SELECT count(*) FROM production_transport_modes WHERE route_id=NEW.route_id)>=100 THEN
  RAISE EXCEPTION 'transport plan has too many modes' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER bound_production_transport_modes BEFORE INSERT ON production_transport_modes FOR EACH ROW EXECUTE FUNCTION bound_production_transport_modes();
CREATE FUNCTION require_production_transport_modes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM production_transport_modes WHERE route_id=NEW.id) THEN
  RAISE EXCEPTION 'transport plan requires retained modes' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER require_production_transport_modes AFTER INSERT OR UPDATE ON production_supply_routes
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_production_transport_modes();

ALTER TABLE production_resource_commands DROP CONSTRAINT production_resource_commands_kind_check;
ALTER TABLE production_resource_commands ADD CONSTRAINT production_resource_commands_kind_check
 CHECK(kind IN('calendars','sites','groups','factories','hubs','transport-plans'));
