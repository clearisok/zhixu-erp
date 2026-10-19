-- Additive v2 extension. Existing version rows, mirrors and migration checksums stay intact.
ALTER TABLE sales_order_commercial_versions ADD COLUMN pricing_scope TEXT NOT NULL DEFAULT 'legacy_uniform' CHECK(pricing_scope IN ('legacy_uniform','line_items'));
ALTER TABLE sales_order_commercial_versions ADD COLUMN change_kind TEXT NOT NULL DEFAULT 'source_adoption' CHECK(change_kind IN ('source_adoption','sale_adjustment','source_replacement'));
ALTER TABLE sales_order_commercial_versions ADD COLUMN previous_version_id UUID;
ALTER TABLE sales_order_commercial_versions ADD FOREIGN KEY(sales_order_id,previous_version_id) REFERENCES sales_order_commercial_versions(sales_order_id,id) ON DELETE RESTRICT;
ALTER TABLE sales_order_commercial_versions ALTER COLUMN price_version_id DROP NOT NULL;
ALTER TABLE sales_order_commercial_versions ALTER COLUMN source_confirmed_at DROP NOT NULL;
ALTER TABLE sales_order_commercial_versions ALTER COLUMN confirmed_labor_price DROP NOT NULL;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='sales_order_commercial_versions'::regclass AND contype='c'
 AND (pg_get_constraintdef(oid) LIKE '%source_kind%' OR pg_get_constraintdef(oid) LIKE '%quote_type%confirmed_sale_price%') LOOP
 EXECUTE format('ALTER TABLE sales_order_commercial_versions DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE sales_order_commercial_versions ADD CONSTRAINT commercial_v2_source CHECK(
 (pricing_scope='legacy_uniform' AND price_version_id IS NOT NULL AND confirmed_labor_price IS NOT NULL AND source_confirmed_at IS NOT NULL
  AND ((source_kind='cct' AND source_cct_id IS NOT NULL AND source_cct_version>0) OR (source_kind='quote_confirmation' AND source_cct_id IS NULL AND source_cct_version IS NULL))
  AND ((quote_type='distribution' AND confirmed_sale_price IS NOT NULL) OR (quote_type='processing' AND confirmed_sale_price IS NULL)))
 OR (pricing_scope='line_items' AND source_kind='line_items' AND source_cct_id IS NULL AND source_cct_version IS NULL));

CREATE TABLE sales_order_color_identities (
 id UUID PRIMARY KEY,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 business_key TEXT NOT NULL,
 color_name TEXT NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(sales_order_id,business_key),UNIQUE(sales_order_id,id)
);
CREATE TRIGGER order_color_identity_immutable BEFORE UPDATE OR DELETE ON sales_order_color_identities FOR EACH ROW EXECUTE FUNCTION protect_order_commercial_version();
CREATE TABLE sales_order_commercial_lines (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 sales_order_id UUID NOT NULL,
 commercial_version_id UUID NOT NULL,
 position INTEGER NOT NULL CHECK(position>=0),
 color_id UUID,
 color_name TEXT,
 quantity_snapshot NUMERIC,
 price_version_id TEXT NOT NULL,
 price_version_name TEXT NOT NULL,
 source_snapshot JSONB NOT NULL CHECK(jsonb_typeof(source_snapshot)='object'),
 product_snapshot JSONB NOT NULL CHECK(jsonb_typeof(product_snapshot)='object'),
 product_hash TEXT NOT NULL CHECK(length(product_hash)=64),
 base_sale_price NUMERIC,
 actual_sale_price NUMERIC,
 labor_price NUMERIC NOT NULL CHECK(labor_price>=0 AND labor_price::text NOT IN ('NaN','Infinity','-Infinity')),
 labor_currency TEXT NOT NULL CHECK(labor_currency IN ('CNY','USD')),
 CHECK(base_sale_price IS NULL OR (base_sale_price>=0 AND base_sale_price::text NOT IN ('NaN','Infinity','-Infinity'))),
 CHECK(actual_sale_price IS NULL OR (actual_sale_price>=0 AND actual_sale_price::text NOT IN ('NaN','Infinity','-Infinity'))),
 FOREIGN KEY(sales_order_id,commercial_version_id) REFERENCES sales_order_commercial_versions(sales_order_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(sales_order_id,color_id) REFERENCES sales_order_color_identities(sales_order_id,id) ON DELETE RESTRICT,
 UNIQUE(commercial_version_id,position)
);
CREATE UNIQUE INDEX commercial_line_color_unique ON sales_order_commercial_lines(commercial_version_id,color_id) WHERE color_id IS NOT NULL;
CREATE UNIQUE INDEX commercial_whole_order_line_unique ON sales_order_commercial_lines(commercial_version_id) WHERE color_id IS NULL;
CREATE TRIGGER commercial_line_immutable BEFORE UPDATE OR DELETE ON sales_order_commercial_lines FOR EACH ROW EXECUTE FUNCTION protect_order_commercial_version();
CREATE TRIGGER commercial_line_command_gate BEFORE INSERT ON sales_order_commercial_lines FOR EACH ROW EXECUTE FUNCTION protect_order_command_write();
CREATE FUNCTION protect_adopted_commercial_line_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM sales_order_commercial_heads h JOIN sales_order_commercial_versions v ON v.sales_order_id=h.sales_order_id WHERE v.id=NEW.commercial_version_id AND h.version>=v.version) THEN
  RAISE EXCEPTION 'adopted commercial lines are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commercial_line_insert_guard BEFORE INSERT ON sales_order_commercial_lines FOR EACH ROW EXECUTE FUNCTION protect_adopted_commercial_line_insert();
CREATE FUNCTION validate_commercial_v2_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v sales_order_commercial_versions; n integer; BEGIN
 SELECT * INTO v FROM sales_order_commercial_versions WHERE id=NEW.current_version_id AND sales_order_id=NEW.sales_order_id;
 IF v.pricing_scope='line_items' THEN
  SELECT count(*) INTO n FROM sales_order_commercial_lines WHERE commercial_version_id=v.id;
  IF n=0 OR EXISTS(SELECT 1 FROM sales_order_commercial_lines l WHERE l.commercial_version_id=v.id AND ((v.quote_type='processing' AND (l.base_sale_price IS NOT NULL OR l.actual_sale_price IS NOT NULL)) OR (v.quote_type='distribution' AND (l.base_sale_price IS NULL OR l.actual_sale_price IS NULL)))) THEN
   RAISE EXCEPTION 'commercial version requires complete typed lines' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commercial_v2_head_validation BEFORE INSERT OR UPDATE ON sales_order_commercial_heads FOR EACH ROW EXECUTE FUNCTION validate_commercial_v2_head();
