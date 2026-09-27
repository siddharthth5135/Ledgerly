-- Ledgerly — PostgreSQL extensions
-- Run first. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid(), crypt helpers
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email
