-- New explicit source-context drafts only. No historical backfill or adoption.
CREATE TABLE quote_creation_order_contexts (
  quote_id TEXT PRIMARY KEY REFERENCES quote_center_quotes(id) ON DELETE RESTRICT,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
  actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot)='object' AND (snapshot->>'schemaVersion') IS NOT DISTINCT FROM '1'
    AND (snapshot->>'salesOrderId') IS NOT DISTINCT FROM sales_order_id::text
    AND (snapshot->>'quoteType') IS NOT DISTINCT FROM 'distribution'),
  snapshot_hash TEXT NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(actor_id,client_request_id),
  FOREIGN KEY(actor_id,client_request_id) REFERENCES quote_creation_receipts(actor_id,client_request_id) ON DELETE RESTRICT
);
CREATE INDEX quote_creation_order_contexts_order_idx ON quote_creation_order_contexts(sales_order_id,created_at);
CREATE FUNCTION protect_quote_creation_order_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'quote creation order context is immutable'; END; $$;
CREATE TRIGGER protect_quote_creation_order_context BEFORE UPDATE OR DELETE ON quote_creation_order_contexts
  FOR EACH ROW EXECUTE FUNCTION protect_quote_creation_order_context();
