-- Existing immutable employee operations retain actual SDK evidence; no new history/pin service.
ALTER TABLE operation_logs ADD COLUMN source_color_content_id UUID REFERENCES ainuoke_contract_contents(id);
ALTER TABLE operation_logs ADD COLUMN source_directory_capture_id UUID REFERENCES ainuoke_catalog_capture_evidence(id);
ALTER TABLE operation_logs ADD CONSTRAINT operation_source_evidence_pair CHECK((source_color_content_id IS NULL)=(source_directory_capture_id IS NULL));
CREATE INDEX operation_source_color_evidence ON operation_logs(source_color_content_id) WHERE source_color_content_id IS NOT NULL;
CREATE INDEX operation_source_directory_evidence ON operation_logs(source_directory_capture_id) WHERE source_directory_capture_id IS NOT NULL;
CREATE INDEX sync_audit_publication_references ON ainuoke_sync_audit_tables USING gin(publication_ids);
CREATE FUNCTION validate_operation_source_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source_color_content_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.entity_type<>'SalesOrder' OR NOT EXISTS(
  SELECT 1 FROM ainuoke_contract_contents c JOIN ainuoke_source_profiles p ON p.source_key=c.source_key AND p.account_fingerprint=c.account_fingerprint
  JOIN ainuoke_catalog_capture_evidence d ON d.id=NEW.source_directory_capture_id AND d.source_key=c.source_key AND d.account_fingerprint=c.account_fingerprint
  JOIN sales_order_source_links l ON l.source_system='ainuoke' AND l.source_entity_type='sales_contract' AND l.external_id=c.source_id AND l.sales_contract_no=c.sales_contract_no
  JOIN sales_order_effective_identities m ON m.original_order_id=l.sales_order_id
  WHERE c.id=NEW.source_color_content_id AND c.kind='colors' AND (l.sales_order_id::text=NEW.entity_id OR m.effective_order_id::text=NEW.entity_id)) THEN
  RAISE EXCEPTION 'operation source evidence scope mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER operation_source_evidence_scope BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION validate_operation_source_evidence();
