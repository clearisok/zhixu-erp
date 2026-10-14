-- Gate2 additive schema only. Never backfill historical prices or modify shared CCT.
CREATE TABLE sales_order_commercial_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
 quote_id TEXT NOT NULL CHECK(btrim(quote_id)<>''),
 revision_id TEXT NOT NULL CHECK(btrim(revision_id)<>''),
 price_version_id TEXT NOT NULL CHECK(btrim(price_version_id)<>''),
 source_quote_version INTEGER NOT NULL CHECK(source_quote_version>0),
 source_kind TEXT NOT NULL CHECK(source_kind IN ('quote_confirmation','cct')),
 source_cct_id UUID,
 source_cct_version INTEGER,
 source_fingerprint TEXT NOT NULL CHECK(length(source_fingerprint)=64),
 quote_type TEXT NOT NULL CHECK(quote_type IN ('distribution','processing')),
 confirmed_sale_price NUMERIC,
 sale_currency TEXT NOT NULL DEFAULT 'CNY' CHECK(sale_currency='CNY'),
 confirmed_labor_price NUMERIC NOT NULL,
 labor_currency TEXT NOT NULL CHECK(labor_currency IN ('CNY','USD')),
 reason TEXT NOT NULL CHECK(length(btrim(reason))>0 AND length(reason)<=2000),
 adopted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((source_kind='cct' AND source_cct_id IS NOT NULL AND source_cct_version IS NOT NULL AND source_cct_version>0) OR (source_kind='quote_confirmation' AND source_cct_id IS NULL AND source_cct_version IS NULL)),
 CHECK((quote_type='distribution' AND confirmed_sale_price IS NOT NULL) OR (quote_type='processing' AND confirmed_sale_price IS NULL)),
 CHECK(confirmed_sale_price IS NULL OR (confirmed_sale_price>=0 AND confirmed_sale_price::text NOT IN ('NaN','Infinity','-Infinity'))),
 CHECK(confirmed_labor_price>=0 AND confirmed_labor_price::text NOT IN ('NaN','Infinity','-Infinity')),
 UNIQUE(sales_order_id,version), UNIQUE(actor_id,request_id), UNIQUE(sales_order_id,id)
);
CREATE TABLE sales_order_commercial_heads (
 sales_order_id UUID PRIMARY KEY REFERENCES sales_orders(id) ON DELETE RESTRICT,
 current_version_id UUID NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 FOREIGN KEY(sales_order_id,current_version_id) REFERENCES sales_order_commercial_versions(sales_order_id,id) ON DELETE RESTRICT
);
CREATE FUNCTION protect_order_commercial_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'adopted order commercial version is immutable' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER protect_order_commercial_version BEFORE UPDATE OR DELETE ON sales_order_commercial_versions FOR EACH ROW EXECUTE FUNCTION protect_order_commercial_version();
CREATE FUNCTION protect_order_commercial_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE adopted_version INTEGER;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'commercial head cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (OLD.sales_order_id IS DISTINCT FROM NEW.sales_order_id OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'commercial head identity or version conflict' USING ERRCODE='23514'; END IF;
 SELECT version INTO adopted_version FROM sales_order_commercial_versions WHERE sales_order_id=NEW.sales_order_id AND id=NEW.current_version_id;
 IF adopted_version IS DISTINCT FROM NEW.version THEN RAISE EXCEPTION 'commercial head must reference its exact adopted version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_order_commercial_head BEFORE INSERT OR UPDATE OR DELETE ON sales_order_commercial_heads FOR EACH ROW EXECUTE FUNCTION protect_order_commercial_head();
