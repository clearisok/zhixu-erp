-- C4.3 schema only. No existing-order or Browser backfill.
CREATE TABLE sales_order_delivery_plan_sets (
  sales_order_id UUID PRIMARY KEY REFERENCES sales_orders(id) ON DELETE RESTRICT,
  ownership TEXT NOT NULL CHECK (ownership IN ('source_derived', 'user_managed')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sales_order_delivery_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES sales_order_delivery_plan_sets(sales_order_id) ON DELETE RESTRICT,
  is_derived_default BOOLEAN NOT NULL DEFAULT false,
  delivery_date DATE,
  quantity NUMERIC NOT NULL CHECK (quantity >= 0),
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (delivery_date IS NOT NULL OR is_derived_default)
);
CREATE UNIQUE INDEX sales_order_delivery_plan_default_uidx
  ON sales_order_delivery_plans(sales_order_id) WHERE is_derived_default;
CREATE INDEX sales_order_delivery_plan_owner_idx ON sales_order_delivery_plans(sales_order_id);

CREATE FUNCTION protect_delivery_plan_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DeliveryPlan collection cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW.sales_order_id IS DISTINCT FROM OLD.sales_order_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.ownership = 'user_managed' AND NEW.ownership <> 'user_managed')
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'DeliveryPlan collection identity, ownership or version violation' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER delivery_plan_set_protection BEFORE UPDATE OR DELETE ON sales_order_delivery_plan_sets
  FOR EACH ROW EXECUTE FUNCTION protect_delivery_plan_set();

CREATE FUNCTION protect_delivery_plan_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DeliveryPlan rows must be voided, never deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.sales_order_id IS DISTINCT FROM OLD.sales_order_id
     OR NEW.is_derived_default IS DISTINCT FROM OLD.is_derived_default
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.voided_at IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'DeliveryPlan identity or voided history violation' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER delivery_plan_row_protection BEFORE UPDATE OR DELETE ON sales_order_delivery_plans
  FOR EACH ROW EXECUTE FUNCTION protect_delivery_plan_row();

-- Same mirror transaction, including low-level repository writes: an update can
-- never infer untouched ownership for an old order lacking a collection.
CREATE FUNCTION follow_ainuoke_delivery_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_ownership TEXT;
BEGIN
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
CREATE TRIGGER ainuoke_delivery_source_follow AFTER INSERT OR UPDATE ON ainuoke_sales_order_contract_mirrors
  FOR EACH ROW EXECUTE FUNCTION follow_ainuoke_delivery_source();
