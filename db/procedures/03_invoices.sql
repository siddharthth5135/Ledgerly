-- Ledgerly — Invoice SPs

CREATE OR REPLACE FUNCTION sp_create_invoice(
  p_owner_id         UUID,
  p_created_by       UUID,
  p_customer_id      UUID DEFAULT NULL,
  p_template_id      UUID DEFAULT NULL,
  p_customer_name    TEXT DEFAULT NULL,
  p_customer_gstin   TEXT DEFAULT NULL,
  p_customer_phone   TEXT DEFAULT NULL,
  p_customer_email   TEXT DEFAULT NULL,
  p_issue_date       DATE DEFAULT CURRENT_DATE,
  p_due_date         DATE DEFAULT NULL,
  p_status           invoice_status DEFAULT 'sent',
  p_money_received   BOOLEAN DEFAULT FALSE,
  p_amount_received  NUMERIC DEFAULT 0,
  p_source           invoice_source DEFAULT 'quick_bill',
  p_notes            TEXT DEFAULT NULL,
  p_field_values     JSONB DEFAULT '{}'::jsonb,
  p_razorpay_link    TEXT DEFAULT NULL,
  p_lines            JSONB DEFAULT '[]'::jsonb
  -- p_lines: [{"description","hsn","qty","rate","gst_percent"}]
)
RETURNS invoices
LANGUAGE plpgsql
AS $$
DECLARE
  v_inv        invoices;
  v_line       JSONB;
  v_i          INT := 0;
  v_taxable    NUMERIC(14,2) := 0;
  v_line_amt   NUMERIC(14,2);
  v_gst_pct    NUMERIC(5,2);
  v_cgst       NUMERIC(14,2) := 0;
  v_sgst       NUMERIC(14,2) := 0;
  v_igst       NUMERIC(14,2) := 0;
  v_total      NUMERIC(14,2) := 0;
  v_seller_st  TEXT;
  v_buyer_st   TEXT;
  v_name       TEXT;
  v_gstin      TEXT;
  v_phone      TEXT;
  v_email      TEXT;
  v_cust       customers;
  v_due        DATE;
BEGIN
  -- Permission-ish: user must belong to owner
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_created_by AND owner_id = p_owner_id AND is_active
  ) THEN
    RAISE EXCEPTION 'invalid creator for owner';
  END IF;

  SELECT * INTO v_cust FROM customers
  WHERE id = p_customer_id AND owner_id = p_owner_id;

  v_name  := COALESCE(NULLIF(trim(p_customer_name), ''), v_cust.name);
  v_gstin := COALESCE(NULLIF(upper(trim(COALESCE(p_customer_gstin, ''))), ''), v_cust.gstin);
  v_phone := COALESCE(NULLIF(trim(COALESCE(p_customer_phone, '')), ''), v_cust.phone);
  v_email := COALESCE(NULLIF(lower(trim(COALESCE(p_customer_email, ''))), ''), v_cust.email::TEXT);

  IF v_name IS NULL OR length(v_name) = 0 THEN
    RAISE EXCEPTION 'customer_name is required';
  END IF;

  v_due := COALESCE(p_due_date, (COALESCE(p_issue_date, CURRENT_DATE) + 10));

  -- Sum lines
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'at least one line item is required';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_amt := ROUND(
      (COALESCE((v_line->>'qty')::NUMERIC, 1) * COALESCE((v_line->>'rate')::NUMERIC, 0))::NUMERIC,
      2
    );
    v_taxable := v_taxable + v_line_amt;
  END LOOP;

  SELECT state INTO v_seller_st FROM owners WHERE id = p_owner_id;
  v_buyer_st := COALESCE(v_cust.state, NULL);

  -- Intra-state → CGST+SGST; else IGST (simplified India GST split @ 18 default avg from lines)
  -- We accumulate GST from each line percent
  v_cgst := 0; v_sgst := 0; v_igst := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_amt := ROUND(
      (COALESCE((v_line->>'qty')::NUMERIC, 1) * COALESCE((v_line->>'rate')::NUMERIC, 0))::NUMERIC,
      2
    );
    v_gst_pct := COALESCE((v_line->>'gst_percent')::NUMERIC, 18);
    IF v_seller_st IS NOT NULL AND v_buyer_st IS NOT NULL AND upper(v_seller_st) = upper(v_buyer_st) THEN
      v_cgst := v_cgst + ROUND(v_line_amt * v_gst_pct / 200.0, 2);
      v_sgst := v_sgst + ROUND(v_line_amt * v_gst_pct / 200.0, 2);
    ELSE
      v_igst := v_igst + ROUND(v_line_amt * v_gst_pct / 100.0, 2);
    END IF;
  END LOOP;

  v_total := v_taxable + v_cgst + v_sgst + v_igst;

  INSERT INTO invoices (
    owner_id, created_by, customer_id, template_id, number,
    customer_name, customer_gstin, customer_phone, customer_email,
    issue_date, due_date, status, money_received, amount_received,
    taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount,
    source, notes, field_values, razorpay_link
  )
  VALUES (
    p_owner_id, p_created_by, p_customer_id, p_template_id,
    fn_next_invoice_number(p_owner_id),
    v_name, v_gstin, v_phone, v_email,
    COALESCE(p_issue_date, CURRENT_DATE), v_due,
    COALESCE(p_status, 'sent'),
    COALESCE(p_money_received, FALSE),
    CASE WHEN COALESCE(p_money_received, FALSE) THEN COALESCE(NULLIF(p_amount_received, 0), v_total)
         ELSE COALESCE(p_amount_received, 0) END,
    v_taxable, v_cgst, v_sgst, v_igst, v_total,
    COALESCE(p_source, 'quick_bill'), p_notes,
    COALESCE(p_field_values, '{}'::jsonb), p_razorpay_link
  )
  RETURNING * INTO v_inv;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_i := v_i + 1;
    v_line_amt := ROUND(
      (COALESCE((v_line->>'qty')::NUMERIC, 1) * COALESCE((v_line->>'rate')::NUMERIC, 0))::NUMERIC,
      2
    );
    INSERT INTO invoice_lines (invoice_id, line_no, description, hsn, qty, rate, gst_percent, line_amount)
    VALUES (
      v_inv.id, v_i,
      COALESCE(v_line->>'description', 'Item'),
      NULLIF(v_line->>'hsn', ''),
      COALESCE((v_line->>'qty')::NUMERIC, 1),
      COALESCE((v_line->>'rate')::NUMERIC, 0),
      COALESCE((v_line->>'gst_percent')::NUMERIC, 18),
      v_line_amt
    );
  END LOOP;

  PERFORM sp_touch_customer_from_invoice(p_customer_id, v_total);

  IF COALESCE(p_money_received, FALSE) THEN
    UPDATE invoices SET status = 'paid' WHERE id = v_inv.id RETURNING * INTO v_inv;
  END IF;

  INSERT INTO audit_logs (owner_id, user_id, action, entity_type, entity_id, meta)
  VALUES (p_owner_id, p_created_by, 'invoice.create', 'invoices', v_inv.id,
          jsonb_build_object('number', v_inv.number, 'total', v_inv.total_amount));

  RETURN v_inv;
END;
$$;

CREATE OR REPLACE FUNCTION sp_set_money_received(
  p_owner_id        UUID,
  p_invoice_id      UUID,
  p_user_id         UUID,
  p_money_received  BOOLEAN,
  p_amount_received NUMERIC DEFAULT NULL
)
RETURNS invoices
LANGUAGE plpgsql
AS $$
DECLARE
  v_inv invoices;
BEGIN
  UPDATE invoices SET
    money_received = p_money_received,
    amount_received = CASE
      WHEN p_money_received THEN COALESCE(p_amount_received, total_amount)
      ELSE COALESCE(p_amount_received, 0)
    END,
    status = CASE
      WHEN p_money_received THEN 'paid'::invoice_status
      WHEN due_date < CURRENT_DATE AND status <> 'cancelled' THEN 'overdue'::invoice_status
      WHEN status = 'paid' THEN 'sent'::invoice_status
      ELSE status
    END
  WHERE id = p_invoice_id AND owner_id = p_owner_id
  RETURNING * INTO v_inv;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  INSERT INTO audit_logs (owner_id, user_id, action, entity_type, entity_id, meta)
  VALUES (p_owner_id, p_user_id, 'invoice.money_received', 'invoices', v_inv.id,
          jsonb_build_object('money_received', p_money_received));

  RETURN v_inv;
END;
$$;

-- Unified invoice list with filters (default period = monthly)
CREATE OR REPLACE FUNCTION sp_list_invoices(
  p_owner_id         UUID,
  p_period           period_filter DEFAULT 'monthly',
  p_from             DATE DEFAULT NULL,
  p_to               DATE DEFAULT NULL,
  p_search           TEXT DEFAULT NULL,
  p_status           invoice_status DEFAULT NULL,
  p_money_received   BOOLEAN DEFAULT NULL,
  p_amount_min       NUMERIC DEFAULT NULL,
  p_amount_max       NUMERIC DEFAULT NULL,
  p_source           invoice_source DEFAULT NULL,
  p_limit            INT DEFAULT 50,
  p_offset           INT DEFAULT 0
)
RETURNS SETOF invoices
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
  SELECT i.*
  FROM invoices i
  WHERE i.owner_id = p_owner_id
    AND i.issue_date BETWEEN v_start AND v_end
    AND (
      p_search IS NULL OR trim(p_search) = ''
      OR lower(i.customer_name) LIKE lower('%' || trim(p_search) || '%')
      OR i.number ILIKE '%' || trim(p_search) || '%'
      OR COALESCE(i.customer_phone, '') LIKE '%' || trim(p_search) || '%'
      OR COALESCE(i.customer_gstin, '') ILIKE '%' || trim(p_search) || '%'
    )
    AND (p_status IS NULL OR i.status = p_status)
    AND (p_money_received IS NULL OR i.money_received = p_money_received)
    AND (p_amount_min IS NULL OR i.total_amount >= p_amount_min)
    AND (p_amount_max IS NULL OR i.total_amount <= p_amount_max)
    AND (p_source IS NULL OR i.source = p_source)
  ORDER BY i.issue_date DESC, i.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION sp_get_invoice_with_lines(
  p_owner_id   UUID,
  p_invoice_id UUID
)
RETURNS TABLE (
  invoice JSONB,
  lines   JSONB
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    to_jsonb(i.*) AS invoice,
    COALESCE((
      SELECT jsonb_agg(to_jsonb(l.*) ORDER BY l.line_no)
      FROM invoice_lines l WHERE l.invoice_id = i.id
    ), '[]'::jsonb) AS lines
  FROM invoices i
  WHERE i.id = p_invoice_id AND i.owner_id = p_owner_id;
$$;
