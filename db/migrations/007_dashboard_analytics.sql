-- Ledgerly — richer dashboard: GST liability, ageing, prior-period compare
DROP FUNCTION IF EXISTS sp_dashboard_overview(UUID, period_filter, DATE, DATE);

CREATE OR REPLACE FUNCTION sp_dashboard_overview(
  p_owner_id UUID,
  p_period   period_filter DEFAULT 'monthly',
  p_from     DATE DEFAULT NULL,
  p_to       DATE DEFAULT NULL
)
RETURNS TABLE (
  period_start          DATE,
  period_end            DATE,
  invoice_count         BIGINT,
  business_total        NUMERIC,
  received_amount       NUMERIC,
  outstanding_amount    NUMERIC,
  paid_count            BIGINT,
  overdue_count         BIGINT,
  draft_count           BIGINT,
  avg_invoice_value     NUMERIC,
  customer_count        BIGINT,
  new_customers         BIGINT,
  reminders_sent        BIGINT,
  top_customers         JSONB,
  daily_trend           JSONB,
  status_breakdown      JSONB,
  collection_pct        NUMERIC,
  gst_taxable           NUMERIC,
  gst_cgst              NUMERIC,
  gst_sgst              NUMERIC,
  gst_igst              NUMERIC,
  gst_total             NUMERIC,
  ageing                JSONB,
  prior_business_total  NUMERIC,
  prior_received        NUMERIC,
  prior_invoice_count   BIGINT,
  quiet_regulars        JSONB,
  late_payers           JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
  v_len   INT;
  v_pstart DATE;
  v_pend   DATE;
BEGIN
  SELECT pb.start_date, pb.end_date INTO v_start, v_end
  FROM fn_period_bounds(p_period, p_from, p_to) pb;

  v_len := (v_end - v_start) + 1;
  v_pend := v_start - 1;
  v_pstart := v_pend - (v_len - 1);

  RETURN QUERY
  WITH inv AS (
    SELECT i.* FROM invoices i
    WHERE i.owner_id = p_owner_id
      AND i.issue_date BETWEEN v_start AND v_end
      AND i.status <> 'cancelled'
  ),
  prior AS (
    SELECT i.* FROM invoices i
    WHERE i.owner_id = p_owner_id
      AND i.issue_date BETWEEN v_pstart AND v_pend
      AND i.status <> 'cancelled'
  ),
  unpaid AS (
    SELECT i.*,
           (i.total_amount - COALESCE(i.amount_received, 0)) AS bal,
           CASE
             WHEN i.due_date IS NULL OR i.due_date >= CURRENT_DATE THEN 'current'
             WHEN CURRENT_DATE - i.due_date <= 30 THEN '1-30'
             WHEN CURRENT_DATE - i.due_date <= 60 THEN '31-60'
             WHEN CURRENT_DATE - i.due_date <= 90 THEN '61-90'
             ELSE '90+'
           END AS bucket
    FROM invoices i
    WHERE i.owner_id = p_owner_id
      AND NOT i.money_received
      AND i.status <> 'cancelled'
      AND (i.total_amount - COALESCE(i.amount_received, 0)) > 0
  ),
  top_cust AS (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) AS j
    FROM (
      SELECT customer_name, COUNT(*) AS bills, SUM(total_amount) AS amount
      FROM inv
      GROUP BY customer_name
      ORDER BY amount DESC
      LIMIT 5
    ) t
  ),
  trend AS (
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb) AS j
    FROM (
      SELECT issue_date AS day,
             COUNT(*) AS bills,
             SUM(total_amount) AS amount,
             SUM(CASE WHEN inv.money_received THEN amount_received ELSE 0 END) AS received
      FROM inv
      GROUP BY issue_date
    ) t
  ),
  statuses AS (
    SELECT COALESCE(jsonb_object_agg(s.status, s.cnt), '{}'::jsonb) AS j
    FROM (
      SELECT status::TEXT AS status, COUNT(*) AS cnt FROM inv GROUP BY status
    ) s
  ),
  age AS (
    SELECT COALESCE(jsonb_agg(row_to_json(a) ORDER BY
      CASE a.bucket
        WHEN 'current' THEN 0 WHEN '1-30' THEN 1 WHEN '31-60' THEN 2
        WHEN '61-90' THEN 3 ELSE 4 END), '[]'::jsonb) AS j
    FROM (
      SELECT bucket, COUNT(*)::INT AS bills, ROUND(SUM(bal), 2) AS amount
      FROM unpaid
      GROUP BY bucket
    ) a
  ),
  quiet AS (
    SELECT COALESCE(jsonb_agg(row_to_json(q)), '[]'::jsonb) AS j
    FROM (
      SELECT c.name AS customer_name, c.phone,
             MAX(i.issue_date) AS last_bill,
             COUNT(i.id)::INT AS lifetime_bills,
             ROUND(SUM(i.total_amount), 2) AS lifetime_amount
      FROM customers c
      JOIN invoices i ON i.customer_id = c.id AND i.status <> 'cancelled'
      WHERE c.owner_id = p_owner_id AND c.is_active
      GROUP BY c.id, c.name, c.phone
      HAVING COUNT(i.id) >= 2
         AND MAX(i.issue_date) < CURRENT_DATE - 14
      ORDER BY lifetime_amount DESC
      LIMIT 5
    ) q
  ),
  late AS (
    SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb) AS j
    FROM (
      SELECT customer_name, COUNT(*)::INT AS overdue_bills,
             ROUND(SUM(bal), 2) AS overdue_amount,
             MAX(CURRENT_DATE - due_date)::INT AS max_days_late
      FROM unpaid
      WHERE bucket <> 'current'
      GROUP BY customer_name
      ORDER BY overdue_amount DESC
      LIMIT 5
    ) l
  )
  SELECT
    v_start,
    v_end,
    (SELECT COUNT(*) FROM inv),
    COALESCE((SELECT SUM(total_amount) FROM inv), 0),
    COALESCE((SELECT SUM(CASE WHEN inv.money_received THEN amount_received ELSE 0 END) FROM inv), 0),
    COALESCE((SELECT SUM(CASE WHEN NOT inv.money_received THEN total_amount - amount_received ELSE 0 END) FROM inv), 0),
    (SELECT COUNT(*) FROM inv WHERE inv.money_received OR status = 'paid'),
    (SELECT COUNT(*) FROM unpaid WHERE bucket <> 'current'),
    (SELECT COUNT(*) FROM invoices
      WHERE owner_id = p_owner_id AND status = 'draft'
        AND issue_date BETWEEN v_start AND v_end),
    COALESCE((SELECT ROUND(AVG(total_amount), 2) FROM inv), 0),
    (SELECT COUNT(*) FROM customers WHERE owner_id = p_owner_id AND is_active),
    (SELECT COUNT(*) FROM customers
      WHERE owner_id = p_owner_id AND created_at::DATE BETWEEN v_start AND v_end),
    (SELECT COUNT(*) FROM reminders
      WHERE owner_id = p_owner_id AND status = 'sent'
        AND created_at::DATE BETWEEN v_start AND v_end),
    (SELECT j FROM top_cust),
    (SELECT j FROM trend),
    (SELECT j FROM statuses),
    CASE WHEN COALESCE((SELECT SUM(total_amount) FROM inv), 0) = 0 THEN 0
         ELSE ROUND(
           COALESCE((SELECT SUM(CASE WHEN inv.money_received THEN amount_received ELSE 0 END) FROM inv), 0)
           / (SELECT SUM(total_amount) FROM inv) * 100, 2)
    END,
    COALESCE((SELECT SUM(taxable_amount) FROM inv), 0),
    COALESCE((SELECT SUM(cgst_amount) FROM inv), 0),
    COALESCE((SELECT SUM(sgst_amount) FROM inv), 0),
    COALESCE((SELECT SUM(igst_amount) FROM inv), 0),
    COALESCE((SELECT SUM(cgst_amount + sgst_amount + igst_amount) FROM inv), 0),
    (SELECT j FROM age),
    COALESCE((SELECT SUM(total_amount) FROM prior), 0),
    COALESCE((SELECT SUM(CASE WHEN prior.money_received THEN amount_received ELSE 0 END) FROM prior), 0),
    (SELECT COUNT(*) FROM prior),
    (SELECT j FROM quiet),
    (SELECT j FROM late);
END;
$$;
