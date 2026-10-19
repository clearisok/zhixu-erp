-- Source history remains on the original captured target. No historical backfill.
CREATE FUNCTION preserve_sales_order_source_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'source binding history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'source binding record identity is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.source_system='ainuoke' AND OLD.source_entity_type='sales_contract' AND OLD.sales_contract_no IS NOT NULL AND btrim(OLD.sales_contract_no)<>'' THEN
  IF upper(btrim(NEW.sales_contract_no)) IS DISTINCT FROM upper(btrim(OLD.sales_contract_no)) THEN
   RAISE EXCEPTION 'known source contract identity is immutable' USING ERRCODE='23514';
  END IF;
  -- Formatting is not a new contract or a reason to rewrite original identity.
  NEW.sales_contract_no=OLD.sales_contract_no;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER source_binding_history_preservation BEFORE UPDATE OR DELETE ON sales_order_source_links FOR EACH ROW EXECUTE FUNCTION preserve_sales_order_source_history();
CREATE FUNCTION preserve_ainuoke_mirror_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'source contract observation cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NEW.sales_order_id IS DISTINCT FROM OLD.sales_order_id OR NEW.source_id IS DISTINCT FROM OLD.source_id
 OR upper(btrim(NEW.sales_contract_no)) IS DISTINCT FROM upper(btrim(OLD.sales_contract_no)) THEN
  RAISE EXCEPTION 'source contract observation identity is immutable' USING ERRCODE='23514';
 END IF;
 NEW.sales_contract_no=OLD.sales_contract_no;RETURN NEW;
END; $$;
CREATE TRIGGER source_contract_identity_preservation BEFORE UPDATE OR DELETE ON ainuoke_sales_order_contract_mirrors FOR EACH ROW EXECUTE FUNCTION preserve_ainuoke_mirror_identity();
ALTER TABLE ainuoke_source_runs ADD COLUMN order_scope JSONB CHECK(order_scope IS NULL OR jsonb_typeof(order_scope)='array');
CREATE FUNCTION require_source_capture_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.order_scope IS NULL OR jsonb_array_length(NEW.order_scope)>1000 THEN RAISE EXCEPTION 'recorded Source order scope required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER source_capture_scope BEFORE INSERT ON ainuoke_source_runs FOR EACH ROW EXECUTE FUNCTION require_source_capture_scope();
ALTER TABLE ainuoke_material_source_snapshots ADD COLUMN source_link_id UUID REFERENCES sales_order_source_links(id) ON DELETE RESTRICT;
ALTER TABLE ainuoke_material_source_snapshots ADD COLUMN captured_order_version INTEGER CHECK(captured_order_version IS NULL OR captured_order_version>0);
CREATE FUNCTION validate_material_capture_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_version INTEGER;
BEGIN
 PERFORM require_effective_order_write_owner(NEW.sales_order_id);
 SELECT version INTO target_version FROM sales_orders WHERE id=NEW.sales_order_id FOR SHARE;
 IF NEW.captured_order_version IS DISTINCT FROM target_version OR NEW.source_link_id IS NULL THEN
  RAISE EXCEPTION 'exact material capture context required' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM ainuoke_source_runs r CROSS JOIN LATERAL jsonb_array_elements(r.order_scope) scope WHERE r.id=NEW.run_id AND scope->>'id'=NEW.sales_order_id::text AND scope->>'sourceLinkId'=NEW.source_link_id::text AND (scope->>'version')::integer=NEW.captured_order_version AND scope->>'attributionChangeId' IS NOT DISTINCT FROM NEW.attribution_change_id::text) THEN
  RAISE EXCEPTION 'material capture must match recorded run scope' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM sales_order_source_links l JOIN sales_order_effective_identities v ON v.original_order_id=l.sales_order_id
  JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=l.sales_order_id AND m.source_id=l.external_id AND m.sales_contract_no=l.sales_contract_no
  WHERE l.id=NEW.source_link_id AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract' AND l.sales_contract_no=NEW.sales_contract_no AND v.effective_order_id=NEW.sales_order_id) THEN
  RAISE EXCEPTION 'material capture link must match trusted source owner' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER material_capture_context BEFORE INSERT ON ainuoke_material_source_snapshots FOR EACH ROW EXECUTE FUNCTION validate_material_capture_context();
CREATE INDEX material_source_history_target_idx ON ainuoke_material_source_snapshots(sales_order_id,run_id);
