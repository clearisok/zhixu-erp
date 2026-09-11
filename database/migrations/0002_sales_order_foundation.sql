CREATE TABLE sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no TEXT NOT NULL CHECK (order_no = upper(btrim(order_no)) AND order_no <> ''),
  creation_source TEXT NOT NULL CHECK (creation_source IN ('quote', 'reorder', 'manual', 'ainuoke')),
  lifecycle_state TEXT NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_state IN ('draft', 'confirmed', 'active', 'completed', 'cancelled')),
  source_order_id UUID REFERENCES sales_orders(id) ON DELETE RESTRICT,
  source_quote_id TEXT,
  source_revision_id TEXT,
  source_price_version_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sales_orders_order_no_normalized_uidx
  ON sales_orders(upper(btrim(order_no)));

CREATE OR REPLACE FUNCTION protect_sales_order_identity_and_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.creation_source IS DISTINCT FROM NEW.creation_source
     OR OLD.source_order_id IS DISTINCT FROM NEW.source_order_id
     OR OLD.source_quote_id IS DISTINCT FROM NEW.source_quote_id
     OR OLD.source_revision_id IS DISTINCT FROM NEW.source_revision_id
     OR OLD.source_price_version_id IS DISTINCT FROM NEW.source_price_version_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'sales_orders identity and creation provenance are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'sales_orders version must increment by exactly one' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_orders_identity_and_version
BEFORE UPDATE ON sales_orders
FOR EACH ROW EXECUTE FUNCTION protect_sales_order_identity_and_version();

CREATE TABLE sales_order_source_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
  source_system TEXT NOT NULL CHECK (btrim(source_system) <> ''),
  source_entity_type TEXT NOT NULL CHECK (btrim(source_entity_type) <> ''),
  external_id TEXT NOT NULL CHECK (btrim(external_id) <> ''),
  sales_contract_no TEXT,
  inside_order_no TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_system, source_entity_type, external_id)
);

CREATE UNIQUE INDEX sales_order_source_links_contract_uidx
  ON sales_order_source_links(source_system, source_entity_type, upper(btrim(sales_contract_no)))
  WHERE sales_contract_no IS NOT NULL AND btrim(sales_contract_no) <> '';
CREATE INDEX sales_order_source_links_order_idx ON sales_order_source_links(sales_order_id);

CREATE OR REPLACE FUNCTION protect_sales_order_source_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.sales_order_id IS DISTINCT FROM NEW.sales_order_id
     OR OLD.source_system IS DISTINCT FROM NEW.source_system
     OR OLD.source_entity_type IS DISTINCT FROM NEW.source_entity_type
     OR OLD.external_id IS DISTINCT FROM NEW.external_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'sales_order_source_links binding is immutable' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_order_source_links_binding
BEFORE UPDATE ON sales_order_source_links
FOR EACH ROW EXECUTE FUNCTION protect_sales_order_source_binding();

CREATE TABLE ainuoke_sales_order_contract_mirrors (
  sales_order_id UUID PRIMARY KEY REFERENCES sales_orders(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL CHECK (btrim(source_id) <> ''),
  source_row_identity TEXT NOT NULL CHECK (btrim(source_row_identity) <> ''),
  sales_contract_no TEXT NOT NULL CHECK (btrim(sales_contract_no) <> ''),
  inside_order_no TEXT NOT NULL CHECK (btrim(inside_order_no) <> ''),
  lifecycle_status_raw TEXT NOT NULL DEFAULT '',
  contract_date DATE,
  contract_delivery_date DATE,
  style_no TEXT NOT NULL DEFAULT '',
  company_name_snapshot TEXT NOT NULL DEFAULT '',
  customer_name_snapshot TEXT NOT NULL DEFAULT '',
  brand_name_snapshot TEXT NOT NULL DEFAULT '',
  quantity NUMERIC NOT NULL CHECK (quantity >= 0),
  source_hash TEXT NOT NULL CHECK (btrim(source_hash) <> ''),
  fetched_at TIMESTAMPTZ NOT NULL,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id),
  UNIQUE (source_row_identity),
  UNIQUE (sales_contract_no)
);

CREATE TABLE ainuoke_sales_order_color_mirrors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  source_line_identity TEXT NOT NULL CHECK (btrim(source_line_identity) <> ''),
  color_name TEXT NOT NULL CHECK (btrim(color_name) <> ''),
  quantity NUMERIC NOT NULL CHECK (quantity >= 0),
  delivery_date DATE,
  source_hash TEXT NOT NULL CHECK (btrim(source_hash) <> ''),
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sales_order_id, source_line_identity)
);

CREATE INDEX ainuoke_sales_order_color_order_idx
  ON ainuoke_sales_order_color_mirrors(sales_order_id, color_name, source_line_identity);
