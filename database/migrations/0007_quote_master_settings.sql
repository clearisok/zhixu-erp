-- Q3A Server authority only. This migration does not import Browser data.
-- TEXT identities allow a future controlled import to preserve legacy IDs;
-- normal runtime creation is restricted to Server-generated UUIDs.
CREATE TABLE quote_master_brands (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  normalized_name TEXT NOT NULL CHECK (normalized_name <> ''),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  default_usd_cny_rate NUMERIC CHECK (default_usd_cny_rate IS NULL OR default_usd_cny_rate >= 0),
  default_other_cost_name TEXT,
  default_other_cost_amount NUMERIC CHECK (default_other_cost_amount IS NULL OR default_other_cost_amount >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (default_other_cost_name IS NULL OR btrim(default_other_cost_name) <> ''),
  CHECK (default_other_cost_name IS NOT NULL OR default_other_cost_amount IS NULL),
  UNIQUE (normalized_name)
);

CREATE TABLE quote_master_customer_salespeople (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  normalized_name TEXT NOT NULL CHECK (normalized_name <> ''),
  brand_id TEXT NOT NULL REFERENCES quote_master_brands(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  default_usd_cny_rate NUMERIC CHECK (default_usd_cny_rate IS NULL OR default_usd_cny_rate >= 0),
  default_other_cost_name TEXT,
  default_other_cost_amount NUMERIC CHECK (default_other_cost_amount IS NULL OR default_other_cost_amount >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (default_other_cost_name IS NULL OR btrim(default_other_cost_name) <> ''),
  CHECK (default_other_cost_name IS NOT NULL OR default_other_cost_amount IS NULL),
  UNIQUE (normalized_name)
);
CREATE INDEX quote_master_customer_salespeople_brand_idx
  ON quote_master_customer_salespeople(brand_id, status, normalized_name);

CREATE TABLE quote_master_fabrics (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  normalized_name TEXT NOT NULL CHECK (normalized_name <> ''),
  composition TEXT NOT NULL DEFAULT '',
  net_width_cm NUMERIC CHECK (net_width_cm IS NULL OR net_width_cm >= 0),
  gsm NUMERIC CHECK (gsm IS NULL OR gsm >= 0),
  default_loss_rate NUMERIC CHECK (default_loss_rate IS NULL OR default_loss_rate >= 0),
  supplier TEXT NOT NULL DEFAULT '',
  unit_price NUMERIC CHECK (unit_price IS NULL OR unit_price >= 0),
  purchase_unit TEXT NOT NULL CHECK (purchase_unit IN ('kg', 'meter')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX quote_master_fabrics_search_idx ON quote_master_fabrics(normalized_name);

CREATE TABLE quote_master_trims (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  normalized_name TEXT NOT NULL CHECK (normalized_name <> ''),
  specification TEXT NOT NULL DEFAULT '',
  supplier TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL CHECK (btrim(unit) <> ''),
  default_loss_rate NUMERIC CHECK (default_loss_rate IS NULL OR default_loss_rate >= 0),
  unit_price NUMERIC CHECK (unit_price IS NULL OR unit_price >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX quote_master_trims_search_idx ON quote_master_trims(normalized_name);

-- The authoritative target deliberately has no quantity or usage column.
CREATE TABLE quote_master_default_trim_configs (
  id TEXT NOT NULL CHECK (id <> ''),
  brand_id TEXT REFERENCES quote_master_brands(id) ON DELETE CASCADE,
  customer_salesperson_id TEXT REFERENCES quote_master_customer_salespeople(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  trim_library_item_id TEXT NOT NULL REFERENCES quote_master_trims(id),
  override_loss_rate NUMERIC CHECK (override_loss_rate IS NULL OR override_loss_rate >= 0),
  override_unit_price NUMERIC CHECK (override_unit_price IS NULL OR override_unit_price >= 0),
  CHECK (num_nonnulls(brand_id, customer_salesperson_id) = 1),
  UNIQUE NULLS NOT DISTINCT (brand_id, customer_salesperson_id, id),
  UNIQUE NULLS NOT DISTINCT (brand_id, customer_salesperson_id, position)
);

CREATE TABLE quote_manufacturing_presets (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  country TEXT NOT NULL CHECK (btrim(country) <> ''),
  labor_currency TEXT NOT NULL CHECK (labor_currency IN ('CNY', 'USD')),
  markup_rate NUMERIC CHECK (markup_rate IS NULL OR markup_rate >= 0),
  include_freight BOOLEAN NOT NULL,
  freight_name TEXT NOT NULL DEFAULT '运费',
  freight_amount NUMERIC CHECK (freight_amount IS NULL OR freight_amount >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No row is seeded: a future authorized migration owns real settings values.
CREATE TABLE quote_global_settings (
  singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
  default_usd_cny_rate NUMERIC CHECK (default_usd_cny_rate IS NULL OR default_usd_cny_rate >= 0),
  default_markup_rate NUMERIC CHECK (default_markup_rate IS NULL OR default_markup_rate >= 0),
  default_labor_currency TEXT NOT NULL CHECK (default_labor_currency IN ('CNY', 'USD')),
  default_labor_description TEXT NOT NULL,
  default_other_cost_name TEXT,
  default_other_cost_amount NUMERIC CHECK (default_other_cost_amount IS NULL OR default_other_cost_amount >= 0),
  default_manufacturing_preset_id TEXT REFERENCES quote_manufacturing_presets(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (default_other_cost_name IS NULL OR btrim(default_other_cost_name) <> ''),
  CHECK (default_other_cost_name IS NOT NULL OR default_other_cost_amount IS NULL)
);
