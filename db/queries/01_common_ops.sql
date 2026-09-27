-- Useful ad-hoc queries for ops / debugging

-- 1) List tenants
-- SELECT id, business_name, product_mode, phone, email, is_active FROM owners ORDER BY created_at;

-- 2) Users under an owner
-- SELECT id, name, email, phone, role, user_type, permissions, is_active
-- FROM users WHERE owner_id = :owner_id;

-- 3) Monthly invoices (default period)
-- SELECT * FROM sp_list_invoices(:owner_id, 'monthly');

-- 4) Money not received this month
-- SELECT * FROM sp_list_invoices(:owner_id, 'monthly', NULL, NULL, NULL, NULL, FALSE);

-- 5) Commercial autocomplete
-- SELECT id, name, gstin, phone, city FROM sp_search_customers_autocomplete(:owner_id, 'Shar');

-- 6) Dashboard overview
-- SELECT * FROM sp_dashboard_overview(:owner_id, 'monthly');

-- 7) Collections summary
-- SELECT * FROM sp_collections_summary(:owner_id, 'monthly');

-- 8) Preview default WhatsApp reminder text
-- SELECT fn_default_reminder_message(:invoice_id);

-- 9) Create reminder (unpaid only)
-- SELECT * FROM sp_create_reminder(:owner_id, :invoice_id, :user_id, NULL, 'whatsapp');

-- 10) Mark money received
-- SELECT number, money_received, status, amount_received
-- FROM sp_set_money_received(:owner_id, :invoice_id, :user_id, TRUE, NULL);
