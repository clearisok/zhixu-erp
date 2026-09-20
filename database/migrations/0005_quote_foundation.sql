-- Q1 only. Independent of reserved 0004_confirmed_commercial_terms.sql.
-- Deliberately distinct from legacy public.quotes. No master-data dependencies.
CREATE TABLE quote_center_quotes (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  quote_code TEXT NOT NULL,
  default_revision_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  metadata JSONB NOT NULL CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE TABLE quote_center_revisions (
  quote_id TEXT NOT NULL REFERENCES quote_center_quotes(id),
  id TEXT NOT NULL CHECK (id <> ''),
  position INTEGER NOT NULL CHECK (position >= 0),
  metadata JSONB NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (quote_id, id), UNIQUE (quote_id, position)
);
ALTER TABLE quote_center_quotes ADD CONSTRAINT quote_center_default_revision_fk
  FOREIGN KEY (id, default_revision_id) REFERENCES quote_center_revisions(quote_id, id)
  DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE quote_center_price_versions (
  quote_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  id TEXT NOT NULL CHECK (id <> ''),
  position INTEGER NOT NULL CHECK (position >= 0),
  quantity NUMERIC,
  metadata JSONB NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (quote_id, revision_id, id), UNIQUE (quote_id, revision_id, position),
  FOREIGN KEY (quote_id, revision_id) REFERENCES quote_center_revisions(quote_id, id)
);
CREATE TABLE quote_center_estimates (
  quote_id TEXT NOT NULL REFERENCES quote_center_quotes(id),
  id TEXT NOT NULL CHECK (id <> ''),
  position INTEGER NOT NULL CHECK (position >= 0),
  is_active BOOLEAN NOT NULL,
  metadata JSONB NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (quote_id, id), UNIQUE (quote_id, is_active, position)
);
CREATE UNIQUE INDEX quote_center_one_active_estimate ON quote_center_estimates(quote_id) WHERE is_active;
-- Shared cost structure, with exactly one price-version or estimate owner.
-- Technical key is a deterministic JSON tuple; all original business IDs survive.
CREATE TABLE quote_center_cost_snapshots (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  revision_id TEXT,
  price_version_id TEXT,
  estimate_id TEXT,
  pricing_metadata JSONB NOT NULL,
  usd_cny_rate NUMERIC, markup_rate NUMERIC, freight_amount NUMERIC,
  labor_metadata JSONB NOT NULL, labor_value NUMERIC,
  confirmation_metadata JSONB,
  quoted_garment_price NUMERIC, confirmed_garment_price NUMERIC,
  quoted_labor_price NUMERIC, confirmed_labor_price NUMERIC,
  CHECK ((revision_id IS NOT NULL AND price_version_id IS NOT NULL AND estimate_id IS NULL)
      OR (revision_id IS NULL AND price_version_id IS NULL AND estimate_id IS NOT NULL)),
  UNIQUE (quote_id, revision_id, price_version_id), UNIQUE (quote_id, estimate_id),
  FOREIGN KEY (quote_id, revision_id, price_version_id) REFERENCES quote_center_price_versions(quote_id, revision_id, id),
  FOREIGN KEY (quote_id, estimate_id) REFERENCES quote_center_estimates(quote_id, id)
);
CREATE TABLE quote_center_fabric_lines (
  snapshot_id TEXT NOT NULL REFERENCES quote_center_cost_snapshots(id),
  id TEXT NOT NULL CHECK (id <> ''), position INTEGER NOT NULL CHECK (position >= 0),
  metadata JSONB NOT NULL,
  segment_length_cm NUMERIC, net_width_cm NUMERIC, gsm NUMERIC, loss_rate NUMERIC, unit_price NUMERIC,
  PRIMARY KEY (snapshot_id, id), UNIQUE (snapshot_id, position)
);
CREATE TABLE quote_center_trim_lines (
  snapshot_id TEXT NOT NULL REFERENCES quote_center_cost_snapshots(id),
  id TEXT NOT NULL CHECK (id <> ''), position INTEGER NOT NULL CHECK (position >= 0),
  metadata JSONB NOT NULL, usage NUMERIC, loss_rate NUMERIC, unit_price NUMERIC,
  PRIMARY KEY (snapshot_id, id), UNIQUE (snapshot_id, position)
);
CREATE TABLE quote_center_other_cost_lines (
  snapshot_id TEXT NOT NULL REFERENCES quote_center_cost_snapshots(id),
  id TEXT NOT NULL CHECK (id <> ''), position INTEGER NOT NULL CHECK (position >= 0),
  metadata JSONB NOT NULL, usage NUMERIC, loss_rate NUMERIC, unit_price NUMERIC, amount NUMERIC,
  PRIMARY KEY (snapshot_id, id), UNIQUE (snapshot_id, position)
);
