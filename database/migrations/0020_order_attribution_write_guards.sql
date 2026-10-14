-- Additive SQL protection for old writers. No identity, price or Source backfill.
-- This fence also detects a pre-normalization REPEATABLE READ snapshot after a
-- writer waits for the advisory lock: a plain view lookup alone is insufficient.
CREATE TABLE sales_order_attribution_write_epoch (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
 version BIGINT NOT NULL DEFAULT 0 CHECK(version>=0)
);
INSERT INTO sales_order_attribution_write_epoch(singleton) VALUES(true);
CREATE FUNCTION advance_order_attribution_write_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE sales_order_attribution_write_epoch SET version=version+1 WHERE singleton;
 RETURN NULL;
END; $$;
CREATE TRIGGER attribution_write_epoch_advance AFTER INSERT OR UPDATE ON sales_order_attribution_heads
 FOR EACH ROW EXECUTE FUNCTION advance_order_attribution_write_epoch();
CREATE FUNCTION lock_order_attribution_write_guard() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('order-effective-attribution',0));
 PERFORM version FROM sales_order_attribution_write_epoch WHERE singleton FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'attribution write fence unavailable' USING ERRCODE='23514'; END IF;
END; $$;
CREATE FUNCTION require_effective_order_write_owner(order_id UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE effective_id UUID;
BEGIN
 PERFORM lock_order_attribution_write_guard();
 SELECT effective_order_id INTO effective_id FROM sales_order_effective_identities WHERE original_order_id=order_id;
 IF effective_id IS NULL THEN
  RAISE EXCEPTION 'effective order does not exist' USING ERRCODE='23503';
 END IF;
 IF effective_id IS DISTINCT FROM order_id THEN
  RAISE EXCEPTION 'historical duplicate cannot receive business writes' USING ERRCODE='23514';
 END IF;
END; $$;
CREATE FUNCTION protect_effective_order_business_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Both identities are checked; reassignment cannot move a historical row out
 -- of an alias before the usual immutable-owner constraints inspect it.
 IF TG_OP<>'INSERT' THEN PERFORM require_effective_order_write_owner((to_jsonb(OLD)->>TG_ARGV[0])::uuid); END IF;
 IF TG_OP<>'DELETE' THEN PERFORM require_effective_order_write_owner((to_jsonb(NEW)->>TG_ARGV[0])::uuid); RETURN NEW; END IF;
 RETURN OLD;
END; $$;
CREATE TRIGGER effective_owner_lifecycle BEFORE UPDATE ON sales_orders
 FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('id');
CREATE TRIGGER effective_owner_delivery_set BEFORE INSERT OR UPDATE OR DELETE ON sales_order_delivery_plan_sets
 FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER effective_owner_delivery_row BEFORE INSERT OR UPDATE OR DELETE ON sales_order_delivery_plans
 FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER effective_owner_identity BEFORE INSERT OR UPDATE OR DELETE ON sales_order_identity_profiles
 FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER effective_owner_commercial_version BEFORE INSERT ON sales_order_commercial_versions
 FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER effective_owner_commercial_head BEFORE INSERT OR UPDATE OR DELETE ON sales_order_commercial_heads
 FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER effective_owner_legacy_cct_link BEFORE INSERT OR UPDATE ON confirmed_commercial_terms_sales_orders
 FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER effective_owner_processing_consumption BEFORE INSERT ON processing_order_batch_consumptions
 FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER effective_owner_new_source_binding BEFORE INSERT ON sales_order_source_links
 FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
-- A source observation is allowed to update its immutable historical owner.
-- It still takes the fence so the delivery-follow decision uses a current view.
CREATE FUNCTION lock_order_source_observation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM lock_order_attribution_write_guard();
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER source_observation_attribution_fence BEFORE INSERT OR UPDATE OR DELETE ON ainuoke_sales_order_contract_mirrors
 FOR EACH ROW EXECUTE FUNCTION lock_order_source_observation();
CREATE TRIGGER source_colors_attribution_fence BEFORE INSERT OR UPDATE OR DELETE ON ainuoke_sales_order_color_mirrors
 FOR EACH ROW EXECUTE FUNCTION lock_order_source_observation();

CREATE FUNCTION protect_ainuoke_run_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM lock_order_attribution_write_guard();
 IF NEW.order_scope_hash IS NULL THEN RAISE EXCEPTION 'current Source order scope required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER source_run_publication_guard BEFORE INSERT ON ainuoke_source_runs FOR EACH ROW EXECUTE FUNCTION protect_ainuoke_run_publication();
CREATE FUNCTION protect_ainuoke_source_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'accepted Source evidence is immutable' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER source_run_immutable BEFORE UPDATE OR DELETE ON ainuoke_source_runs FOR EACH ROW EXECUTE FUNCTION protect_ainuoke_source_evidence();
CREATE TRIGGER source_snapshot_immutable BEFORE UPDATE OR DELETE ON ainuoke_material_source_snapshots FOR EACH ROW EXECUTE FUNCTION protect_ainuoke_source_evidence();
CREATE FUNCTION protect_ainuoke_snapshot_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE epoch UUID;
BEGIN
 PERFORM require_effective_order_write_owner(NEW.sales_order_id);
 SELECT attribution_change_id INTO epoch FROM sales_order_effective_identities WHERE original_order_id=NEW.sales_order_id;
 IF NEW.attribution_change_id IS DISTINCT FROM epoch THEN RAISE EXCEPTION 'current Source attribution generation required' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ainuoke_source_runs WHERE id=NEW.run_id AND order_scope_hash IS NOT NULL) THEN
  RAISE EXCEPTION 'current Source order scope required' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM sales_order_effective_identities v JOIN sales_order_source_links l ON l.sales_order_id=v.original_order_id
  JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=l.sales_order_id AND m.source_id=l.external_id AND m.sales_contract_no=l.sales_contract_no
  WHERE v.effective_order_id=NEW.sales_order_id AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract' AND l.sales_contract_no=NEW.sales_contract_no) THEN
  RAISE EXCEPTION 'snapshot must belong to trusted effective contract' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER source_snapshot_publication_guard BEFORE INSERT ON ainuoke_material_source_snapshots FOR EACH ROW EXECUTE FUNCTION protect_ainuoke_snapshot_publication();
CREATE FUNCTION protect_ainuoke_latest_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Registration/error bookkeeping is not a publication and must not wait for
 -- the attribution lease before the collector's explicit write transaction.
 IF TG_OP='UPDATE' AND NEW.latest_run_id IS NOT DISTINCT FROM OLD.latest_run_id THEN RETURN NEW; END IF;
 IF NEW.latest_run_id IS NULL THEN RETURN NEW; END IF;
 PERFORM lock_order_attribution_write_guard();
 IF NOT EXISTS(SELECT 1 FROM ainuoke_source_runs WHERE id=NEW.latest_run_id AND source_key=NEW.source_key AND order_scope_hash IS NOT NULL) THEN
  RAISE EXCEPTION 'historical Source run cannot be republished as current' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM ainuoke_material_source_snapshots s JOIN sales_order_effective_identities v ON v.original_order_id=s.sales_order_id
  WHERE s.run_id=NEW.latest_run_id AND (v.effective_order_id<>s.sales_order_id OR s.attribution_change_id IS DISTINCT FROM v.attribution_change_id)) THEN
  RAISE EXCEPTION 'stale Source generation cannot be republished as current' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER source_latest_publication_guard BEFORE INSERT OR UPDATE ON ainuoke_source_profiles FOR EACH ROW EXECUTE FUNCTION protect_ainuoke_latest_publication();
-- A legitimately consumed processing batch is an independent order identity.
-- Validate at commit so a whole-group corrective split can restore that identity.
CREATE FUNCTION validate_processing_effective_independence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM sales_order_effective_identities v
  LEFT JOIN sales_order_identity_profiles p ON p.sales_order_id=v.original_order_id
  LEFT JOIN processing_order_batch_consumptions c ON c.sales_order_id=v.original_order_id
  WHERE (p.business_type='processing' OR c.sales_order_id IS NOT NULL)
  AND (v.effective_order_id<>v.original_order_id OR EXISTS(SELECT 1 FROM sales_order_effective_identities other WHERE other.effective_order_id=v.effective_order_id AND other.original_order_id<>v.original_order_id))) THEN
  RAISE EXCEPTION 'processing batch identities must remain independent effective orders' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER attribution_processing_independence AFTER INSERT OR UPDATE ON sales_order_attribution_heads
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_processing_effective_independence();
CREATE CONSTRAINT TRIGGER processing_effective_independence AFTER INSERT ON processing_order_batch_consumptions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_processing_effective_independence();
CREATE CONSTRAINT TRIGGER processing_profile_effective_independence AFTER INSERT ON sales_order_identity_profiles
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_processing_effective_independence();

-- Binding/mirror writes can create a trusted contract after a mapping already
-- exists. Head-only validation would miss that second path into identity.
CREATE TRIGGER source_binding_attribution_fence BEFORE UPDATE OR DELETE ON sales_order_source_links
 FOR EACH ROW EXECUTE FUNCTION lock_order_source_observation();
CREATE FUNCTION validate_effective_contract_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT v.effective_order_id FROM sales_order_effective_identities v
  JOIN sales_order_source_links l ON l.sales_order_id=v.original_order_id AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract'
  JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=l.sales_order_id AND m.source_id=l.external_id AND m.sales_contract_no=l.sales_contract_no
  GROUP BY v.effective_order_id HAVING count(DISTINCT l.external_id)>1) THEN
  RAISE EXCEPTION 'distinct trusted contracts cannot share one effective SO' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM sales_order_effective_identities v
  JOIN sales_order_source_links l ON l.sales_order_id=v.original_order_id AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract'
  JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=l.sales_order_id AND m.source_id=l.external_id AND m.sales_contract_no=l.sales_contract_no
  JOIN sales_order_effective_identities member ON member.effective_order_id=v.effective_order_id
  LEFT JOIN sales_order_identity_profiles p ON p.sales_order_id=member.original_order_id
  LEFT JOIN processing_order_batch_consumptions c ON c.sales_order_id=member.original_order_id
  WHERE p.business_type='processing' OR c.sales_order_id IS NOT NULL) THEN
  RAISE EXCEPTION 'processing orders cannot acquire an Ainuoke contract' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER source_binding_effective_ownership AFTER INSERT OR UPDATE OR DELETE ON sales_order_source_links
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_effective_contract_ownership();
CREATE CONSTRAINT TRIGGER source_mirror_effective_ownership AFTER INSERT OR UPDATE OR DELETE ON ainuoke_sales_order_contract_mirrors
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_effective_contract_ownership();
