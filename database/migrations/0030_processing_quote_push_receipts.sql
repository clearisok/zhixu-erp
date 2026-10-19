-- Synchronization command receipts only. Order identity remains processing_order_batches.
CREATE TABLE processing_quote_push_receipts (
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL, quote_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,request_id,quote_id)
);
CREATE TRIGGER processing_quote_push_immutable BEFORE UPDATE OR DELETE ON processing_quote_push_receipts FOR EACH ROW EXECUTE FUNCTION protect_order_commercial_version();
CREATE TRIGGER processing_quote_push_command_gate BEFORE INSERT ON processing_quote_push_receipts FOR EACH ROW EXECUTE FUNCTION protect_order_command_write();
