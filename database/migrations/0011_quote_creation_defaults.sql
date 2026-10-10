-- Explicit future-draft defaults only. Existing rows remain unconfigured;
-- no Quote / Revision / PriceVersion is backfilled or rewritten.
ALTER TABLE quote_global_settings
  ADD COLUMN default_quote_type TEXT CHECK (default_quote_type IN ('processing', 'distribution')),
  ADD COLUMN default_manufacturing_country TEXT
    CHECK (default_manufacturing_country IS NULL OR
      (length(default_manufacturing_country) BETWEEN 1 AND 200 AND
       default_manufacturing_country = btrim(default_manufacturing_country)));
