-- Successful offline promotion only. No source activation, seed or backfill.
CREATE TABLE ainuoke_order_source_refresh_receipts (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key) ON DELETE RESTRICT,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 source_owner_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 preview_hash TEXT NOT NULL CHECK(preview_hash ~ '^[a-f0-9]{64}$'),
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=65536),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,request_id)
);
CREATE FUNCTION protect_order_source_refresh_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'order source refresh receipt is immutable' USING ERRCODE='23514';
END; $$;
CREATE TRIGGER order_source_refresh_receipt_guard BEFORE UPDATE OR DELETE
 ON ainuoke_order_source_refresh_receipts FOR EACH ROW EXECUTE FUNCTION protect_order_source_refresh_receipt();
