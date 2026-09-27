-- Ledgerly — core tables
-- Run after 002_enums.sql

-- ---------------------------------------------------------------------------
-- 1. owners  (tenant / business — one selling client of Ledgerly)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS owners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name   TEXT NOT NULL,
  trade_name      TEXT,
  gstin           VARCHAR(15),
  pan             VARCHAR(10),
  phone           VARCHAR(20) NOT NULL,
  email           CITEXT,
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  state           TEXT,
  pincode         VARCHAR(10),
  country         TEXT NOT NULL DEFAULT 'IN',
  product_mode    user_type NOT NULL DEFAULT 'regular',  -- commercial | regular
  plan            TEXT NOT NULL DEFAULT 'starter',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT owners_gstin_format CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_owners_phone ON owners (phone);
CREATE UNIQUE INDEX IF NOT EXISTS uq_owners_email ON owners (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_owners_gstin ON owners (gstin) WHERE gstin IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. users  (login accounts under an owner)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           CITEXT NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  password_hash   TEXT NOT NULL,          -- bcrypt / argon2 from app
  user_type       user_type NOT NULL,     -- commercial | regular
  role            user_role NOT NULL DEFAULT 'staff',
  -- staff default: invoices + quick_bill only; owner: all modules
  permissions     JSONB NOT NULL DEFAULT '["invoices","quick_bill"]'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_format CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone ON users (phone);
CREATE INDEX IF NOT EXISTS ix_users_owner ON users (owner_id);
CREATE INDEX IF NOT EXISTS ix_users_owner_role ON users (owner_id, role);

-- ---------------------------------------------------------------------------
-- 3. password_otps  (forgot password → OTP to registered phone)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_otps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash        TEXT NOT NULL,           -- hash of 6-digit OTP
  purpose         TEXT NOT NULL DEFAULT 'forgot_password',
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  attempts        INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 5,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT password_otps_purpose_chk CHECK (purpose IN ('forgot_password', 'login_verify'))
);

CREATE INDEX IF NOT EXISTS ix_password_otps_user ON password_otps (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_password_otps_active
  ON password_otps (user_id, expires_at)
  WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. customers  (buyers of the owner's business)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  phone             VARCHAR(20),
  gstin             VARCHAR(15),
  email             CITEXT,
  address_line1     TEXT,
  address_line2     TEXT,
  city              TEXT,
  state             TEXT,
  pincode           VARCHAR(10),
  customer_kind     customer_kind NOT NULL DEFAULT 'other',
  tags              TEXT[] NOT NULL DEFAULT '{}',
  notes             TEXT,
  visit_count       INT NOT NULL DEFAULT 0,
  invoice_count     INT NOT NULL DEFAULT 0,
  total_purchases   NUMERIC(14,2) NOT NULL DEFAULT 0,
  last_purchase_at  TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customers_gstin_format CHECK (
    gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
  )
);

CREATE INDEX IF NOT EXISTS ix_customers_owner ON customers (owner_id);
CREATE INDEX IF NOT EXISTS ix_customers_owner_name ON customers (owner_id, lower(name));
CREATE INDEX IF NOT EXISTS ix_customers_owner_phone ON customers (owner_id, phone);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_owner_gstin
  ON customers (owner_id, gstin) WHERE gstin IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_owner_phone
  ON customers (owner_id, phone) WHERE phone IS NOT NULL AND phone <> '';
CREATE INDEX IF NOT EXISTS ix_customers_owner_last_purchase
  ON customers (owner_id, last_purchase_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- 5. bill_templates  (Smart Invoice OCR templates)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bill_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name              TEXT NOT NULL,
  empty_bill_url    TEXT NOT NULL,          -- blank layout upload
  sample_bill_url   TEXT NOT NULL,          -- filled dummy/real bill upload
  layout_json       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Word-like editable layout
  field_schema      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{key,label,type,required}]
  ocr_raw           JSONB,                 -- raw OCR payload for debug
  is_active         BOOLEAN NOT NULL DEFAULT FALSE,
  is_default        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_bill_templates_owner ON bill_templates (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_templates_one_default
  ON bill_templates (owner_id) WHERE is_default = TRUE AND is_active = TRUE;

-- ---------------------------------------------------------------------------
-- 6. invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,
  template_id       UUID REFERENCES bill_templates(id) ON DELETE SET NULL,
  number            TEXT NOT NULL,
  customer_name     TEXT NOT NULL,
  customer_gstin    VARCHAR(15),
  customer_phone    VARCHAR(20),
  customer_email    CITEXT,
  issue_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE NOT NULL,
  status            invoice_status NOT NULL DEFAULT 'draft',
  money_received    BOOLEAN NOT NULL DEFAULT FALSE,
  amount_received   NUMERIC(14,2) NOT NULL DEFAULT 0,
  taxable_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency          CHAR(3) NOT NULL DEFAULT 'INR',
  source            invoice_source NOT NULL DEFAULT 'quick_bill',
  notes             TEXT,
  field_values      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- template field values
  razorpay_link     TEXT,
  books_synced_to   books_target NOT NULL DEFAULT 'none',
  books_synced_at   TIMESTAMPTZ,
  reminders_sent    INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_amounts_nonneg CHECK (
    taxable_amount >= 0 AND cgst_amount >= 0 AND sgst_amount >= 0
    AND igst_amount >= 0 AND total_amount >= 0 AND amount_received >= 0
  ),
  CONSTRAINT invoices_due_after_issue CHECK (due_date >= issue_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_owner_number ON invoices (owner_id, number);
CREATE INDEX IF NOT EXISTS ix_invoices_owner_issue ON invoices (owner_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS ix_invoices_owner_status ON invoices (owner_id, status);
CREATE INDEX IF NOT EXISTS ix_invoices_owner_money ON invoices (owner_id, money_received);
CREATE INDEX IF NOT EXISTS ix_invoices_owner_total ON invoices (owner_id, total_amount);
CREATE INDEX IF NOT EXISTS ix_invoices_customer ON invoices (customer_id);
CREATE INDEX IF NOT EXISTS ix_invoices_created_by ON invoices (created_by);
CREATE INDEX IF NOT EXISTS ix_invoices_search_name ON invoices (owner_id, lower(customer_name));

-- ---------------------------------------------------------------------------
-- 7. invoice_lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_no         INT NOT NULL DEFAULT 1,
  description     TEXT NOT NULL,
  hsn             VARCHAR(8),
  qty             NUMERIC(14,3) NOT NULL DEFAULT 1,
  rate            NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_percent     NUMERIC(5,2) NOT NULL DEFAULT 18,
  line_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,  -- qty * rate (taxable)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_lines_qty_pos CHECK (qty > 0),
  CONSTRAINT invoice_lines_rate_nonneg CHECK (rate >= 0)
);

CREATE INDEX IF NOT EXISTS ix_invoice_lines_invoice ON invoice_lines (invoice_id);

-- ---------------------------------------------------------------------------
-- 8. reminders  (Collections — WhatsApp by default)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  channel         reminder_channel NOT NULL DEFAULT 'whatsapp',
  message         TEXT NOT NULL,
  status          reminder_status NOT NULL DEFAULT 'pending',
  scheduled_for   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_reminders_owner ON reminders (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_reminders_invoice ON reminders (invoice_id);
CREATE INDEX IF NOT EXISTS ix_reminders_status ON reminders (owner_id, status);

-- ---------------------------------------------------------------------------
-- 9. catalog_items  (optional product catalog for Quick Bill)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  hsn             VARCHAR(8),
  default_rate    NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_percent     NUMERIC(5,2) NOT NULL DEFAULT 18,
  unit            TEXT DEFAULT 'pcs',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_catalog_items_owner ON catalog_items (owner_id, lower(name));

-- ---------------------------------------------------------------------------
-- 10. audit_logs  (lightweight production audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID REFERENCES owners(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       UUID,
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_audit_logs_owner ON audit_logs (owner_id, created_at DESC);
