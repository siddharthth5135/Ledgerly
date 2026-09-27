-- Multi-tenant GST API credentials (per business) + IRN / e-Way on invoices
-- Platform .env only holds CREDENTIALS_ENCRYPTION_KEY — never each user's NIC password.

CREATE TABLE IF NOT EXISTS owner_gst_api (
  owner_id              UUID PRIMARY KEY REFERENCES owners(id) ON DELETE CASCADE,

  -- Mode: each business brings their own portal/GSP API user
  provider              TEXT NOT NULL DEFAULT 'nic_direct'
                        CHECK (provider IN ('nic_direct', 'gsp')),
  gsp_name              TEXT,                          -- if provider = gsp
  api_env               TEXT NOT NULL DEFAULT 'sandbox'
                        CHECK (api_env IN ('sandbox', 'production')),

  -- Shared GSTIN for API (usually = business GSTIN)
  gstin                 VARCHAR(15),

  -- e-Invoice (encrypted at rest by app)
  einv_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  einv_username_enc     TEXT,
  einv_password_enc     TEXT,
  einv_client_id_enc    TEXT,
  einv_client_secret_enc TEXT,
  einv_connected_at     TIMESTAMPTZ,
  einv_last_ok_at       TIMESTAMPTZ,
  einv_last_error       TEXT,

  -- e-Way Bill
  ewb_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  ewb_username_enc      TEXT,
  ewb_password_enc      TEXT,
  ewb_client_id_enc     TEXT,
  ewb_client_secret_enc TEXT,
  ewb_connected_at      TIMESTAMPTZ,
  ewb_last_ok_at        TIMESTAMPTZ,
  ewb_last_error        TEXT,

  -- Setup wizard progress
  setup_step            TEXT NOT NULL DEFAULT 'not_started'
                        CHECK (setup_step IN (
                          'not_started', 'details_saved', 'einv_tested', 'ewb_tested', 'live'
                        )),
  notes                 TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_owner_gst_api_gstin ON owner_gst_api (gstin);

-- Persist government numbers on each invoice (per-tenant data)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS irn               TEXT,
  ADD COLUMN IF NOT EXISTS irn_ack_no        TEXT,
  ADD COLUMN IF NOT EXISTS irn_ack_date      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS irn_qr            TEXT,
  ADD COLUMN IF NOT EXISTS ewb_number        TEXT,
  ADD COLUMN IF NOT EXISTS ewb_valid_upto    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ewb_vehicle_no    TEXT,
  ADD COLUMN IF NOT EXISTS gst_submit_error  TEXT;

CREATE INDEX IF NOT EXISTS ix_invoices_irn
  ON invoices (owner_id, irn) WHERE irn IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_invoices_ewb
  ON invoices (owner_id, ewb_number) WHERE ewb_number IS NOT NULL;
