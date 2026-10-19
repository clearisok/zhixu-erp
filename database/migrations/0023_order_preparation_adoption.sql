-- Forward-only preparation intent/adoption; no SO, price, account or history backfill.
CREATE TABLE sales_order_preparation_commercial_refs (
 preparation_id UUID PRIMARY KEY REFERENCES sales_order_preparations(id) ON DELETE RESTRICT,
 quote_id TEXT NOT NULL REFERENCES quote_center_quotes(id) ON DELETE RESTRICT,
 revision_id TEXT NOT NULL CHECK(length(btrim(revision_id)) BETWEEN 1 AND 256),
 price_version_id TEXT NOT NULL CHECK(length(btrim(price_version_id)) BETWEEN 1 AND 256),
 observed_quote_version INTEGER NOT NULL CHECK(observed_quote_version>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER preparation_commercial_ref_immutable BEFORE UPDATE OR DELETE ON sales_order_preparation_commercial_refs FOR EACH ROW EXECUTE FUNCTION protect_order_preparation();
ALTER TABLE sales_order_identity_profiles ADD COLUMN preparation_id UUID REFERENCES sales_order_preparations(id) ON DELETE RESTRICT;
CREATE TABLE sales_order_preparation_adoptions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 preparation_id UUID NOT NULL REFERENCES sales_order_preparations(id) ON DELETE RESTRICT,
 reference_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 previous_identity JSONB NOT NULL CHECK(jsonb_typeof(previous_identity)='object' AND octet_length(previous_identity::text)<=32768),
 applied_profile_version INTEGER NOT NULL CHECK(applied_profile_version>0),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(actor_id,request_id),
 UNIQUE(sales_order_id,applied_profile_version),
 CHECK(reference_order_id<>sales_order_id)
);
CREATE INDEX preparation_adoptions_by_order ON sales_order_preparation_adoptions(sales_order_id,created_at DESC,id DESC);
CREATE INDEX preparation_adoptions_by_preparation ON sales_order_preparation_adoptions(preparation_id,sales_order_id);
CREATE TRIGGER preparation_adoption_immutable BEFORE UPDATE OR DELETE ON sales_order_preparation_adoptions FOR EACH ROW EXECUTE FUNCTION protect_order_preparation();
CREATE TRIGGER effective_owner_preparation_adoption BEFORE INSERT ON sales_order_preparation_adoptions FOR EACH ROW EXECUTE FUNCTION protect_effective_order_business_write('sales_order_id');
CREATE TRIGGER order_command_gate_preparation_adoption BEFORE INSERT ON sales_order_preparation_adoptions FOR EACH ROW EXECUTE FUNCTION protect_order_command_write();
CREATE FUNCTION validate_preparation_identity_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p sales_order_preparations;
BEGIN
 IF NEW.preparation_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO p FROM sales_order_preparations WHERE id=NEW.preparation_id;
 IF p.id IS NULL OR NEW.business_type<>'ainuoke_contract' OR NEW.lineage<>'reorder' OR NEW.reference_order_id IS DISTINCT FROM p.reference_order_id OR NEW.specification_changes IS DISTINCT FROM p.specification_changes THEN
  RAISE EXCEPTION 'preparation identity facts mismatch' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' OR NEW.preparation_id IS DISTINCT FROM OLD.preparation_id THEN
  IF NOT EXISTS(SELECT 1 FROM sales_order_preparation_adoptions a WHERE a.sales_order_id=NEW.sales_order_id AND a.preparation_id=NEW.preparation_id AND a.applied_profile_version=NEW.version) THEN
   RAISE EXCEPTION 'preparation must have an immutable adoption receipt' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER preparation_identity_reference AFTER INSERT OR UPDATE ON sales_order_identity_profiles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_preparation_identity_reference();
CREATE FUNCTION validate_preparation_adoption_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sales_order_preparations p JOIN sales_order_identity_profiles i ON i.sales_order_id=NEW.sales_order_id WHERE p.id=NEW.preparation_id AND p.reference_order_id=NEW.reference_order_id AND i.preparation_id=p.id AND i.business_type='ainuoke_contract' AND i.lineage='reorder' AND i.reference_order_id=p.reference_order_id AND i.specification_changes=p.specification_changes AND i.version=NEW.applied_profile_version AND i.owner_id IS NOT NULL) THEN
  RAISE EXCEPTION 'preparation adoption must match current claimed identity' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER preparation_adoption_reference AFTER INSERT ON sales_order_preparation_adoptions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_preparation_adoption_receipt();

-- Reference insertions take the same fence as full normalization evidence.
CREATE TRIGGER preparation_reference_insert_fence BEFORE INSERT ON sales_order_preparations FOR EACH ROW EXECUTE FUNCTION lock_order_source_observation();
CREATE TRIGGER preparation_commercial_insert_fence BEFORE INSERT ON sales_order_preparation_commercial_refs FOR EACH ROW EXECUTE FUNCTION lock_order_source_observation();
