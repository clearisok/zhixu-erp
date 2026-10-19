-- Operations own command identity and receipts only; commercial versions remain the sole price facts.
CREATE TABLE order_sale_adjustment_operations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 rule JSONB NOT NULL CHECK(jsonb_typeof(rule)='object'),command_plan JSONB NOT NULL CHECK(jsonb_typeof(command_plan)='array'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(actor_id,request_id)
);
CREATE TABLE order_sale_adjustment_receipts (
 operation_id UUID NOT NULL REFERENCES order_sale_adjustment_operations(id) ON DELETE RESTRICT,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 attempt INTEGER NOT NULL CHECK(attempt>0),status TEXT NOT NULL CHECK(status IN ('updated','unchanged','failed')),
 before_version_id UUID,after_version_id UUID,code TEXT,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(operation_id,sales_order_id,attempt),
 FOREIGN KEY(sales_order_id,before_version_id) REFERENCES sales_order_commercial_versions(sales_order_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(sales_order_id,after_version_id) REFERENCES sales_order_commercial_versions(sales_order_id,id) ON DELETE RESTRICT,
 CHECK((status='failed' AND after_version_id IS NULL AND code IS NOT NULL) OR (status IN ('updated','unchanged') AND before_version_id IS NOT NULL AND after_version_id IS NOT NULL AND code IS NULL))
);
CREATE TRIGGER sale_adjustment_operation_immutable BEFORE UPDATE OR DELETE ON order_sale_adjustment_operations FOR EACH ROW EXECUTE FUNCTION protect_order_commercial_version();
CREATE TRIGGER sale_adjustment_receipt_immutable BEFORE UPDATE OR DELETE ON order_sale_adjustment_receipts FOR EACH ROW EXECUTE FUNCTION protect_order_commercial_version();
CREATE TRIGGER sale_adjustment_operation_command_gate BEFORE INSERT ON order_sale_adjustment_operations FOR EACH ROW EXECUTE FUNCTION protect_order_command_write();
