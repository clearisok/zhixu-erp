-- Additive G1. No legacy classification/backfill, no account/role grants.
CREATE TABLE sales_order_identity_profiles (
 sales_order_id UUID PRIMARY KEY REFERENCES sales_orders(id) ON DELETE RESTRICT,
 business_type TEXT NOT NULL CHECK (business_type IN ('ainuoke_contract','processing')),
 owner_id BIGINT REFERENCES app_users(id) ON DELETE RESTRICT,
 lineage TEXT NOT NULL DEFAULT 'pending' CHECK(lineage IN ('pending','first','reorder')),
 reference_order_id UUID REFERENCES sales_orders(id) ON DELETE RESTRICT,
 specification_changes TEXT NOT NULL DEFAULT '' CHECK(length(specification_changes)<=4000),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK ((lineage='reorder' AND reference_order_id IS NOT NULL) OR (lineage<>'reorder' AND reference_order_id IS NULL)),
 CHECK(reference_order_id IS DISTINCT FROM sales_order_id)
);
CREATE TABLE sales_order_preparations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 payload_hash TEXT NOT NULL,
 reference_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 quantity NUMERIC NOT NULL CHECK(quantity>0),
 delivery_date DATE,
 specification_changes TEXT NOT NULL CHECK(length(specification_changes)<=4000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(actor_id,request_id)
);
CREATE FUNCTION protect_order_identity_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'identity profile cannot be deleted'; END IF;
 IF OLD.sales_order_id IS DISTINCT FROM NEW.sales_order_id OR OLD.business_type IS DISTINCT FROM NEW.business_type
 OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'identity/profile version is immutable or stale'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_order_identity_profile BEFORE UPDATE OR DELETE ON sales_order_identity_profiles FOR EACH ROW EXECUTE FUNCTION protect_order_identity_profile();
CREATE FUNCTION protect_order_preparation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'preparation history is append-only'; END; $$;
CREATE TRIGGER protect_order_preparation BEFORE UPDATE OR DELETE ON sales_order_preparations FOR EACH ROW EXECUTE FUNCTION protect_order_preparation();
