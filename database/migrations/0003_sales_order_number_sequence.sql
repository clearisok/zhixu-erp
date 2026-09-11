CREATE SEQUENCE sales_order_number_seq
  AS BIGINT
  MINVALUE 1
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

SELECT setval(
  'sales_order_number_seq',
  GREATEST(
    COALESCE((
      SELECT max(substring(order_no FROM '^SO-([0-9]+)$')::bigint)
      FROM sales_orders
      WHERE order_no ~ '^SO-[0-9]{1,18}$'
    ), 0) + 1,
    1
  ),
  false
);

CREATE OR REPLACE FUNCTION assign_sales_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_no IS NOT NULL THEN
    RAISE EXCEPTION 'sales_orders order_no is server-generated'
      USING ERRCODE = '23514';
  END IF;
  NEW.order_no := 'SO-' || lpad(nextval('sales_order_number_seq')::text, 8, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_orders_assign_order_number
BEFORE INSERT ON sales_orders
FOR EACH ROW EXECUTE FUNCTION assign_sales_order_number();

CREATE OR REPLACE FUNCTION protect_sales_order_identity_and_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.order_no IS DISTINCT FROM NEW.order_no
     OR OLD.creation_source IS DISTINCT FROM NEW.creation_source
     OR OLD.source_order_id IS DISTINCT FROM NEW.source_order_id
     OR OLD.source_quote_id IS DISTINCT FROM NEW.source_quote_id
     OR OLD.source_revision_id IS DISTINCT FROM NEW.source_revision_id
     OR OLD.source_price_version_id IS DISTINCT FROM NEW.source_price_version_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'sales_orders identity, order number, and creation provenance are immutable'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'sales_orders version must increment by exactly one' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
