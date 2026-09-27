-- Ledgerly — money features: customer template, promise-to-pay, recurring bills
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS default_template_id UUID REFERENCES bill_templates(id) ON DELETE SET NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS promise_to_pay_date DATE,
  ADD COLUMN IF NOT EXISTS promise_note TEXT;

CREATE TABLE IF NOT EXISTS recurring_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  template_id     UUID REFERENCES bill_templates(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  customer_name   TEXT NOT NULL,
  customer_gstin  VARCHAR(15),
  customer_phone  VARCHAR(20),
  title           TEXT NOT NULL DEFAULT 'Recurring bill',
  cadence         TEXT NOT NULL DEFAULT 'monthly'
                  CHECK (cadence IN ('weekly', 'monthly', 'quarterly')),
  next_run_date   DATE NOT NULL,
  day_of_month    INT CHECK (day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 28)),
  due_days        INT NOT NULL DEFAULT 10,
  lines_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
  field_values    JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_recurring_owner_next
  ON recurring_invoices (owner_id, next_run_date)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS payment_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
  txn_date        DATE,
  amount          NUMERIC(14,2) NOT NULL,
  reference       TEXT,
  counterparty    TEXT,
  source_row      TEXT,
  matched         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_payment_matches_owner ON payment_matches (owner_id, created_at DESC);
