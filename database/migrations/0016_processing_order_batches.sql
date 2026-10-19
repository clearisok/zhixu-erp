-- Gate3 additive only. No historical classification, account grants or real-data backfill.
CREATE TABLE processing_order_batches (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 created_by BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 quote_id TEXT NOT NULL CHECK(btrim(quote_id)<>''),
 revision_id TEXT NOT NULL CHECK(btrim(revision_id)<>''),
 price_version_id TEXT NOT NULL CHECK(btrim(price_version_id)<>''),
 customer_name TEXT NOT NULL CHECK(length(btrim(customer_name)) BETWEEN 1 AND 300),
 business_style_no TEXT NOT NULL CHECK(length(btrim(business_style_no)) BETWEEN 1 AND 256),
 quantity NUMERIC NOT NULL CHECK(quantity>0 AND quantity<1000000000000 AND scale(quantity)<=6 AND quantity::text NOT IN ('NaN','Infinity','-Infinity')),
 order_date DATE NOT NULL CHECK(isfinite(order_date)),
 delivery_date DATE CHECK(isfinite(delivery_date)),
 customer_reference TEXT NOT NULL DEFAULT '' CHECK(length(customer_reference)<=256),
 delivery_requirements TEXT NOT NULL DEFAULT '' CHECK(length(delivery_requirements)<=4000),
 reference_order_id UUID REFERENCES sales_orders(id) ON DELETE RESTRICT,
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','confirmed','cancelled','consumed')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 current_confirmation_id UUID,
 CHECK(delivery_date IS NULL OR delivery_date>=order_date),
 CHECK(state NOT IN ('confirmed','consumed') OR current_confirmation_id IS NOT NULL)
);
-- A quote or a customer reference is deliberately NOT a unique order identity.
CREATE INDEX processing_order_batches_candidates ON processing_order_batches(state,created_at,id);
CREATE INDEX processing_order_batches_quote ON processing_order_batches(quote_id);
CREATE TABLE processing_order_batch_confirmations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id UUID NOT NULL REFERENCES processing_order_batches(id) ON DELETE RESTRICT,
 batch_version INTEGER NOT NULL CHECK(batch_version>0),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 source_fingerprint TEXT NOT NULL CHECK(source_fingerprint ~ '^[0-9a-f]{64}$'),
 draft_hash TEXT NOT NULL CHECK(draft_hash ~ '^[0-9a-f]{64}$'),
 source_snapshot JSONB NOT NULL CHECK(jsonb_typeof(source_snapshot)='object'),
 confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(batch_id,id), UNIQUE(batch_id,batch_version)
);
ALTER TABLE processing_order_batches ADD CONSTRAINT processing_batch_exact_confirmation
 FOREIGN KEY(id,current_confirmation_id) REFERENCES processing_order_batch_confirmations(batch_id,id) ON DELETE RESTRICT;
CREATE TABLE processing_order_batch_consumptions (
 batch_id UUID PRIMARY KEY REFERENCES processing_order_batches(id) ON DELETE RESTRICT,
 sales_order_id UUID NOT NULL UNIQUE REFERENCES sales_orders(id) ON DELETE RESTRICT,
 confirmation_id UUID NOT NULL,
 commercial_version_id UUID NOT NULL,
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(batch_id,confirmation_id) REFERENCES processing_order_batch_confirmations(batch_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(sales_order_id,commercial_version_id) REFERENCES sales_order_commercial_versions(sales_order_id,id) ON DELETE RESTRICT
);
CREATE TABLE processing_order_batch_requests (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('create','confirm','cancel','consume')),
 item_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 batch_id UUID NOT NULL REFERENCES processing_order_batches(id) ON DELETE RESTRICT,
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,request_id,operation,item_key)
);
CREATE FUNCTION protect_processing_batch_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'processing batch history is immutable' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER processing_batch_confirmation_immutable BEFORE UPDATE OR DELETE ON processing_order_batch_confirmations FOR EACH ROW EXECUTE FUNCTION protect_processing_batch_history();
CREATE TRIGGER processing_batch_consumption_immutable BEFORE UPDATE OR DELETE ON processing_order_batch_consumptions FOR EACH ROW EXECUTE FUNCTION protect_processing_batch_history();
CREATE TRIGGER processing_batch_request_immutable BEFORE UPDATE OR DELETE ON processing_order_batch_requests FOR EACH ROW EXECUTE FUNCTION protect_processing_batch_history();
CREATE FUNCTION protect_processing_batch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE confirmation_version INTEGER;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'processing batch cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.current_confirmation_id IS NOT NULL THEN RAISE EXCEPTION 'processing batch must start as draft' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.state IN ('cancelled','consumed') OR NEW.version<>OLD.version+1
 OR (to_jsonb(OLD)-ARRAY['state','version','current_confirmation_id']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['state','version','current_confirmation_id']) THEN
  RAISE EXCEPTION 'processing batch identity/content or terminal state is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.state NOT IN ('confirmed','cancelled','consumed') THEN RAISE EXCEPTION 'invalid batch transition' USING ERRCODE='23514'; END IF;
 IF NEW.state='confirmed' THEN
  SELECT batch_version INTO confirmation_version FROM processing_order_batch_confirmations WHERE batch_id=NEW.id AND id=NEW.current_confirmation_id;
  IF confirmation_version IS DISTINCT FROM NEW.version THEN RAISE EXCEPTION 'confirmation version mismatch' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.current_confirmation_id IS DISTINCT FROM OLD.current_confirmation_id THEN RAISE EXCEPTION 'confirmation cannot change during cancel/consume' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.state='consumed' AND (OLD.state<>'confirmed' OR NOT EXISTS(SELECT 1 FROM processing_order_batch_consumptions WHERE batch_id=NEW.id)) THEN RAISE EXCEPTION 'consumption evidence required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER processing_batch_protection BEFORE INSERT OR UPDATE OR DELETE ON processing_order_batches FOR EACH ROW EXECUTE FUNCTION protect_processing_batch();
CREATE FUNCTION validate_processing_batch_consumption() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch processing_order_batches%ROWTYPE;
BEGIN
 SELECT * INTO batch FROM processing_order_batches WHERE id=NEW.batch_id FOR UPDATE;
 IF batch.state IS DISTINCT FROM 'confirmed' OR batch.current_confirmation_id IS DISTINCT FROM NEW.confirmation_id THEN RAISE EXCEPTION 'confirmed unconsumed batch required' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sales_orders o JOIN sales_order_identity_profiles p ON p.sales_order_id=o.id JOIN sales_order_commercial_versions c ON c.sales_order_id=o.id WHERE o.id=NEW.sales_order_id AND p.business_type='processing' AND o.creation_source='quote' AND o.source_quote_id=batch.quote_id AND o.source_revision_id=batch.revision_id AND o.source_price_version_id=batch.price_version_id AND c.id=NEW.commercial_version_id AND c.quote_type='processing' AND c.quote_id=batch.quote_id AND c.revision_id=batch.revision_id AND c.price_version_id=batch.price_version_id AND c.source_fingerprint=(SELECT source_fingerprint FROM processing_order_batch_confirmations WHERE id=NEW.confirmation_id)) THEN RAISE EXCEPTION 'processing SO and commercial provenance required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER processing_batch_consumption_validation BEFORE INSERT ON processing_order_batch_consumptions FOR EACH ROW EXECUTE FUNCTION validate_processing_batch_consumption();
CREATE FUNCTION finish_processing_batch_consumption() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE processing_order_batches SET state='consumed',version=version+1 WHERE id=NEW.batch_id;
 RETURN NEW;
END; $$;
CREATE TRIGGER processing_batch_consumption_finish AFTER INSERT ON processing_order_batch_consumptions FOR EACH ROW EXECUTE FUNCTION finish_processing_batch_consumption();
