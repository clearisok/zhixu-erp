-- Additive, independently opt-in garment observations. No seed, live collection,
-- historical import, shipment event ledger, completion or closing mutation.
CREATE TABLE ainuoke_garment_shipment_targets (
 source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key) ON DELETE RESTRICT,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 account_fingerprint TEXT NOT NULL CHECK(account_fingerprint ~ '^[a-f0-9]{64}$'),
 enabled BOOLEAN NOT NULL DEFAULT false,
 verification_sha256 TEXT CHECK(verification_sha256 ~ '^[a-f0-9]{64}$'),
 freshness_ms INTEGER NOT NULL CHECK(freshness_ms BETWEEN 1000 AND 86400000),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 PRIMARY KEY(source_key,sales_order_id), CHECK(NOT enabled OR verification_sha256 IS NOT NULL)
);
CREATE TABLE ainuoke_garment_shipment_snapshots (
 id UUID PRIMARY KEY,
 source_key TEXT NOT NULL,
 sales_order_id UUID NOT NULL,
 generation INTEGER NOT NULL CHECK(generation>0),
 account_fingerprint TEXT NOT NULL CHECK(account_fingerprint ~ '^[a-f0-9]{64}$'),
 target_version INTEGER NOT NULL CHECK(target_version>0),
 freshness_ms INTEGER NOT NULL CHECK(freshness_ms BETWEEN 1000 AND 86400000),
 source_owner_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 source_link_id UUID NOT NULL REFERENCES sales_order_source_links(id) ON DELETE RESTRICT,
 attribution_change_id UUID REFERENCES sales_order_attribution_changes(id) ON DELETE RESTRICT,
 attribution_version INTEGER NOT NULL CHECK(attribution_version>=0),
 order_version INTEGER NOT NULL CHECK(order_version>0),
 sales_contract_no TEXT NOT NULL CHECK(length(btrim(sales_contract_no)) BETWEEN 1 AND 80),
 snapshot_id TEXT NOT NULL CHECK(snapshot_id ~ '^[a-f0-9]{64}$'),
 row_count INTEGER NOT NULL CHECK(row_count BETWEEN 0 AND 2000),
 observed_from TIMESTAMPTZ NOT NULL,
 observed_through TIMESTAMPTZ NOT NULL,
 input JSONB NOT NULL CHECK(jsonb_typeof(input)='object' AND octet_length(input::text)<=16777216),
 publication_context JSONB NOT NULL CHECK(jsonb_typeof(publication_context)='object' AND octet_length(publication_context::text)<=8192),
 scope JSONB NOT NULL CHECK(jsonb_typeof(scope)='object'),
 color_basis JSONB NOT NULL CHECK(jsonb_typeof(color_basis)='array' AND octet_length(color_basis::text)<=524288),
 color_basis_hash TEXT NOT NULL CHECK(color_basis_hash ~ '^[a-f0-9]{64}$'),
 payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=16777216),
 content_hash TEXT NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(source_key,sales_order_id) REFERENCES ainuoke_garment_shipment_targets(source_key,sales_order_id) ON DELETE RESTRICT,
 UNIQUE(sales_order_id,id), UNIQUE(source_key,sales_order_id,id), UNIQUE(source_key,sales_order_id,generation), UNIQUE(source_key,sales_order_id,snapshot_id),
 CHECK(observed_through>=observed_from),
 CHECK(COALESCE(input->>'schemaVersion'='ainuoke-garment-shipment-input.v1' AND input ?& ARRAY['firstPass','secondPass']
   AND scope->>'sourceFingerprint'=account_fingerprint AND scope->>'salesContractNo'=sales_contract_no,false)),
 CHECK(COALESCE(publication_context->>'sourceKey'=source_key AND publication_context->>'salesOrderId'=sales_order_id::text
   AND publication_context->>'sourceFingerprint'=account_fingerprint AND publication_context->>'salesContractNo'=sales_contract_no
   AND (publication_context->>'generation')::integer=generation-1 AND (publication_context->>'orderVersion')::integer=order_version
   AND publication_context->>'colorBasisHash'=color_basis_hash,false)),
 CHECK(COALESCE(payload->>'schemaVersion'='ainuoke-garment-shipment-snapshot.v1' AND payload->>'reportId'='6086979'
   AND payload->>'snapshotId'=snapshot_id AND payload->>'sourceFingerprint'=account_fingerprint AND payload->>'salesContractNo'=sales_contract_no
   AND (payload->>'observedFrom')::timestamptz=observed_from AND (payload->>'observedThrough')::timestamptz=observed_through
   AND jsonb_typeof(payload->'rows')='array' AND jsonb_array_length(payload->'rows')=row_count
   AND (payload->'completeness'->>'queryRows')::integer=row_count,false))
);
CREATE TABLE ainuoke_garment_shipment_color_matches (
 snapshot_id UUID NOT NULL,
 sales_order_id UUID NOT NULL,
 source_record_id TEXT NOT NULL CHECK(length(btrim(source_record_id)) BETWEEN 1 AND 128),
 match_state TEXT NOT NULL CHECK(match_state IN ('matched','missing_source_color','unmatched','ambiguous')),
 order_color_id UUID,
 PRIMARY KEY(snapshot_id,source_record_id),
 FOREIGN KEY(sales_order_id,snapshot_id) REFERENCES ainuoke_garment_shipment_snapshots(sales_order_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(sales_order_id,order_color_id) REFERENCES sales_order_color_identities(sales_order_id,id) ON DELETE RESTRICT,
 CHECK((match_state='matched')=(order_color_id IS NOT NULL))
);
CREATE TABLE ainuoke_garment_shipment_heads (
 source_key TEXT NOT NULL,
 sales_order_id UUID NOT NULL,
 snapshot_id UUID NOT NULL,
 generation INTEGER NOT NULL CHECK(generation>0),
 PRIMARY KEY(source_key,sales_order_id),
 FOREIGN KEY(source_key,sales_order_id,snapshot_id) REFERENCES ainuoke_garment_shipment_snapshots(source_key,sales_order_id,id) ON DELETE RESTRICT
);
CREATE TRIGGER garment_shipment_snapshot_immutable BEFORE UPDATE OR DELETE ON ainuoke_garment_shipment_snapshots
 FOR EACH ROW EXECUTE FUNCTION protect_ainuoke_source_evidence();
CREATE TRIGGER garment_shipment_color_immutable BEFORE UPDATE OR DELETE ON ainuoke_garment_shipment_color_matches
 FOR EACH ROW EXECUTE FUNCTION protect_ainuoke_source_evidence();
CREATE FUNCTION protect_garment_shipment_target() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'garment target history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.version<>1 OR TG_OP='UPDATE' AND
  (NEW.source_key<>OLD.source_key OR NEW.sales_order_id<>OLD.sales_order_id OR NEW.account_fingerprint<>OLD.account_fingerprint OR NEW.version<>OLD.version+1)
 THEN RAISE EXCEPTION 'garment target identity or version conflict' USING ERRCODE='23514'; END IF;
 IF NEW.enabled THEN PERFORM require_effective_order_write_owner(NEW.sales_order_id); END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER garment_shipment_target_guard BEFORE INSERT OR UPDATE OR DELETE ON ainuoke_garment_shipment_targets
 FOR EACH ROW EXECUTE FUNCTION protect_garment_shipment_target();

CREATE FUNCTION validate_garment_shipment_scope(s ainuoke_garment_shipment_snapshots) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM require_effective_order_write_owner(s.sales_order_id);
 IF NOT EXISTS(SELECT 1 FROM ainuoke_garment_shipment_targets t JOIN ainuoke_source_profiles p ON p.source_key=t.source_key
   WHERE t.source_key=s.source_key AND t.sales_order_id=s.sales_order_id AND t.enabled AND p.enabled
    AND t.account_fingerprint=s.account_fingerprint AND p.account_fingerprint=s.account_fingerprint
    AND t.version=s.target_version AND t.freshness_ms=s.freshness_ms AND t.verification_sha256 IS NOT NULL FOR SHARE OF t,p)
 THEN RAISE EXCEPTION 'enabled exact garment target required' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sales_order_source_links l
   JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=l.sales_order_id AND m.source_id=l.external_id AND m.sales_contract_no=l.sales_contract_no
   JOIN sales_order_effective_identities e ON e.original_order_id=l.sales_order_id JOIN sales_orders o ON o.id=s.sales_order_id
   WHERE l.id=s.source_link_id AND l.sales_order_id=s.source_owner_order_id AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract'
    AND l.sales_contract_no=s.sales_contract_no AND e.effective_order_id=s.sales_order_id
    AND e.attribution_change_id IS NOT DISTINCT FROM s.attribution_change_id AND e.attribution_version=s.attribution_version
    AND o.version=s.order_version AND (o.creation_source='ainuoke' OR e.attribution_change_id IS NOT NULL))
 THEN RAISE EXCEPTION 'current trusted garment contract binding required' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM processing_order_batch_consumptions WHERE sales_order_id=s.sales_order_id)
  OR EXISTS(SELECT 1 FROM sales_order_identity_profiles WHERE sales_order_id=s.sales_order_id AND business_type='processing')
 THEN RAISE EXCEPTION 'processing order has no Ainuoke garment source' USING ERRCODE='23514'; END IF;
END; $$;
CREATE FUNCTION protect_garment_shipment_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM validate_garment_shipment_scope(NEW); RETURN NEW; END; $$;
CREATE TRIGGER garment_shipment_snapshot_scope BEFORE INSERT ON ainuoke_garment_shipment_snapshots
 FOR EACH ROW EXECUTE FUNCTION protect_garment_shipment_snapshot();
CREATE FUNCTION protect_garment_shipment_color_match() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected JSONB;
BEGIN
 SELECT r->'colorMatch' INTO expected FROM ainuoke_garment_shipment_snapshots s CROSS JOIN LATERAL jsonb_array_elements(s.payload->'rows') r
 WHERE s.id=NEW.snapshot_id AND s.sales_order_id=NEW.sales_order_id AND r->>'sourceRecordId'=NEW.source_record_id;
 IF NOT FOUND OR expected->>'state' IS DISTINCT FROM NEW.match_state OR expected->>'orderColorId' IS DISTINCT FROM NEW.order_color_id::text
 THEN RAISE EXCEPTION 'exact frozen garment color match required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER garment_shipment_color_guard BEFORE INSERT ON ainuoke_garment_shipment_color_matches
 FOR EACH ROW EXECUTE FUNCTION protect_garment_shipment_color_match();
CREATE FUNCTION protect_garment_shipment_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next ainuoke_garment_shipment_snapshots; previous ainuoke_garment_shipment_snapshots; matches INTEGER;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'garment head cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.generation<>1 OR TG_OP='UPDATE' AND
  (NEW.source_key<>OLD.source_key OR NEW.sales_order_id<>OLD.sales_order_id OR NEW.generation<>OLD.generation+1 OR NEW.snapshot_id=OLD.snapshot_id)
 THEN RAISE EXCEPTION 'garment head identity or generation conflict' USING ERRCODE='23514'; END IF;
 SELECT * INTO next FROM ainuoke_garment_shipment_snapshots WHERE id=NEW.snapshot_id AND source_key=NEW.source_key AND sales_order_id=NEW.sales_order_id;
 IF NOT FOUND OR next.generation<>NEW.generation THEN RAISE EXCEPTION 'exact garment snapshot required' USING ERRCODE='23514'; END IF;
 PERFORM validate_garment_shipment_scope(next);
 SELECT count(*) INTO matches FROM ainuoke_garment_shipment_color_matches WHERE snapshot_id=next.id AND sales_order_id=next.sales_order_id;
 IF matches<>jsonb_array_length(next.payload->'rows') THEN RAISE EXCEPTION 'all frozen garment color matches required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  SELECT * INTO previous FROM ainuoke_garment_shipment_snapshots WHERE id=OLD.snapshot_id;
  IF next.observed_from<previous.observed_from OR next.observed_through<previous.observed_through
   THEN RAISE EXCEPTION 'garment observations cannot regress' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER garment_shipment_head_guard BEFORE INSERT OR UPDATE OR DELETE ON ainuoke_garment_shipment_heads
 FOR EACH ROW EXECUTE FUNCTION protect_garment_shipment_head();
