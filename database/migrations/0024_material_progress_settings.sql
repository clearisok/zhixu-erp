-- D121 Gate5: explicit team display preferences; no order/source/price backfill.
CREATE FUNCTION valid_material_trim_priority_keywords(value JSONB) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item JSONB;
BEGIN
 IF jsonb_typeof(value)<>'array' OR jsonb_array_length(value)>50 THEN RETURN false; END IF;
 FOR item IN SELECT jsonb_array_elements(value) LOOP
  IF jsonb_typeof(item)<>'string' OR char_length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 40 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END; $$;
CREATE TABLE material_progress_settings (
 scope TEXT PRIMARY KEY CHECK(scope='team'),
 version INTEGER NOT NULL CHECK(version>0),
 trim_priority_keywords JSONB NOT NULL CHECK(valid_material_trim_priority_keywords(trim_priority_keywords)),
 updated_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE material_progress_setting_commands (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=16384),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,request_id)
);
CREATE FUNCTION protect_material_progress_setting_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'material progress setting command history is immutable' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER immutable_material_progress_setting_command BEFORE UPDATE OR DELETE ON material_progress_setting_commands FOR EACH ROW EXECUTE FUNCTION protect_material_progress_setting_command();
-- A catalog key is technical metadata. Existing accounts/role membership are untouched.
-- Only these explicitly approved preset role IDs gain the new bounded setting action.
INSERT INTO app_permissions(key,module,label,description) VALUES('style_progress.settings.edit','款式进度','维护辅料排列','维护团队共用的辅料关键词显示顺序，不授予业务执行或来源同步') ON CONFLICT DO NOTHING;
INSERT INTO app_role_permissions(role_id,permission_key)
 SELECT id,'style_progress.settings.edit' FROM app_roles WHERE id IN ('role-server-admin','role-team-material-manager') ON CONFLICT DO NOTHING;
