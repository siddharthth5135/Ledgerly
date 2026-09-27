-- Verify install: tables, enums, key SPs
SELECT 'tables' AS check_type, count(*)::TEXT AS value
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'owners','users','password_otps','customers','bill_templates',
    'invoices','invoice_lines','reminders','catalog_items','audit_logs'
  )
UNION ALL
SELECT 'functions', count(*)::TEXT
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'sp_%'
UNION ALL
SELECT 'owners_rows', count(*)::TEXT FROM owners
UNION ALL
SELECT 'users_rows', count(*)::TEXT FROM users
UNION ALL
SELECT 'invoices_rows', count(*)::TEXT FROM invoices;

-- Expect: tables=10, functions >= 20, seed rows > 0 if seed ran
