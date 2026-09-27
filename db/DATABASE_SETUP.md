# Ledgerly Database — Setup & Responsibilities

PostgreSQL schema + stored procedures for production multi-tenant Ledgerly.

## Status

**Neon install completed** (10 tables, 25 functions, seed owner + invoices).

App is wired to `DATABASE_URL` in `.env.local`.

Demo login: `owner@demopackers.in` / `Password@123`

---


## What was generated (I handled)

| Path | Purpose |
|------|---------|
| `db/migrations/001_extensions.sql` | `pgcrypto`, `citext` |
| `db/migrations/002_enums.sql` | `user_type`, `user_role`, invoice/reminder enums, etc. |
| `db/migrations/003_tables.sql` | All tables + indexes + FKs |
| `db/migrations/004_triggers_helpers.sql` | `updated_at`, period bounds, next INV number |
| `db/migrations/005_seed_demo.sql` | Demo owner/user/customers/invoices |
| `db/migrations/999_rollback.sql` | Full teardown (dev only) |
| `db/procedures/01_auth.sql` | Register, staff, login lookup, OTP reset |
| `db/procedures/02_customers.sql` | Upsert, autocomplete, list, insights |
| `db/procedures/03_invoices.sql` | Create, money received, filtered list |
| `db/procedures/04_templates.sql` | Smart Invoice templates |
| `db/procedures/05_collections.sql` | Money summary, WhatsApp reminders |
| `db/procedures/06_dashboard.sql` | Full dashboard aggregates |
| `db/queries/00_verify_install.sql` | Post-install checks |
| `db/queries/01_common_ops.sql` | Handy ops queries |
| `db/install.sql` | Runs everything in order |
| `db/SCHEMA.md` | ER overview + SP catalog |

**I will also handle later (after your DB is live):** wire Next.js to Postgres, JWT auth APIs, replace in-memory store, implement all 11 product points.

---

## What YOU must do manually (required before 11 points)

### Step A — Create a PostgreSQL database

Pick one (any is fine):

1. **Neon** (easy free tier): https://neon.tech → New project → copy connection string  
2. **Supabase**: Project → Settings → Database → URI  
3. **Local Docker** (if you prefer local):

```powershell
docker run --name ledgerly-pg -e POSTGRES_PASSWORD=ledgerly -e POSTGRES_DB=ledgerly -p 5432:5432 -d postgres:16
```

Connection URL example:

```text
postgresql://USER:PASSWORD@HOST:5432/ledgerly?sslmode=require
```

Local Docker example:

```text
postgresql://postgres:ledgerly@localhost:5432/ledgerly
```

### Step B — Install `psql` (PostgreSQL client)

- Windows: install [PostgreSQL](https://www.postgresql.org/download/windows/) (includes `psql`) **or** use Neon/Supabase SQL Editor and paste files in order.
- Confirm:

```powershell
psql --version
```

### Step C — Put connection string in env

In `ledgerly\.env.local` (create if missing):

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

Do **not** commit `.env.local`.

### Step D — Run the install script

From PowerShell:

```powershell
cd "c:\Users\SIDDHARTH\OneDrive\Desktop\SOLVED 2.0\ledgerly\db"
$env:PGPASSWORD = "YOUR_PASSWORD"   # if needed
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f install.sql
```

Or set URL inline:

```powershell
psql "postgresql://postgres:ledgerly@localhost:5432/ledgerly" -v ON_ERROR_STOP=1 -f install.sql
```

**No Docker / no psql?** Open your host’s SQL Editor and run files in this exact order:

1. `migrations/001_extensions.sql`  
2. `migrations/002_enums.sql`  
3. `migrations/003_tables.sql`  
4. `migrations/004_triggers_helpers.sql`  
5. `procedures/01_auth.sql` … `06_dashboard.sql` (all six)  
6. `migrations/005_seed_demo.sql` (optional for empty prod — skip on real prod)  
7. `queries/00_verify_install.sql`

### Step E — Verify (tell me the output)

You should see roughly:

| check_type     | value |
|----------------|-------|
| tables         | 10    |
| functions      | 20+   |
| owners_rows    | ≥ 1 (if seed ran) |
| users_rows     | ≥ 2   |
| invoices_rows  | ≥ 2   |

**Reply in chat with:**  
1) Host used (Neon / Supabase / Docker / other)  
2) Paste result of `00_verify_install.sql`  
3) Confirm `DATABASE_URL` is in `ledgerly\.env.local` (do **not** paste the password)

Then I will verify from my side (connectivity + SP smoke tests) and **only then** start deep research + implementation of all 11 points.

---

## Responsibility split (clear)

| Task | Who |
|------|-----|
| Write schema, SPs, seed, docs | **Me (done)** |
| Create Postgres instance / account | **You** |
| Copy `DATABASE_URL` into `.env.local` | **You** |
| Run `install.sql` (or paste SQL in order) | **You** |
| Send verify output | **You** |
| Confirm DB reachable + re-run verify / fix SQL bugs | **Me** |
| Implement login, JWT, OCR, UI for 11 points | **Me (after verify)** |
| WhatsApp OTP provider API keys | **You** (when we wire live SMS/WhatsApp) |
| Production secrets, domain, hosting | **You** |

---

## Security notes

- Passwords: app will use **bcrypt**; SPs store `password_hash` only. Seed uses `pgcrypto` `crypt()` for demo.
- OTP: app generates 6-digit OTP, hashes it, calls `sp_request_password_otp`; never store raw OTP.
- JWT: signed in app (not in DB). Payload: `userId`, `ownerId`, `role`, `userType`.
- Every business query is scoped by `owner_id`.

---

## Rollback (dev only)

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/999_rollback.sql
```

Then re-run `install.sql`.
