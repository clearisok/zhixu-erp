CREATE TABLE confirmed_commercial_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_scope TEXT NOT NULL CHECK (ownership_scope IN ('quote', 'sales_order')),
  quote_id TEXT,
  revision_id TEXT,
  price_version_id TEXT,
  customer_confirmed_price NUMERIC,
  confirmed_labor_price NUMERIC,
  labor_currency TEXT CHECK (labor_currency IN ('CNY', 'USD')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (ownership_scope = 'quote'
      AND quote_id IS NOT NULL AND btrim(quote_id) <> ''
      AND revision_id IS NOT NULL AND btrim(revision_id) <> ''
      AND price_version_id IS NOT NULL AND btrim(price_version_id) <> '')
    OR
    (ownership_scope = 'sales_order'
      AND quote_id IS NULL AND revision_id IS NULL AND price_version_id IS NULL)
  ),
  CHECK (customer_confirmed_price IS NULL OR (
    customer_confirmed_price >= 0
    AND customer_confirmed_price::text NOT IN ('NaN', 'Infinity', '-Infinity')
  )),
  CHECK (confirmed_labor_price IS NULL OR (
    confirmed_labor_price >= 0
    AND confirmed_labor_price::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND labor_currency IS NOT NULL
  ))
);

CREATE UNIQUE INDEX confirmed_commercial_terms_quote_provenance_uidx
  ON confirmed_commercial_terms(quote_id, revision_id, price_version_id)
  WHERE ownership_scope = 'quote';

CREATE TABLE confirmed_commercial_terms_sales_orders (
  sales_order_id UUID PRIMARY KEY REFERENCES sales_orders(id) ON DELETE RESTRICT,
  confirmed_commercial_terms_id UUID NOT NULL REFERENCES confirmed_commercial_terms(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX confirmed_commercial_terms_sales_orders_terms_idx
  ON confirmed_commercial_terms_sales_orders(confirmed_commercial_terms_id, sales_order_id);

CREATE OR REPLACE FUNCTION protect_confirmed_commercial_terms_identity_and_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.ownership_scope IS DISTINCT FROM NEW.ownership_scope
     OR OLD.quote_id IS DISTINCT FROM NEW.quote_id
     OR OLD.revision_id IS DISTINCT FROM NEW.revision_id
     OR OLD.price_version_id IS DISTINCT FROM NEW.price_version_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'confirmed commercial terms identity and provenance are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'confirmed commercial terms version must increment by exactly one' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER confirmed_commercial_terms_identity_and_version
BEFORE UPDATE ON confirmed_commercial_terms
FOR EACH ROW EXECUTE FUNCTION protect_confirmed_commercial_terms_identity_and_version();

CREATE OR REPLACE FUNCTION prevent_confirmed_commercial_terms_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'confirmed commercial terms cannot be deleted' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER confirmed_commercial_terms_delete_prohibited
BEFORE DELETE ON confirmed_commercial_terms
FOR EACH ROW EXECUTE FUNCTION prevent_confirmed_commercial_terms_delete();

CREATE OR REPLACE FUNCTION validate_confirmed_commercial_terms_sales_order_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  terms confirmed_commercial_terms%ROWTYPE;
  sales_order sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO STRICT terms
  FROM confirmed_commercial_terms
  WHERE id = NEW.confirmed_commercial_terms_id;

  SELECT * INTO STRICT sales_order
  FROM sales_orders
  WHERE id = NEW.sales_order_id;

  IF terms.ownership_scope = 'quote' THEN
    IF sales_order.source_quote_id IS DISTINCT FROM terms.quote_id
       OR sales_order.source_revision_id IS DISTINCT FROM terms.revision_id
       OR sales_order.source_price_version_id IS DISTINCT FROM terms.price_version_id THEN
      RAISE EXCEPTION 'sales order and confirmed commercial terms quote provenance must match exactly' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF sales_order.source_quote_id IS NOT NULL
       OR sales_order.source_revision_id IS NOT NULL
       OR sales_order.source_price_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'sales-order-owned commercial terms require an unlinked sales order' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM confirmed_commercial_terms_sales_orders existing
      WHERE existing.confirmed_commercial_terms_id = NEW.confirmed_commercial_terms_id
        AND existing.sales_order_id <> NEW.sales_order_id
    ) THEN
      RAISE EXCEPTION 'sales-order-owned commercial terms may belong to only one sales order' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER confirmed_commercial_terms_sales_order_link_valid
BEFORE INSERT OR UPDATE ON confirmed_commercial_terms_sales_orders
FOR EACH ROW EXECUTE FUNCTION validate_confirmed_commercial_terms_sales_order_link();

CREATE OR REPLACE FUNCTION protect_confirmed_commercial_terms_sales_order_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR OLD.sales_order_id IS DISTINCT FROM NEW.sales_order_id
     OR OLD.confirmed_commercial_terms_id IS DISTINCT FROM NEW.confirmed_commercial_terms_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'confirmed commercial terms sales order association is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER confirmed_commercial_terms_sales_order_link_immutable
BEFORE UPDATE OR DELETE ON confirmed_commercial_terms_sales_orders
FOR EACH ROW EXECUTE FUNCTION protect_confirmed_commercial_terms_sales_order_link();
