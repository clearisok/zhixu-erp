-- Unchanged manual/group publications still need durable capture evidence if COMMIT is unknown.
-- Keep attempt IDs in capture_ids; this separate existing-ledger field has one explicit namespace.
ALTER TABLE ainuoke_sync_audit_batches ADD COLUMN directory_evidence_ids UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX sync_audit_directory_evidence ON ainuoke_sync_audit_batches USING gin(directory_evidence_ids);
