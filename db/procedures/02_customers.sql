-- Ledgerly — Customer SPs
-- Commercial: rich profile + name autocomplete
-- Regular: light profile + visit/purchase insights

CREATE OR REPLACE FUNCTION sp_upsert_customer(
  p_owner_id        UUID,
  p_name            TEXT,
  p_phone           TEXT DEFAULT NULL,
  p_gstin           TEXT DEFAULT NULL,
  p_email           TEXT DEFAULT NULL,
  p_address_line1   TEXT DEFAULT NULL,
  p_city            TEXT DEFAULT NULL,
  p_state           TEXT DEFAULT NULL,
  p_pincode         TEXT DEFAULT NULL,
  p_customer_kind   customer_kind DEFAULT 'other',
  p_tags            TEXT[] DEFAULT '{}',
  p_notes           TEXT DEFAULT NULL,
  p_customer_id     UUID DEFAULT NULL
)
RETURNS customers
LANGUAGE plpgsql
AS $$
DECLARE
  v_row customers;
  v_gstin TEXT := NULLIF(upper(trim(COALESCE(p_gstin, ''))), '');
  v_phone TEXT := NULLIF(trim(COALESCE(p_phone, '')), '');
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'customer name is required';
  END IF;

  -- Ignore incomplete / placeholder GSTINs so invoice create never fails the CHECK
  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    v_gstin := NULL;
  END IF;

  IF p_customer_id IS NOT NULL THEN
    UPDATE customers SET
      name = trim(p_name),
      phone = v_phone,
      gstin = v_gstin,
      email = NULLIF(lower(trim(COALESCE(p_email, ''))), ''),
      address_line1 = p_address_line1,
      city = p_city,
      state = p_state,
      pincode = p_pincode,
      customer_kind = COALESCE(p_customer_kind, customer_kind),
      tags = COALESCE(p_tags, tags),
      notes = p_notes
    WHERE id = p_customer_id AND owner_id = p_owner_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer not found';
    END IF;
    RETURN v_row;
  END IF;

  -- Match existing by GSTIN then phone (commercial autofill path)
  IF v_gstin IS NOT NULL THEN
    SELECT * INTO v_row FROM customers
    WHERE owner_id = p_owner_id AND gstin = v_gstin;
  END IF;

  IF v_row.id IS NULL AND v_phone IS NOT NULL THEN
    SELECT * INTO v_row FROM customers
    WHERE owner_id = p_owner_id AND phone = v_phone;
  END IF;

  IF v_row.id IS NOT NULL THEN
    UPDATE customers SET
      name = trim(p_name),
      phone = COALESCE(v_phone, phone),
      gstin = COALESCE(v_gstin, gstin),
      email = COALESCE(NULLIF(lower(trim(COALESCE(p_email, ''))), ''), email),
      address_line1 = COALESCE(p_address_line1, address_line1),
      city = COALESCE(p_city, city),
      state = COALESCE(p_state, state),
      pincode = COALESCE(p_pincode, pincode),
      customer_kind = COALESCE(p_customer_kind, customer_kind),
      tags = CASE WHEN p_tags IS NULL OR array_length(p_tags, 1) IS NULL THEN tags ELSE p_tags END,
      notes = COALESCE(p_notes, notes)
    WHERE id = v_row.id
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  INSERT INTO customers (
    owner_id, name, phone, gstin, email, address_line1, city, state, pincode,
    customer_kind, tags, notes
  )
  VALUES (
    p_owner_id, trim(p_name), v_phone, v_gstin,
    NULLIF(lower(trim(COALESCE(p_email, ''))), ''),
    p_address_line1, p_city, p_state, p_pincode,
    COALESCE(p_customer_kind, 'other'), COALESCE(p_tags, '{}'), p_notes
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Autocomplete for Commercial (name / GSTIN / phone)
CREATE OR REPLACE FUNCTION sp_search_customers_autocomplete(
  p_owner_id UUID,
  p_query    TEXT,
  p_limit    INT DEFAULT 10
)
RETURNS SETOF customers
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM customers
  WHERE owner_id = p_owner_id
    AND is_active = TRUE
    AND (
      lower(name) LIKE lower('%' || trim(p_query) || '%')
      OR COALESCE(gstin, '') ILIKE '%' || upper(trim(p_query)) || '%'
      OR COALESCE(phone, '') LIKE '%' || trim(p_query) || '%'
    )
  ORDER BY
    CASE WHEN lower(name) LIKE lower(trim(p_query) || '%') THEN 0 ELSE 1 END,
    last_purchase_at DESC NULLS LAST,
    name
  LIMIT GREATEST(COALESCE(p_limit, 10), 1);
$$;

CREATE OR REPLACE FUNCTION sp_list_customers(
  p_owner_id UUID,
  p_search   TEXT DEFAULT NULL,
  p_tag      TEXT DEFAULT NULL,
  p_limit    INT DEFAULT 100,
  p_offset   INT DEFAULT 0
)
RETURNS SETOF customers
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM customers
  WHERE owner_id = p_owner_id
    AND is_active = TRUE
    AND (
      p_search IS NULL OR trim(p_search) = ''
      OR lower(name) LIKE lower('%' || trim(p_search) || '%')
      OR COALESCE(phone, '') LIKE '%' || trim(p_search) || '%'
      OR COALESCE(gstin, '') ILIKE '%' || trim(p_search) || '%'
    )
    AND (p_tag IS NULL OR p_tag = ANY(tags))
  ORDER BY last_purchase_at DESC NULLS LAST, name
  LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- Regular-client insights
CREATE OR REPLACE FUNCTION sp_customer_insights(
  p_owner_id UUID,
  p_period   period_filter DEFAULT 'monthly',
  p_from     DATE DEFAULT NULL,
  p_to       DATE DEFAULT NULL
)
RETURNS TABLE (
  total_customers     BIGINT,
  regulars            BIGINT,   -- visit_count >= 3 OR invoice_count >= 3
  quiet_over_14_days  BIGINT,
  new_in_period       BIGINT,
  top_by_purchases    JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
BEGIN
  SELECT pb.start_date, pb.end_date INTO v_start, v_end
  FROM fn_period_bounds(p_period, p_from, p_to) pb;

  RETURN QUERY
  WITH base AS (
    SELECT * FROM customers WHERE owner_id = p_owner_id AND is_active
  ),
  top AS (
    SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT id, name, phone, visit_count, invoice_count, total_purchases, last_purchase_at
      FROM base
      ORDER BY total_purchases DESC
      LIMIT 5
    ) t
  )
  SELECT
    (SELECT count(*) FROM base),
    (SELECT count(*) FROM base WHERE visit_count >= 3 OR invoice_count >= 3),
    (SELECT count(*) FROM base
      WHERE last_purchase_at IS NULL
         OR last_purchase_at < NOW() - INTERVAL '14 days'),
    (SELECT count(*) FROM base
      WHERE created_at::DATE BETWEEN v_start AND v_end),
    COALESCE((SELECT * FROM top), '[]'::jsonb);
END;
$$;

-- Bump stats after invoice create/pay
CREATE OR REPLACE FUNCTION sp_touch_customer_from_invoice(
  p_customer_id UUID,
  p_amount      NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE customers SET
    visit_count = visit_count + 1,
    invoice_count = invoice_count + 1,
    total_purchases = total_purchases + COALESCE(p_amount, 0),
    last_purchase_at = NOW()
  WHERE id = p_customer_id;
END;
$$;
