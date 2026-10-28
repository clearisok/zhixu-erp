-- Gate6A: empty Server resources. No Browser import, defaults, grants or schedules.
CREATE FUNCTION valid_production_working_weekdays(value SMALLINT[]) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE AS $$
 SELECT value IS NOT NULL AND array_ndims(value)=1 AND array_lower(value,1)=1
   AND cardinality(value) BETWEEN 1 AND 7
   AND NOT EXISTS(SELECT 1 FROM unnest(value) day WHERE day IS NULL OR day NOT BETWEEN 0 AND 6)
   AND cardinality(value)=(SELECT count(DISTINCT day) FROM unnest(value) day);
$$;

CREATE TABLE production_calendars (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name TEXT NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 200),
 enabled BOOLEAN NOT NULL,
 remark TEXT NOT NULL CHECK(char_length(remark)<=2000),
 working_weekdays SMALLINT[] NOT NULL CHECK(valid_production_working_weekdays(working_weekdays)),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE production_calendar_exceptions (
 calendar_id UUID NOT NULL REFERENCES production_calendars(id) ON DELETE RESTRICT,
 exception_date DATE NOT NULL CHECK(exception_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 exception_type TEXT NOT NULL CHECK(exception_type IN('working','non_working')),
 name TEXT NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 200),
 PRIMARY KEY(calendar_id,exception_date)
);
CREATE TABLE production_sites (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name TEXT NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 200),
 enabled BOOLEAN NOT NULL,
 remark TEXT NOT NULL CHECK(char_length(remark)<=2000),
 country_code TEXT CHECK(char_length(btrim(country_code)) BETWEEN 1 AND 80),
 production_calendar_id UUID NOT NULL REFERENCES production_calendars(id) ON DELETE RESTRICT,
 pre_production_sample_lead_days INTEGER NOT NULL CHECK(pre_production_sample_lead_days BETWEEN 0 AND 3650),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX production_sites_calendar_idx ON production_sites(production_calendar_id);
CREATE TABLE production_groups (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name TEXT NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 200),
 short_name TEXT NOT NULL CHECK(char_length(short_name)<=80),
 enabled BOOLEAN NOT NULL,
 remark TEXT NOT NULL CHECK(char_length(remark)<=2000),
 production_site_id UUID NOT NULL REFERENCES production_sites(id) ON DELETE RESTRICT,
 sort_order DOUBLE PRECISION NOT NULL CHECK(sort_order BETWEEN -1000000000 AND 1000000000),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX production_groups_site_idx ON production_groups(production_site_id);
CREATE TABLE production_outsource_factories (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name TEXT NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 200),
 short_name TEXT NOT NULL CHECK(char_length(short_name)<=80),
 enabled BOOLEAN NOT NULL,
 remark TEXT NOT NULL CHECK(char_length(remark)<=2000),
 contact_person TEXT NOT NULL CHECK(char_length(contact_person)<=120),
 phone TEXT NOT NULL CHECK(char_length(phone)<=80),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION protect_production_resource() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'disable production resources instead of deleting them' USING ERRCODE='23514'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by
   OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'production resource identity and version must be preserved' USING ERRCODE='23514';
 END IF;
 NEW.updated_at=clock_timestamp();
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_production_calendar BEFORE UPDATE OR DELETE ON production_calendars FOR EACH ROW EXECUTE FUNCTION protect_production_resource();
CREATE TRIGGER protect_production_site BEFORE UPDATE OR DELETE ON production_sites FOR EACH ROW EXECUTE FUNCTION protect_production_resource();
CREATE TRIGGER protect_production_group BEFORE UPDATE OR DELETE ON production_groups FOR EACH ROW EXECUTE FUNCTION protect_production_resource();
CREATE TRIGGER protect_production_factory BEFORE UPDATE OR DELETE ON production_outsource_factories FOR EACH ROW EXECUTE FUNCTION protect_production_resource();

CREATE TABLE production_resource_commands (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('calendars','sites','groups','factories')),
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=1048576
   AND (result->>'requestId') IS NOT DISTINCT FROM request_id::text
   AND (result->>'kind') IS NOT DISTINCT FROM kind
   AND (result->>'status') IS NOT NULL AND result->>'status' IN('applied','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,request_id)
);
CREATE FUNCTION protect_production_resource_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'production resource receipts are immutable' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER protect_production_resource_command BEFORE UPDATE OR DELETE ON production_resource_commands FOR EACH ROW EXECUTE FUNCTION protect_production_resource_command();
