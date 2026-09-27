-- Ledgerly — demo seed (safe for local/dev only)
-- Password for all seeded users:  Password@123
-- bcrypt hash below is for "Password@123" (cost 10)
-- Generate your own in app later; this is ONLY for smoke testing SPs.

DO $$
DECLARE
  v_owner_id UUID;
  v_user_id  UUID;
  v_staff_id UUID;
  v_cust1    UUID;
  v_cust2    UUID;
  v_hash     TEXT := '$2b$10$rQZ5Y5Y5Y5Y5Y5Y5Y5Y5YuGKxGxGxGxGxGxGxGxGxGxGxGxGxGxGxG'; -- PLACEHOLDER
  -- NOTE: Replace v_hash via seed from app OR run queries/replace_demo_password.sql after first bcrypt hash.
BEGIN
  -- Skip if already seeded
  IF EXISTS (SELECT 1 FROM owners WHERE phone = '9999990001') THEN
    RAISE NOTICE 'Seed already applied — skipping';
    RETURN;
  END IF;

  -- Use a recognizable placeholder hash length; app must reset before real login.
  -- Real bcrypt hashes are ~60 chars. This seed inserts a marker hash you MUST replace.
  v_hash := crypt('Password@123', gen_salt('bf', 10));

  SELECT owner_id, user_id INTO v_owner_id, v_user_id
  FROM sp_register_owner(
    'Demo Packers Pvt Ltd',
    '9999990001',
    'owner@demopackers.in',
    v_hash,
    'Demo Owner',
    'commercial',
    '27AABCA1234D1Z5',
    'Pune',
    'Maharashtra'
  );

  SELECT s.user_id INTO v_staff_id
  FROM sp_create_staff_user(
    v_owner_id, v_user_id,
    'Billing Staff',
    'staff@demopackers.in',
    '9999990002',
    v_hash
  ) AS s;

  SELECT id INTO v_cust1 FROM sp_upsert_customer(
    v_owner_id,
    'Sharma Kirana Store',
    '9876543210',
    '27AABCS1111K1Z9',
    NULL,
    'FC Road',
    'Pune',
    'Maharashtra',
    '411004',
    'wholesale',
    ARRAY['b2b']
  );

  SELECT id INTO v_cust2 FROM sp_upsert_customer(
    v_owner_id,
    'Urban Wear Retail Pvt Ltd',
    '9811122333',
    '07AABCU9988W1Z3',
    'pay@urbanwear.in',
    'Connaught Place',
    'New Delhi',
    'Delhi',
    '110001',
    'b2b',
    ARRAY['wholesale']
  );

  PERFORM sp_create_invoice(
    v_owner_id, v_user_id, v_cust1, NULL,
    NULL, NULL, NULL, NULL,
    CURRENT_DATE - 2, CURRENT_DATE + 8,
    'sent', FALSE, 0, 'quick_bill', 'Net 10',
    '{}'::jsonb, 'https://rzp.io/i/demo1',
    '[{"description":"Corrugated cartons","hsn":"4819","qty":10,"rate":45,"gst_percent":18}]'::jsonb
  );

  PERFORM sp_create_invoice(
    v_owner_id, v_user_id, v_cust2, NULL,
    NULL, NULL, NULL, NULL,
    CURRENT_DATE - 15, CURRENT_DATE - 5,
    'overdue', FALSE, 0, 'manual', 'Follow up',
    '{}'::jsonb, 'https://rzp.io/i/demo2',
    '[{"description":"Corrugated cartons (boxes)","hsn":"4819","qty":200,"rate":28,"gst_percent":18}]'::jsonb
  );

  INSERT INTO catalog_items (owner_id, name, hsn, default_rate, gst_percent)
  VALUES
    (v_owner_id, 'Corrugated cartons', '4819', 45, 18),
    (v_owner_id, 'Food-grade polymer pouches', '3923', 2.40, 18);

  RAISE NOTICE 'Seed OK. owner=% user=% staff=%', v_owner_id, v_user_id, v_staff_id;
  RAISE NOTICE 'Login email: owner@demopackers.in / Password@123 (pgcrypto bf hash)';
END $$;
