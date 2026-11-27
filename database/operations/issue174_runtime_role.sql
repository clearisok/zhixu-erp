-- Explicit operations gate, NOT an automatic migration or a credential loader.
-- psql -v expected_database=<reviewed target> -v runtime_role=<new role> -f ...
-- Creates NOLOGIN only. Managed password/login and application DSN switch require
-- the separately approved environment action. Existing roles/RBAC are untouched.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('issue174.expected_database', :'expected_database', true),
       set_config('issue174.runtime_role', :'runtime_role', true);
DO $$
DECLARE app_role TEXT=current_setting('issue174.runtime_role');
BEGIN
 IF current_database()<>current_setting('issue174.expected_database') THEN RAISE EXCEPTION 'reviewed target mismatch'; END IF;
 IF app_role !~ '^[a-z][a-z0-9_]{2,62}$' OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN RAISE EXCEPTION 'a new explicit runtime role is required'; END IF;
 IF to_regprocedure('public.ainuoke_storage_prune(text,boolean,integer)') IS NULL THEN RAISE EXCEPTION 'v2 target schema is missing'; END IF;
 EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',app_role);
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),app_role);
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',app_role);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO %I',app_role);
 EXECUTE format('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO %I',app_role);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.ainuoke_storage_rollup(TEXT,INTEGER),public.ainuoke_storage_prune(TEXT,BOOLEAN,INTEGER) TO %I',app_role);
 IF has_schema_privilege(app_role,'public','CREATE') OR pg_has_role(app_role,'ainuoke_storage_maintenance','MEMBER')
  OR EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND pg_get_userbyid(c.relowner)=app_role) THEN
  RAISE EXCEPTION 'runtime role must not own relations, create schema objects or inherit maintenance';
 END IF;
END $$;
COMMIT;
