-- Ledgerly — triggers & helpers
-- Run after 003_tables.sql

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_owners_updated ON owners;
CREATE TRIGGER trg_owners_updated
  BEFORE UPDATE ON owners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated ON customers;
CREATE TRIGGER trg_customers_updated
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_bill_templates_updated ON bill_templates;
CREATE TRIGGER trg_bill_templates_updated
  BEFORE UPDATE ON bill_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated ON invoices;
CREATE TRIGGER trg_invoices_updated
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_catalog_items_updated ON catalog_items;
CREATE TRIGGER trg_catalog_items_updated
  BEFORE UPDATE ON catalog_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Period helper: returns [start_date, end_date] for default filters
CREATE OR REPLACE FUNCTION fn_period_bounds(
  p_period period_filter DEFAULT 'monthly',
  p_from   DATE DEFAULT NULL,
  p_to     DATE DEFAULT NULL
)
RETURNS TABLE (start_date DATE, end_date DATE)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
BEGIN
  IF p_period = 'custom' THEN
    IF p_from IS NULL OR p_to IS NULL THEN
      RAISE EXCEPTION 'custom period requires p_from and p_to';
    END IF;
    RETURN QUERY SELECT p_from, p_to;
    RETURN;
  END IF;

  IF p_period = 'weekly' THEN
    RETURN QUERY SELECT (v_today - ((EXTRACT(ISODOW FROM v_today)::INT - 1)))::DATE,
                        v_today;
  ELSIF p_period = 'monthly' THEN
    RETURN QUERY SELECT date_trunc('month', v_today)::DATE, v_today;
  ELSIF p_period = 'quarterly' THEN
    RETURN QUERY SELECT date_trunc('quarter', v_today)::DATE, v_today;
  ELSIF p_period = 'yearly' THEN
    RETURN QUERY SELECT date_trunc('year', v_today)::DATE, v_today;
  ELSE
    RETURN QUERY SELECT date_trunc('month', v_today)::DATE, v_today;
  END IF;
END;
$$;

-- Next invoice number per owner: INV-1001, INV-1002, ...
CREATE OR REPLACE FUNCTION fn_next_invoice_number(p_owner_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_max INT;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN number ~ '^INV-[0-9]+$'
         THEN substring(number FROM 5)::INT
         ELSE NULL END
  ), 1000) INTO v_max
  FROM invoices
  WHERE owner_id = p_owner_id;

  RETURN 'INV-' || (v_max + 1)::TEXT;
END;
$$;
