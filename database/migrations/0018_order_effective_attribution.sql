-- Gate4 additive attribution ledger. No backfill, SO identity rewrite or data movement.
CREATE TABLE sales_order_attribution_changes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 case_id UUID NOT NULL REFERENCES sales_order_normalization_cases(id) ON DELETE RESTRICT,
 case_version INTEGER NOT NULL CHECK(case_version>0),
 change_type TEXT NOT NULL CHECK(change_type IN ('normalize','correct')),
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 evidence_hash TEXT NOT NULL CHECK(evidence_hash ~ '^[0-9a-f]{64}$'),
 evidence_basis JSONB NOT NULL CHECK(jsonb_typeof(evidence_basis)='object'),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(actor_id,request_id)
);
CREATE TABLE sales_order_attribution_members (
 change_id UUID NOT NULL REFERENCES sales_order_attribution_changes(id) ON DELETE RESTRICT,
 sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 effective_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
 previous_change_id UUID REFERENCES sales_order_attribution_changes(id) ON DELETE RESTRICT,
 previous_version INTEGER NOT NULL CHECK(previous_version>=0),
 PRIMARY KEY(change_id,sales_order_id),
 CHECK((previous_version=0 AND previous_change_id IS NULL) OR (previous_version>0 AND previous_change_id IS NOT NULL))
);
CREATE TABLE sales_order_attribution_heads (
 sales_order_id UUID PRIMARY KEY REFERENCES sales_orders(id) ON DELETE RESTRICT,
 current_change_id UUID NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(current_change_id,sales_order_id) REFERENCES sales_order_attribution_members(change_id,sales_order_id) ON DELETE RESTRICT
);
CREATE VIEW sales_order_effective_identities AS
 SELECT o.id AS original_order_id,COALESCE(m.effective_order_id,o.id) AS effective_order_id,
 h.current_change_id AS attribution_change_id,COALESCE(h.version,0) AS attribution_version
 FROM sales_orders o LEFT JOIN sales_order_attribution_heads h ON h.sales_order_id=o.id
 LEFT JOIN sales_order_attribution_members m ON m.change_id=h.current_change_id AND m.sales_order_id=o.id;
CREATE TRIGGER attribution_change_immutable BEFORE UPDATE OR DELETE ON sales_order_attribution_changes FOR EACH ROW EXECUTE FUNCTION protect_order_normalization_history();
CREATE TRIGGER attribution_member_immutable BEFORE UPDATE OR DELETE ON sales_order_attribution_members FOR EACH ROW EXECUTE FUNCTION protect_order_normalization_history();
CREATE FUNCTION protect_order_attribution_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE member sales_order_attribution_members%ROWTYPE; old_root UUID;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0));
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'attribution head cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO member FROM sales_order_attribution_members WHERE change_id=NEW.current_change_id AND sales_order_id=NEW.sales_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'attribution member required' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 OR member.previous_version<>0 THEN RAISE EXCEPTION 'first attribution version required' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.sales_order_id IS DISTINCT FROM OLD.sales_order_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
  OR NEW.version<>OLD.version+1 OR member.previous_version<>OLD.version OR member.previous_change_id IS DISTINCT FROM OLD.current_change_id THEN
   RAISE EXCEPTION 'attribution identity or version conflict' USING ERRCODE='23514';
  END IF;
  SELECT effective_order_id INTO old_root FROM sales_order_attribution_members WHERE change_id=OLD.current_change_id AND sales_order_id=OLD.sales_order_id;
  IF EXISTS(SELECT 1 FROM sales_order_attribution_members previous JOIN sales_order_attribution_heads h ON h.sales_order_id=previous.sales_order_id AND h.current_change_id=previous.change_id
   WHERE previous.change_id=OLD.current_change_id AND previous.effective_order_id=old_root AND NOT EXISTS(SELECT 1 FROM sales_order_attribution_members next WHERE next.change_id=NEW.current_change_id AND next.sales_order_id=previous.sales_order_id)) THEN
   RAISE EXCEPTION 'entire prior active group must be reviewed' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW.updated_at=now();RETURN NEW;
END; $$;
CREATE TRIGGER attribution_head_protection BEFORE INSERT OR UPDATE OR DELETE ON sales_order_attribution_heads FOR EACH ROW EXECUTE FUNCTION protect_order_attribution_head();
CREATE FUNCTION validate_order_attribution_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_change_id UUID; member_count INTEGER; first_id UUID; second_id UUID; expected_case_version INTEGER; latest_case_version INTEGER; latest_case_type TEXT;
BEGIN
 IF TG_TABLE_NAME='sales_order_attribution_changes' THEN v_change_id=NEW.id; ELSE v_change_id=NEW.current_change_id; END IF;
 SELECT c.first_order_id,c.second_order_id,a.case_version INTO first_id,second_id,expected_case_version FROM sales_order_attribution_changes a JOIN sales_order_normalization_cases c ON c.id=a.case_id WHERE a.id=v_change_id;
 SELECT version,event_type INTO latest_case_version,latest_case_type FROM sales_order_normalization_case_events WHERE case_id=(SELECT case_id FROM sales_order_attribution_changes WHERE id=v_change_id) ORDER BY version DESC LIMIT 1;
 IF latest_case_version IS DISTINCT FROM expected_case_version OR latest_case_type='withdrawn' THEN RAISE EXCEPTION 'current active case review required' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO member_count FROM sales_order_attribution_members m WHERE m.change_id=v_change_id;
 IF member_count<2 OR member_count>100 THEN RAISE EXCEPTION 'complete bounded group required' USING ERRCODE='23514'; END IF;
 IF (SELECT change_type FROM sales_order_attribution_changes WHERE id=v_change_id)='normalize' AND (SELECT count(DISTINCT effective_order_id) FROM sales_order_attribution_members WHERE change_id=v_change_id)<>1 THEN RAISE EXCEPTION 'normalization must choose one effective root' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sales_order_attribution_members m LEFT JOIN sales_order_attribution_members previous ON previous.change_id=m.previous_change_id AND previous.sales_order_id=m.sales_order_id WHERE m.change_id=v_change_id AND m.effective_order_id IS DISTINCT FROM COALESCE(previous.effective_order_id,m.sales_order_id)) THEN RAISE EXCEPTION 'attribution must change effective membership' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sales_order_attribution_members m WHERE m.change_id=v_change_id AND m.sales_order_id=first_id)
 OR NOT EXISTS(SELECT 1 FROM sales_order_attribution_members m WHERE m.change_id=v_change_id AND m.sales_order_id=second_id) THEN RAISE EXCEPTION 'case pair must belong to attribution review' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM sales_order_attribution_members m LEFT JOIN sales_order_attribution_heads h ON h.sales_order_id=m.sales_order_id WHERE m.change_id=v_change_id AND h.current_change_id IS DISTINCT FROM v_change_id) THEN RAISE EXCEPTION 'every reviewed member must advance atomically' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM sales_order_effective_identities v JOIN sales_order_effective_identities root ON root.original_order_id=v.effective_order_id WHERE root.effective_order_id<>root.original_order_id OR (v.attribution_change_id IS NOT NULL AND root.attribution_change_id IS DISTINCT FROM v.attribution_change_id)) THEN
  RAISE EXCEPTION 'effective identities require direct self-rooted complete groups' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT v.effective_order_id FROM sales_order_effective_identities v JOIN sales_order_source_links l ON l.sales_order_id=v.original_order_id AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract' JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=l.sales_order_id AND m.source_id=l.external_id AND m.sales_contract_no=l.sales_contract_no GROUP BY v.effective_order_id HAVING count(DISTINCT l.external_id)>1) THEN RAISE EXCEPTION 'distinct trusted contracts cannot share one effective SO' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER attribution_change_complete AFTER INSERT ON sales_order_attribution_changes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_order_attribution_change();
CREATE CONSTRAINT TRIGGER attribution_heads_complete AFTER INSERT OR UPDATE ON sales_order_attribution_heads DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_order_attribution_change();

-- Nullable historical metadata only: never infer or backfill a prior attribution.
ALTER TABLE ainuoke_source_runs ADD COLUMN order_scope_hash TEXT CHECK(order_scope_hash IS NULL OR order_scope_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE ainuoke_material_source_snapshots ADD COLUMN attribution_change_id UUID REFERENCES sales_order_attribution_changes(id) ON DELETE RESTRICT;

-- Forward replacement only: never copy/merge historical plans into a new root.
CREATE OR REPLACE FUNCTION follow_ainuoke_delivery_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_ownership TEXT;
BEGIN
  -- Source observations stay on their immutable owner. Do not rewrite old alias plans.
  IF EXISTS(SELECT 1 FROM sales_order_effective_identities WHERE original_order_id=NEW.sales_order_id AND effective_order_id<>original_order_id) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO sales_order_delivery_plan_sets(sales_order_id, ownership)
      VALUES (NEW.sales_order_id, 'source_derived');
    IF NEW.contract_delivery_date IS NOT NULL THEN
      INSERT INTO sales_order_delivery_plans(sales_order_id, is_derived_default, delivery_date, quantity)
        VALUES (NEW.sales_order_id, true, NEW.contract_delivery_date, NEW.quantity);
    END IF;
  ELSIF NEW.contract_delivery_date IS DISTINCT FROM OLD.contract_delivery_date
     OR NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    SELECT ownership INTO current_ownership FROM sales_order_delivery_plan_sets
      WHERE sales_order_id = NEW.sales_order_id FOR UPDATE;
    IF FOUND THEN
      IF current_ownership = 'source_derived' THEN
        UPDATE sales_order_delivery_plans SET delivery_date = NEW.contract_delivery_date
          WHERE sales_order_id = NEW.sales_order_id AND is_derived_default
            AND delivery_date IS DISTINCT FROM NEW.contract_delivery_date;
      END IF;
      UPDATE sales_order_delivery_plan_sets SET version = version + 1 WHERE sales_order_id = NEW.sales_order_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
