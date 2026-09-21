CREATE SEQUENCE quote_center_quote_number_seq
  AS BIGINT
  MINVALUE 1
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

DO $$
DECLARE
  maximum_suffix NUMERIC;
BEGIN
  SELECT max(substring(quote_code FROM '^QT-[0-9]{4}-[0-9]{4}-([0-9]+)$')::numeric)
    INTO maximum_suffix
    FROM quote_center_quotes
   WHERE quote_code ~ '^QT-[0-9]{4}-[0-9]{4}-[0-9]+$';

  IF maximum_suffix IS NOT NULL AND maximum_suffix >= 9223372036854775807 THEN
    RAISE EXCEPTION 'quote number suffix has exhausted BIGINT sequence capacity';
  END IF;

  PERFORM setval(
    'quote_center_quote_number_seq',
    COALESCE(maximum_suffix + 1, 1)::bigint,
    false
  );
END;
$$;

ALTER TABLE quote_center_quotes
  ADD CONSTRAINT quote_center_quotes_quote_code_unique UNIQUE (quote_code);

CREATE OR REPLACE FUNCTION protect_quote_center_quote_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.quote_code IS DISTINCT FROM NEW.quote_code THEN
    RAISE EXCEPTION 'quote_center_quotes quote_code is immutable'
      USING ERRCODE = '23514',
            CONSTRAINT = 'quote_center_quote_code_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER quote_center_quotes_protect_quote_code
BEFORE UPDATE OF quote_code ON quote_center_quotes
FOR EACH ROW EXECUTE FUNCTION protect_quote_center_quote_code();
