# Ledgerly DB — Schema & Stored Procedure Catalog

## Entity relationship (logical)

```
owners (1) ──< users
   │              │
   │              └── password_otps
   │
   ├──< customers
   ├──< bill_templates
   ├──< catalog_items
   ├──< invoices ──< invoice_lines
   │       └──< reminders
   └──< audit_logs
```

Multi-tenant key: **`owner_id`** on almost every business table.

---

## Tables (10)

| Table | Purpose |
|-------|---------|
| `owners` | Business / tenant (your paying client) |
| `users` | Login accounts; `user_type` commercial\|regular; `role` owner\|staff |
| `password_otps` | Forgot-password OTP (hashed) |
| `customers` | Buyers; rich for commercial autofill; insights for regular |
| `bill_templates` | Smart Invoice OCR templates (empty + sample uploads) |
| `invoices` | All bills; `money_received` flag; period filters |
| `invoice_lines` | Line items |
| `reminders` | Collections WhatsApp messages |
| `catalog_items` | Quick Bill product catalog |
| `audit_logs` | Action audit trail |

---

## Stored procedures / functions

### Auth
| Name | Use |
|------|-----|
| `sp_register_owner` | Create owner + first owner user |
| `sp_create_staff_user` | Staff under owner (default invoices + quick_bill) |
| `sp_get_user_for_login` | Lookup by email/phone for JWT login |
| `sp_mark_login_success` | Update `last_login_at` |
| `sp_request_password_otp` | Store OTP hash; return phone |
| `sp_reset_password_with_otp` | Verify OTP hash; set new password hash |

### Customers
| Name | Use |
|------|-----|
| `sp_upsert_customer` | Create/update; match by GSTIN/phone |
| `sp_search_customers_autocomplete` | Commercial name/GSTIN/phone suggest |
| `sp_list_customers` | List + search |
| `sp_customer_insights` | Regulars / quiet / tops |
| `sp_touch_customer_from_invoice` | Bump visit/purchase stats |

### Invoices
| Name | Use |
|------|-----|
| `fn_next_invoice_number` | `INV-####` |
| `sp_create_invoice` | Create + lines + GST split + customer touch |
| `sp_set_money_received` | Checkbox “Money Received” |
| `sp_list_invoices` | Search, amount range, period, money filter |
| `sp_get_invoice_with_lines` | Detail |

### Templates
| Name | Use |
|------|-----|
| `sp_create_bill_template` | Empty + sample URLs + layout/schema |
| `sp_update_bill_template` | Edit Word-like layout JSON |
| `sp_get_default_bill_template` | For Quick Bill |
| `sp_list_bill_templates` | Smart Invoice list |

### Collections
| Name | Use |
|------|-----|
| `sp_collections_summary` | Received / not / overdue |
| `sp_list_collection_invoices` | Unpaid list |
| `fn_default_reminder_message` | Polite WhatsApp body |
| `sp_create_reminder` | Only if not money_received |
| `sp_mark_reminder_sent` | After WhatsApp API send |

### Dashboard
| Name | Use |
|------|-----|
| `sp_dashboard_overview` | Charts + KPIs (default monthly) |
| `fn_period_bounds` | weekly / monthly / quarterly / yearly / custom |

---

## Default period

All list/summary SPs that take `p_period` default to **`monthly`**.
