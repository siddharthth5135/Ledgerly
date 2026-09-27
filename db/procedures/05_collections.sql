-- Ledgerly — Collections / Reminders SPs
-- Remind only when money_received = false. Channel default = whatsapp.

CREATE OR REPLACE FUNCTION sp_collections_summary(
  p_owner_id UUID,
  p_period   period_filter DEFAULT 'monthly',
  p_from     DATE DEFAULT NULL,
  p_to       DATE DEFAULT NULL
)
RETURNS TABLE (
  business_total      NUMERIC,  -- all invoices in period
  money_received      NUMERIC,
  money_not_received  NUMERIC,
  outstanding_count   BIGINT,
  overdue_amount      NUMERIC,
  overdue_count       BIGINT,
  pending_reminders   BIGINT
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
  SELECT
    COALESCE(SUM(i.total_amount), 0),
    COALESCE(SUM(CASE WHEN i.money_received THEN i.amount_received ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT i.money_received THEN i.total_amount - i.amount_received ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE NOT i.money_received AND i.status <> 'cancelled'),
    COALESCE(SUM(CASE WHEN NOT i.money_received AND i.due_date < CURRENT_DATE AND i.status <> 'cancelled'
                      THEN i.total_amount - i.amount_received ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE NOT i.money_received AND i.due_date < CURRENT_DATE AND i.status <> 'cancelled'),
    (SELECT COUNT(*) FROM reminders r
      WHERE r.owner_id = p_owner_id AND r.status = 'pending')
  FROM invoices i
  WHERE i.owner_id = p_owner_id
    AND i.issue_date BETWEEN v_start AND v_end
    AND i.status <> 'cancelled';
END;
$$;

CREATE OR REPLACE FUNCTION sp_list_collection_invoices(
  p_owner_id UUID,
  p_period   period_filter DEFAULT 'monthly',
  p_from     DATE DEFAULT NULL,
  p_to       DATE DEFAULT NULL,
  p_only_unpaid BOOLEAN DEFAULT TRUE
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
    AND i.status <> 'cancelled'
    AND (NOT p_only_unpaid OR i.money_received = FALSE)
  ORDER BY
    CASE WHEN i.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
    i.due_date ASC;
END;
$$;

-- Build default polite WhatsApp reminder body
CREATE OR REPLACE FUNCTION fn_default_reminder_message(p_invoice_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_inv invoices;
  v_owner owners;
  v_due_amt NUMERIC;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;
  SELECT * INTO v_owner FROM owners WHERE id = v_inv.owner_id;

  v_due_amt := GREATEST(v_inv.total_amount - v_inv.amount_received, 0);

  RETURN format(
    E'Hello %s,\n\n'
    'Greetings from *%s*.\n\n'
    'This is a polite reminder regarding invoice *%s* dated %s '
    '(due %s).\n\n'
    'Outstanding amount: *₹%s*\n'
    'Total invoice value: ₹%s\n\n'
    'Kindly arrange payment at your earliest convenience. '
    'If you have already paid, please share the payment reference so we can update our records.\n\n'
    '%s'
    'Thank you for your business.\n'
    'Warm regards,\n%s',
    v_inv.customer_name,
    v_owner.business_name,
    v_inv.number,
    to_char(v_inv.issue_date, 'DD Mon YYYY'),
    to_char(v_inv.due_date, 'DD Mon YYYY'),
    to_char(v_due_amt, 'FM999999990.00'),
    to_char(v_inv.total_amount, 'FM999999990.00'),
    CASE WHEN v_inv.razorpay_link IS NOT NULL AND v_inv.razorpay_link <> ''
         THEN format(E'Payment link: %s\n\n', v_inv.razorpay_link)
         ELSE '' END,
    v_owner.business_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION sp_create_reminder(
  p_owner_id   UUID,
  p_invoice_id UUID,
  p_created_by UUID,
  p_message    TEXT DEFAULT NULL,
  p_channel    reminder_channel DEFAULT 'whatsapp'
)
RETURNS reminders
LANGUAGE plpgsql
AS $$
DECLARE
  v_inv invoices;
  v_rem reminders;
  v_msg TEXT;
BEGIN
  SELECT * INTO v_inv
  FROM invoices
  WHERE id = p_invoice_id AND owner_id = p_owner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  IF v_inv.money_received THEN
    RAISE EXCEPTION 'cannot remind: money already received';
  END IF;

  IF v_inv.status = 'cancelled' THEN
    RAISE EXCEPTION 'cannot remind cancelled invoice';
  END IF;

  v_msg := COALESCE(NULLIF(trim(p_message), ''), fn_default_reminder_message(p_invoice_id));

  INSERT INTO reminders (owner_id, invoice_id, created_by, channel, message, status)
  VALUES (p_owner_id, p_invoice_id, p_created_by, COALESCE(p_channel, 'whatsapp'), v_msg, 'pending')
  RETURNING * INTO v_rem;

  UPDATE invoices SET reminders_sent = reminders_sent + 1 WHERE id = p_invoice_id;

  RETURN v_rem;
END;
$$;

CREATE OR REPLACE FUNCTION sp_mark_reminder_sent(
  p_owner_id    UUID,
  p_reminder_id UUID,
  p_success     BOOLEAN DEFAULT TRUE,
  p_error       TEXT DEFAULT NULL
)
RETURNS reminders
LANGUAGE plpgsql
AS $$
DECLARE
  v_rem reminders;
BEGIN
  UPDATE reminders SET
    status = CASE WHEN p_success THEN 'sent'::reminder_status ELSE 'failed'::reminder_status END,
    sent_at = CASE WHEN p_success THEN NOW() ELSE sent_at END,
    error_message = p_error
  WHERE id = p_reminder_id AND owner_id = p_owner_id
  RETURNING * INTO v_rem;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reminder not found';
  END IF;

  RETURN v_rem;
END;
$$;
