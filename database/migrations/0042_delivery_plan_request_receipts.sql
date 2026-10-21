-- Technical command receipts only. No plan backfill or ownership/lifecycle change.
CREATE TABLE sales_order_delivery_plan_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_mode TEXT NOT NULL CHECK(request_mode IN ('explicit','legacy')),
 request_id UUID,
 request_key TEXT NOT NULL,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 command_hash TEXT NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 command JSONB NOT NULL CHECK(jsonb_typeof(command)='object' AND octet_length(command::text)<=65536),
 outcome TEXT NOT NULL CHECK(outcome IN ('applied','rejected')),
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=16777216),
 audit_log_id TEXT REFERENCES operation_logs(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(actor_id,request_key),
 CHECK((request_mode='explicit' AND request_id IS NOT NULL AND request_key='uuid:'||request_id::text)
    OR (request_mode='legacy' AND request_id IS NULL AND request_key='legacy:'||command_hash)),
 CHECK((command->>'salesOrderId'=sales_order_id::text) IS TRUE),
 CHECK(((outcome='applied' AND result->>'status'='applied' AND audit_log_id IS NOT NULL)
    OR (outcome='rejected' AND result->>'status'='rejected' AND audit_log_id IS NULL)) IS TRUE)
);
CREATE INDEX sales_order_delivery_plan_request_order_idx ON sales_order_delivery_plan_requests(sales_order_id);
CREATE FUNCTION protect_delivery_plan_request_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'delivery plan request receipt is immutable' USING ERRCODE='23514';
END; $$;
CREATE TRIGGER delivery_plan_request_receipt_guard BEFORE UPDATE OR DELETE
 ON sales_order_delivery_plan_requests FOR EACH ROW EXECUTE FUNCTION protect_delivery_plan_request_receipt();
