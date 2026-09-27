-- Ledgerly — Auth SPs
-- App hashes passwords (bcrypt) and OTPs before calling these.

-- Register first owner + owner user in one transaction
CREATE OR REPLACE FUNCTION sp_register_owner(
  p_business_name   TEXT,
  p_phone           TEXT,
  p_email           TEXT,
  p_password_hash   TEXT,
  p_owner_name      TEXT,
  p_user_type       user_type DEFAULT 'regular',
  p_gstin           TEXT DEFAULT NULL,
  p_city            TEXT DEFAULT NULL,
  p_state           TEXT DEFAULT NULL
)
RETURNS TABLE (
  owner_id UUID,
  user_id  UUID,
  email    CITEXT,
  role     user_role,
  user_type user_type
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id UUID;
  v_user_id  UUID;
BEGIN
  IF p_business_name IS NULL OR length(trim(p_business_name)) = 0 THEN
    RAISE EXCEPTION 'business_name is required';
  END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) < 10 THEN
    RAISE EXCEPTION 'valid phone is required';
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'email is required';
  END IF;
  IF p_password_hash IS NULL OR length(p_password_hash) < 20 THEN
    RAISE EXCEPTION 'password_hash looks invalid';
  END IF;

  INSERT INTO owners (business_name, phone, email, gstin, city, state, product_mode)
  VALUES (trim(p_business_name), trim(p_phone), lower(trim(p_email)),
          NULLIF(upper(trim(p_gstin)), ''), p_city, p_state, p_user_type)
  RETURNING id INTO v_owner_id;

  INSERT INTO users (
    owner_id, name, email, phone, password_hash, user_type, role, permissions
  )
  VALUES (
    v_owner_id,
    COALESCE(NULLIF(trim(p_owner_name), ''), p_business_name),
    lower(trim(p_email)),
    trim(p_phone),
    p_password_hash,
    p_user_type,
    'owner',
    '["dashboard","invoices","quick_bill","smart_invoice","customers","grow","collections","books","settings"]'::jsonb
  )
  RETURNING id INTO v_user_id;

  INSERT INTO audit_logs (owner_id, user_id, action, entity_type, entity_id)
  VALUES (v_owner_id, v_user_id, 'owner.register', 'owners', v_owner_id);

  RETURN QUERY
  SELECT v_owner_id, v_user_id, lower(trim(p_email))::CITEXT, 'owner'::user_role, p_user_type;
END;
$$;

-- Create staff under an owner (Invoices + Quick Bill by default)
CREATE OR REPLACE FUNCTION sp_create_staff_user(
  p_owner_id        UUID,
  p_created_by      UUID,
  p_name            TEXT,
  p_email           TEXT,
  p_phone           TEXT,
  p_password_hash   TEXT,
  p_permissions     JSONB DEFAULT '["invoices","quick_bill"]'::jsonb
)
RETURNS TABLE (user_id UUID, email CITEXT, role user_role, permissions JSONB)
LANGUAGE plpgsql
AS $$
DECLARE
  v_creator users%ROWTYPE;
  v_user_id UUID;
  v_type    user_type;
BEGIN
  SELECT * INTO v_creator FROM users WHERE id = p_created_by AND owner_id = p_owner_id;
  IF NOT FOUND OR v_creator.role <> 'owner' OR NOT v_creator.is_active THEN
    RAISE EXCEPTION 'only active owner can create staff';
  END IF;

  SELECT product_mode INTO v_type FROM owners WHERE id = p_owner_id AND is_active;

  INSERT INTO users (owner_id, name, email, phone, password_hash, user_type, role, permissions)
  VALUES (
    p_owner_id, trim(p_name), lower(trim(p_email)), trim(p_phone),
    p_password_hash, v_type, 'staff', COALESCE(p_permissions, '["invoices","quick_bill"]'::jsonb)
  )
  RETURNING id INTO v_user_id;

  INSERT INTO audit_logs (owner_id, user_id, action, entity_type, entity_id, meta)
  VALUES (p_owner_id, p_created_by, 'user.create_staff', 'users', v_user_id,
          jsonb_build_object('email', lower(trim(p_email))));

  RETURN QUERY
  SELECT u.id, u.email, u.role, u.permissions
  FROM users u WHERE u.id = v_user_id;
END;
$$;

-- Validate login credentials (app still verifies password_hash match)
CREATE OR REPLACE FUNCTION sp_get_user_for_login(p_login TEXT)
RETURNS TABLE (
  user_id       UUID,
  owner_id      UUID,
  name          TEXT,
  email         CITEXT,
  phone         VARCHAR,
  password_hash TEXT,
  user_type     user_type,
  role          user_role,
  permissions   JSONB,
  is_active     BOOLEAN,
  owner_active  BOOLEAN,
  business_name TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id, u.owner_id, u.name, u.email, u.phone, u.password_hash,
    u.user_type, u.role, u.permissions, u.is_active,
    o.is_active, o.business_name
  FROM users u
  JOIN owners o ON o.id = u.owner_id
  WHERE u.email = lower(trim(p_login))
     OR u.phone = trim(p_login)
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION sp_mark_login_success(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE users SET last_login_at = NOW() WHERE id = p_user_id;
END;
$$;

-- Request OTP: stores HASHED otp; returns phone for SMS/WhatsApp send
CREATE OR REPLACE FUNCTION sp_request_password_otp(
  p_login       TEXT,
  p_otp_hash    TEXT,
  p_ttl_minutes INT DEFAULT 10
)
RETURNS TABLE (
  otp_id     UUID,
  user_id    UUID,
  phone      VARCHAR,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_user users%ROWTYPE;
  v_id   UUID;
  v_exp  TIMESTAMPTZ;
BEGIN
  SELECT u.* INTO v_user
  FROM users u
  WHERE u.email = lower(trim(p_login)) OR u.phone = trim(p_login);

  IF NOT FOUND OR NOT v_user.is_active THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  -- Invalidate previous unused OTPs
  UPDATE password_otps po
  SET used_at = NOW()
  WHERE po.user_id = v_user.id AND po.used_at IS NULL;

  v_exp := NOW() + make_interval(mins => COALESCE(p_ttl_minutes, 10));

  INSERT INTO password_otps (user_id, otp_hash, expires_at)
  VALUES (v_user.id, p_otp_hash, v_exp)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_user.id, v_user.phone, v_exp;
END;
$$;

-- Verify OTP hash and reset password in one call
CREATE OR REPLACE FUNCTION sp_reset_password_with_otp(
  p_login             TEXT,
  p_otp_hash          TEXT,
  p_new_password_hash TEXT
)
RETURNS TABLE (user_id UUID, success BOOLEAN)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_user users%ROWTYPE;
  v_otp  password_otps%ROWTYPE;
BEGIN
  SELECT u.* INTO v_user
  FROM users u
  WHERE u.email = lower(trim(p_login)) OR u.phone = trim(p_login);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  SELECT po.* INTO v_otp
  FROM password_otps po
  WHERE po.user_id = v_user.id
    AND po.used_at IS NULL
    AND po.expires_at > NOW()
  ORDER BY po.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OTP expired or not found';
  END IF;

  IF v_otp.attempts >= v_otp.max_attempts THEN
    RAISE EXCEPTION 'OTP max attempts exceeded';
  END IF;

  IF v_otp.otp_hash <> p_otp_hash THEN
    UPDATE password_otps SET attempts = attempts + 1 WHERE id = v_otp.id;
    RAISE EXCEPTION 'invalid OTP';
  END IF;

  UPDATE password_otps SET used_at = NOW() WHERE id = v_otp.id;
  UPDATE users SET password_hash = p_new_password_hash WHERE id = v_user.id;

  INSERT INTO audit_logs (owner_id, user_id, action, entity_type, entity_id)
  VALUES (v_user.owner_id, v_user.id, 'user.password_reset', 'users', v_user.id);

  RETURN QUERY SELECT v_user.id, TRUE;
END;
$$;
