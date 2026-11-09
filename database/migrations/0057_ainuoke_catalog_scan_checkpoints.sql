-- New contracts may precede non-identity header fields. Unknown is not zero.
ALTER TABLE ainuoke_sales_order_contract_mirrors
  ALTER COLUMN quantity DROP NOT NULL;
ALTER TABLE ainuoke_sales_order_contract_mirrors
  DROP CONSTRAINT ainuoke_sales_order_contract_mirrors_inside_order_no_check;

-- Existing catalog requests remain the task/receipt identity. Checkpoints use
-- the shared immutable page-row chunks; incomplete scans never publish a head.
CREATE TABLE ainuoke_catalog_scan_state (
 source_key TEXT PRIMARY KEY REFERENCES ainuoke_source_profiles(source_key),
 last_request_id UUID,
 last_success_request_id UUID,
 last_success_at TIMESTAMPTZ,
 next_scan_at TIMESTAMPTZ,
 status TEXT NOT NULL CHECK(status IN ('running','complete','failed','unknown')),
 cursor JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(cursor)='object'),
 watermark JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(watermark)='object'),
 last_error_code TEXT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(source_key,last_request_id) REFERENCES ainuoke_catalog_requests(source_key,request_id),
 FOREIGN KEY(source_key,last_success_request_id) REFERENCES ainuoke_catalog_requests(source_key,request_id)
);
CREATE TABLE ainuoke_catalog_scan_pages (
 source_key TEXT NOT NULL,
 request_id UUID NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('before','after')),
 page INTEGER NOT NULL CHECK(page BETWEEN 1 AND 28),
 metadata JSONB NOT NULL CHECK(jsonb_typeof(metadata)='object'),
 rows_hash TEXT NOT NULL,
 captured_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(source_key,request_id,phase,page),
 FOREIGN KEY(source_key,request_id) REFERENCES ainuoke_catalog_requests(source_key,request_id),
 FOREIGN KEY(source_key,rows_hash) REFERENCES ainuoke_catalog_evidence_chunks(source_key,content_hash)
);
CREATE TRIGGER catalog_scan_page_immutable BEFORE UPDATE OR DELETE ON ainuoke_catalog_scan_pages
 FOR EACH ROW EXECUTE FUNCTION preserve_catalog_receipt();
