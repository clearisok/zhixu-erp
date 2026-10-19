-- Forward only: old ownership/preparation/history is retained, never inferred or backfilled.
CREATE TABLE sales_order_business_source_snapshots (
 commercial_version_id UUID PRIMARY KEY,
 sales_order_id UUID NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('quote','reorder')),
 reference_order_id UUID REFERENCES sales_orders(id) ON DELETE RESTRICT,
 reference_commercial_version_id UUID,
 product_snapshot JSONB NOT NULL CHECK (jsonb_typeof(product_snapshot)='object'),
 product_hash TEXT NOT NULL CHECK (product_hash ~ '^[0-9a-f]{64}$'),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(sales_order_id,commercial_version_id) REFERENCES sales_order_commercial_versions(sales_order_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(reference_order_id,reference_commercial_version_id) REFERENCES sales_order_commercial_versions(sales_order_id,id) ON DELETE RESTRICT,
 CHECK ((kind='quote' AND reference_order_id IS NULL AND reference_commercial_version_id IS NULL)
 OR (kind='reorder' AND reference_order_id IS NOT NULL AND reference_commercial_version_id IS NOT NULL AND reference_order_id<>sales_order_id))
);
CREATE TRIGGER business_source_snapshot_immutable BEFORE UPDATE OR DELETE ON sales_order_business_source_snapshots FOR EACH ROW EXECUTE FUNCTION protect_order_commercial_version();
CREATE TRIGGER business_source_snapshot_command_gate BEFORE INSERT ON sales_order_business_source_snapshots FOR EACH ROW EXECUTE FUNCTION protect_order_command_write();
CREATE FUNCTION validate_business_source_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original sales_order_business_source_snapshots; original_price sales_order_commercial_versions; adopted sales_order_commercial_versions;
BEGIN
 IF NEW.kind='reorder' THEN
  SELECT * INTO original FROM sales_order_business_source_snapshots WHERE commercial_version_id=NEW.reference_commercial_version_id AND sales_order_id=NEW.reference_order_id;
  SELECT * INTO original_price FROM sales_order_commercial_versions WHERE id=NEW.reference_commercial_version_id;
  SELECT * INTO adopted FROM sales_order_commercial_versions WHERE id=NEW.commercial_version_id;
  IF original.commercial_version_id IS NULL OR original.product_snapshot IS DISTINCT FROM NEW.product_snapshot OR original.product_hash IS DISTINCT FROM NEW.product_hash
  OR ROW(original_price.quote_id,original_price.revision_id,original_price.price_version_id,original_price.confirmed_sale_price,original_price.sale_currency,original_price.confirmed_labor_price,original_price.labor_currency,original_price.quote_type)
  IS DISTINCT FROM ROW(adopted.quote_id,adopted.revision_id,adopted.price_version_id,adopted.confirmed_sale_price,adopted.sale_currency,adopted.confirmed_labor_price,adopted.labor_currency,adopted.quote_type) THEN
   RAISE EXCEPTION 'reorder must preserve the original product and prices' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER business_source_snapshot_validation BEFORE INSERT ON sales_order_business_source_snapshots FOR EACH ROW EXECUTE FUNCTION validate_business_source_snapshot();
