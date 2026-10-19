-- Independent, opt-in per-order financial observations. No data/account backfill.
CREATE TABLE ainuoke_payment_source_targets (
 source_key TEXT NOT NULL REFERENCES ainuoke_source_profiles(source_key) ON DELETE RESTRICT,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 account_fingerprint TEXT NOT NULL CHECK(account_fingerprint ~ '^[a-f0-9]{64}$'),
 enabled BOOLEAN NOT NULL DEFAULT false,
 verification_sha256 TEXT CHECK(verification_sha256 ~ '^[a-f0-9]{64}$'),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 PRIMARY KEY(source_key,sales_order_id),
 CHECK(NOT enabled OR verification_sha256 IS NOT NULL)
);
CREATE TABLE ainuoke_payment_snapshots (
 id UUID PRIMARY KEY,
 source_key TEXT NOT NULL,
 sales_order_id UUID NOT NULL,
 account_fingerprint TEXT NOT NULL CHECK(account_fingerprint ~ '^[a-f0-9]{64}$'),
 target_version INTEGER NOT NULL CHECK(target_version>0),
 source_owner_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 source_link_id UUID NOT NULL REFERENCES sales_order_source_links(id) ON DELETE RESTRICT,
 attribution_change_id UUID REFERENCES sales_order_attribution_changes(id) ON DELETE RESTRICT,
 attribution_version INTEGER NOT NULL CHECK(attribution_version>=0),
 sales_contract_no TEXT NOT NULL CHECK(length(btrim(sales_contract_no)) BETWEEN 1 AND 80),
 snapshot_id TEXT NOT NULL CHECK(snapshot_id ~ '^[a-f0-9]{64}$'),
 observed_from TIMESTAMPTZ NOT NULL,
 observed_through TIMESTAMPTZ NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 input JSONB NOT NULL CHECK(jsonb_typeof(input)='object' AND octet_length(input::text)<=16777216),
 scope JSONB NOT NULL CHECK(jsonb_typeof(scope)='object'),
 payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
 content_hash TEXT NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(source_key,sales_order_id) REFERENCES ainuoke_payment_source_targets(source_key,sales_order_id) ON DELETE RESTRICT,
 UNIQUE(source_key,sales_order_id,id),
 CHECK(observed_through>=observed_from AND expires_at=observed_from+interval '10 minutes'),
 CHECK(COALESCE(input->>'schemaVersion'='ainuoke-payment-contract-snapshot-input.v1'
   AND input ?& ARRAY['firstPass','secondPass'] AND scope ?& ARRAY['sourceFingerprint','salesContractNo','witness'],false)),
 CHECK(COALESCE(payload ?& ARRAY['schemaVersion','snapshotId','salesContractNo','sourceFingerprint','observedFrom','observedThrough','expiresAt']
   AND payload->>'schemaVersion'='ainuoke-payment-contract-snapshot.v1' AND payload->>'snapshotId'=snapshot_id
   AND payload->>'salesContractNo'=sales_contract_no AND payload->>'sourceFingerprint'=account_fingerprint
   AND (payload->>'observedFrom')::timestamptz=observed_from AND (payload->>'observedThrough')::timestamptz=observed_through
   AND (payload->>'expiresAt')::timestamptz=expires_at,false))
);
CREATE TABLE ainuoke_payment_heads (
 source_key TEXT NOT NULL,
 sales_order_id UUID NOT NULL,
 snapshot_id UUID NOT NULL,
 generation INTEGER NOT NULL CHECK(generation>0),
 PRIMARY KEY(source_key,sales_order_id),
 FOREIGN KEY(source_key,sales_order_id,snapshot_id) REFERENCES ainuoke_payment_snapshots(source_key,sales_order_id,id) ON DELETE RESTRICT
);
CREATE TRIGGER payment_snapshot_immutable BEFORE UPDATE OR DELETE ON ainuoke_payment_snapshots
 FOR EACH ROW EXECUTE FUNCTION protect_ainuoke_source_evidence();

CREATE FUNCTION protect_payment_target() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment target history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.source_key<>OLD.source_key OR NEW.sales_order_id<>OLD.sales_order_id
   OR NEW.account_fingerprint<>OLD.account_fingerprint OR NEW.version<>OLD.version+1) THEN
   RAISE EXCEPTION 'payment target identity or version conflict' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' AND NEW.version<>1 THEN RAISE EXCEPTION 'first target version required' USING ERRCODE='23514'; END IF;
 IF NEW.enabled THEN PERFORM require_effective_order_write_owner(NEW.sales_order_id); END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER payment_target_guard BEFORE INSERT OR UPDATE OR DELETE ON ainuoke_payment_source_targets
 FOR EACH ROW EXECUTE FUNCTION protect_payment_target();

CREATE FUNCTION validate_payment_snapshot_scope_row(s ainuoke_payment_snapshots) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_enabled BOOLEAN; v_fingerprint TEXT; v_version INTEGER; v_profile_enabled BOOLEAN;
BEGIN
 PERFORM require_effective_order_write_owner(s.sales_order_id);
 SELECT t.enabled,t.account_fingerprint,t.version,p.enabled INTO v_enabled,v_fingerprint,v_version,v_profile_enabled
 FROM ainuoke_payment_source_targets t JOIN ainuoke_source_profiles p ON p.source_key=t.source_key
 WHERE t.source_key=s.source_key AND t.sales_order_id=s.sales_order_id
   AND p.account_fingerprint=s.account_fingerprint FOR SHARE OF t,p;
 IF NOT FOUND OR NOT v_enabled OR NOT v_profile_enabled OR v_fingerprint<>s.account_fingerprint OR v_version<>s.target_version THEN
   RAISE EXCEPTION 'enabled exact payment target required' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM sales_order_source_links l
   JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=l.sales_order_id AND m.source_id=l.external_id AND m.sales_contract_no=l.sales_contract_no
   JOIN sales_order_effective_identities e ON e.original_order_id=l.sales_order_id
   WHERE l.id=s.source_link_id AND l.sales_order_id=s.source_owner_order_id
    AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract' AND l.sales_contract_no=s.sales_contract_no
    AND e.effective_order_id=s.sales_order_id AND e.attribution_change_id IS NOT DISTINCT FROM s.attribution_change_id
    AND e.attribution_version=s.attribution_version) THEN
   RAISE EXCEPTION 'current trusted payment contract binding required' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM processing_order_batch_consumptions WHERE sales_order_id=s.sales_order_id)
 OR EXISTS(SELECT 1 FROM sales_order_identity_profiles WHERE sales_order_id=s.sales_order_id AND business_type='processing') THEN
   RAISE EXCEPTION 'processing order has no Ainuoke payment source' USING ERRCODE='23514';
 END IF;
END; $$;
CREATE FUNCTION validate_payment_snapshot_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM validate_payment_snapshot_scope_row(NEW); RETURN NEW; END; $$;
CREATE TRIGGER payment_snapshot_scope BEFORE INSERT ON ainuoke_payment_snapshots
 FOR EACH ROW EXECUTE FUNCTION validate_payment_snapshot_scope();

CREATE FUNCTION protect_payment_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_new ainuoke_payment_snapshots%ROWTYPE; v_old ainuoke_payment_snapshots%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment head cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.generation<>1 THEN RAISE EXCEPTION 'first payment generation required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.source_key<>OLD.source_key OR NEW.sales_order_id<>OLD.sales_order_id
   OR NEW.generation<>OLD.generation+1 OR NEW.snapshot_id=OLD.snapshot_id) THEN
   RAISE EXCEPTION 'payment head identity or generation conflict' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_new FROM ainuoke_payment_snapshots WHERE id=NEW.snapshot_id AND source_key=NEW.source_key AND sales_order_id=NEW.sales_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'exact payment snapshot required' USING ERRCODE='23514'; END IF;
 PERFORM validate_payment_snapshot_scope_row(v_new);
 IF TG_OP='UPDATE' THEN
   SELECT * INTO v_old FROM ainuoke_payment_snapshots WHERE id=OLD.snapshot_id;
   IF v_new.observed_from<v_old.observed_from OR v_new.observed_through<v_old.observed_through THEN
     RAISE EXCEPTION 'payment observations cannot regress' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER payment_head_guard BEFORE INSERT OR UPDATE OR DELETE ON ainuoke_payment_heads
 FOR EACH ROW EXECUTE FUNCTION protect_payment_head();
