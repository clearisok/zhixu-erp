-- Append-only rejected field states and targeted read evidence. No business or
-- historical receipt is rewritten. Access remains server/DB operator only;
-- never expose source prices through an unauthenticated diagnostic endpoint.
CREATE TABLE ainuoke_catalog_diagnostics (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id UUID NOT NULL REFERENCES ainuoke_sync_audit_batches(id),
 source_key TEXT NOT NULL,
 report_id TEXT NOT NULL CHECK(report_id='6086103'),
 kind TEXT NOT NULL CHECK(kind IN ('difference','recapture_page','decision')),
 page INTEGER CHECK(page BETWEEN 1 AND 28),
 row_id TEXT, sales_contract_no TEXT, field TEXT,
 retry_count INTEGER NOT NULL CHECK(retry_count BETWEEN 0 AND 2),
 final_decision TEXT NOT NULL,
 evidence JSONB NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(octet_length(evidence::text)<=4194304)
);
CREATE INDEX catalog_diagnostic_batch ON ainuoke_catalog_diagnostics(batch_id,recorded_at,id);
CREATE INDEX catalog_diagnostic_contract ON ainuoke_catalog_diagnostics(source_key,sales_contract_no,recorded_at DESC);
CREATE UNIQUE INDEX catalog_diagnostic_target_page ON ainuoke_catalog_diagnostics(batch_id,page) WHERE kind='recapture_page';
CREATE TRIGGER catalog_diagnostic_no_update BEFORE UPDATE OR DELETE ON ainuoke_catalog_diagnostics
 FOR EACH ROW EXECUTE FUNCTION guard_ainuoke_audit_delete();
