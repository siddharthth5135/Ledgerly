-- Ledgerly — install everything in order
-- Usage (psql):
--   psql "%DATABASE_URL%" -f ledgerly/db/install.sql
-- Or from ledgerly/db:
--   psql "%DATABASE_URL%" -f install.sql

\echo '=== 001 extensions ==='
\i migrations/001_extensions.sql

\echo '=== 002 enums ==='
\i migrations/002_enums.sql

\echo '=== 003 tables ==='
\i migrations/003_tables.sql

\echo '=== 004 triggers & helpers ==='
\i migrations/004_triggers_helpers.sql

\echo '=== procedures: auth ==='
\i procedures/01_auth.sql

\echo '=== procedures: customers ==='
\i procedures/02_customers.sql

\echo '=== procedures: invoices ==='
\i procedures/03_invoices.sql

\echo '=== procedures: templates ==='
\i procedures/04_templates.sql

\echo '=== procedures: collections ==='
\i procedures/05_collections.sql

\echo '=== procedures: dashboard ==='
\i procedures/06_dashboard.sql

\echo '=== seed demo (optional — comment out for empty prod) ==='
\i migrations/005_seed_demo.sql

\echo '=== VERIFY ==='
\i queries/00_verify_install.sql

\echo '=== Ledgerly DB install complete ==='
