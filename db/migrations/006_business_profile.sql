-- Ledgerly — business profile (seller details shared by every bill of an owner)
-- Bank details, state code, default GST %, signature line, etc.
ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS business_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN owners.business_profile IS
  'Seller details applied to all bill designs: {stateCode, bank{name,acNo,ifsc,branch}, defaultGstPercent, address}';
