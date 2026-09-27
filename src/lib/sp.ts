import { query, queryOne, queryRows } from "./db";
import type { SessionUser, UserRole, UserType } from "./auth";
import { sanitizeJsonValue } from "./bill-ocr";

export type DbUserLogin = {
  user_id: string;
  owner_id: string;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  user_type: UserType;
  role: UserRole;
  permissions: string[] | string;
  is_active: boolean;
  owner_active: boolean;
  business_name: string;
};

function asPermissions(p: string[] | string): string[] {
  if (Array.isArray(p)) return p;
  try {
    const parsed = JSON.parse(p);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toSession(row: DbUserLogin): SessionUser {
  return {
    userId: row.user_id,
    ownerId: row.owner_id,
    email: row.email,
    name: row.name,
    role: row.role,
    userType: row.user_type,
    permissions: asPermissions(row.permissions),
    businessName: row.business_name,
  };
}

export async function spGetUserForLogin(login: string) {
  return queryOne<DbUserLogin>(`SELECT * FROM sp_get_user_for_login($1)`, [login]);
}

export async function spMarkLoginSuccess(userId: string) {
  await query(`SELECT sp_mark_login_success($1)`, [userId]);
}

export async function spRegisterOwner(input: {
  businessName: string;
  phone: string;
  email: string;
  passwordHash: string;
  ownerName: string;
  userType: UserType;
  gstin?: string;
  city?: string;
  state?: string;
}) {
  return queryOne<{
    owner_id: string;
    user_id: string;
    email: string;
    role: UserRole;
    user_type: UserType;
  }>(
    `SELECT * FROM sp_register_owner($1,$2,$3,$4,$5,$6::user_type,$7,$8,$9)`,
    [
      input.businessName,
      input.phone,
      input.email,
      input.passwordHash,
      input.ownerName,
      input.userType,
      input.gstin || null,
      input.city || null,
      input.state || null,
    ]
  );
}

export async function spRequestPasswordOtp(login: string, otpHash: string) {
  return queryOne<{
    otp_id: string;
    user_id: string;
    phone: string;
    expires_at: string;
  }>(`SELECT * FROM sp_request_password_otp($1,$2,10)`, [login, otpHash]);
}

export async function spResetPasswordWithOtp(
  login: string,
  otpHash: string,
  newPasswordHash: string
) {
  return queryOne<{ user_id: string; success: boolean }>(
    `SELECT * FROM sp_reset_password_with_otp($1,$2,$3)`,
    [login, otpHash, newPasswordHash]
  );
}

export async function spCreateStaff(input: {
  ownerId: string;
  createdBy: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
}) {
  return queryOne(
    `SELECT * FROM sp_create_staff_user($1,$2,$3,$4,$5,$6)`,
    [
      input.ownerId,
      input.createdBy,
      input.name,
      input.email,
      input.phone,
      input.passwordHash,
    ]
  );
}

export async function spDashboard(ownerId: string, period = "monthly") {
  return queryOne(`SELECT * FROM sp_dashboard_overview($1,$2::period_filter)`, [
    ownerId,
    period,
  ]);
}

export async function spListInvoices(
  ownerId: string,
  opts: {
    period?: string;
    from?: string | null;
    to?: string | null;
    search?: string | null;
    status?: string | null;
    moneyReceived?: boolean | null;
    amountMin?: number | null;
    amountMax?: number | null;
    source?: string | null;
    limit?: number;
    offset?: number;
  } = {}
) {
  return queryRows(
    `SELECT * FROM sp_list_invoices(
      $1, $2::period_filter, $3::date, $4::date, $5,
      $6::invoice_status, $7, $8, $9, $10::invoice_source, $11, $12
    )`,
    [
      ownerId,
      opts.period || "monthly",
      opts.from || null,
      opts.to || null,
      opts.search || null,
      opts.status || null,
      opts.moneyReceived ?? null,
      opts.amountMin ?? null,
      opts.amountMax ?? null,
      opts.source || null,
      opts.limit ?? 100,
      opts.offset ?? 0,
    ]
  );
}

export async function spCreateInvoice(params: {
  ownerId: string;
  createdBy: string;
  customerId?: string | null;
  templateId?: string | null;
  customerName?: string;
  customerGstin?: string;
  customerPhone?: string;
  customerEmail?: string;
  issueDate?: string;
  dueDate?: string;
  status?: string;
  moneyReceived?: boolean;
  amountReceived?: number;
  source?: string;
  notes?: string;
  fieldValues?: object;
  razorpayLink?: string;
  lines: Array<{
    description: string;
    hsn?: string;
    qty: number;
    rate: number;
    gst_percent?: number;
  }>;
}) {
  return queryOne(
    `SELECT * FROM sp_create_invoice(
      $1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10::date,
      $11::invoice_status,$12,$13,$14::invoice_source,$15,$16::jsonb,$17,$18::jsonb
    )`,
    [
      params.ownerId,
      params.createdBy,
      params.customerId || null,
      params.templateId || null,
      params.customerName || null,
      params.customerGstin || null,
      params.customerPhone || null,
      params.customerEmail || null,
      params.issueDate || null,
      params.dueDate || null,
      params.status || "sent",
      params.moneyReceived ?? false,
      params.amountReceived ?? 0,
      params.source || "quick_bill",
      params.notes || null,
      JSON.stringify(params.fieldValues || {}),
      params.razorpayLink || null,
      JSON.stringify(
        params.lines.map((l) => ({
          description: l.description,
          hsn: l.hsn || "",
          qty: l.qty,
          rate: l.rate,
          gst_percent: l.gst_percent ?? 18,
        }))
      ),
    ]
  );
}

export async function spSetMoneyReceived(
  ownerId: string,
  invoiceId: string,
  userId: string,
  moneyReceived: boolean,
  amountReceived?: number | null
) {
  return queryOne(
    `SELECT * FROM sp_set_money_received($1,$2,$3,$4,$5)`,
    [ownerId, invoiceId, userId, moneyReceived, amountReceived ?? null]
  );
}

export async function spUpsertCustomer(input: {
  ownerId: string;
  name: string;
  phone?: string;
  gstin?: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  customerKind?: string;
  tags?: string[];
  notes?: string;
  customerId?: string;
}) {
  return queryOne(
    `SELECT * FROM sp_upsert_customer(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::customer_kind,$11,$12,$13
    )`,
    [
      input.ownerId,
      input.name,
      input.phone || null,
      input.gstin || null,
      input.email || null,
      input.addressLine1 || null,
      input.city || null,
      input.state || null,
      input.pincode || null,
      input.customerKind || "other",
      input.tags || [],
      input.notes || null,
      input.customerId || null,
    ]
  );
}

export async function spSearchCustomers(ownerId: string, q: string, limit = 10) {
  return queryRows(
    `SELECT * FROM sp_search_customers_autocomplete($1,$2,$3)`,
    [ownerId, q, limit]
  );
}

export async function spListCustomers(ownerId: string, search?: string) {
  return queryRows(`SELECT * FROM sp_list_customers($1,$2,NULL,200,0)`, [
    ownerId,
    search || null,
  ]);
}

export async function spCustomerInsights(ownerId: string, period = "monthly") {
  return queryOne(`SELECT * FROM sp_customer_insights($1,$2::period_filter)`, [
    ownerId,
    period,
  ]);
}

export async function spCollectionsSummary(ownerId: string, period = "monthly") {
  return queryOne(`SELECT * FROM sp_collections_summary($1,$2::period_filter)`, [
    ownerId,
    period,
  ]);
}

export async function spListCollectionInvoices(ownerId: string, period = "monthly") {
  return queryRows(
    `SELECT * FROM sp_list_collection_invoices($1,$2::period_filter,NULL,NULL,TRUE)`,
    [ownerId, period]
  );
}

export async function spDefaultReminderMessage(invoiceId: string) {
  return queryOne<{ fn_default_reminder_message: string }>(
    `SELECT fn_default_reminder_message($1)`,
    [invoiceId]
  );
}

export async function spCreateReminder(
  ownerId: string,
  invoiceId: string,
  userId: string,
  message?: string
) {
  return queryOne(
    `SELECT * FROM sp_create_reminder($1,$2,$3,$4,'whatsapp'::reminder_channel)`,
    [ownerId, invoiceId, userId, message || null]
  );
}

export async function spMarkReminderSent(ownerId: string, reminderId: string) {
  return queryOne(`SELECT * FROM sp_mark_reminder_sent($1,$2,TRUE,NULL)`, [
    ownerId,
    reminderId,
  ]);
}

/** node-pg treats JS arrays as Postgres arrays — always pass JSON *strings* for jsonb. */
function toJsonbParam(value: unknown): string | null {
  if (value == null) return null;
  return JSON.stringify(sanitizeJsonValue(value)).replace(/\\u0000/g, "");
}

export async function spCreateBillTemplate(input: {
  ownerId: string;
  createdBy: string;
  name: string;
  emptyBillUrl: string;
  sampleBillUrl: string;
  layoutJson: object;
  fieldSchema: object;
  ocrRaw?: object;
  setDefault?: boolean;
}) {
  return queryOne(
    `SELECT * FROM sp_create_bill_template($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)`,
    [
      input.ownerId,
      input.createdBy,
      input.name,
      input.emptyBillUrl,
      input.sampleBillUrl,
      toJsonbParam(input.layoutJson),
      toJsonbParam(input.fieldSchema),
      toJsonbParam(input.ocrRaw ?? null),
      input.setDefault ?? true,
    ]
  );
}

export async function spUpdateBillTemplate(input: {
  ownerId: string;
  templateId: string;
  userId: string;
  name?: string;
  layoutJson?: object;
  fieldSchema?: object;
  isActive?: boolean;
  setDefault?: boolean;
}) {
  return queryOne(
    `SELECT * FROM sp_update_bill_template($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,
    [
      input.ownerId,
      input.templateId,
      input.userId,
      input.name || null,
      input.layoutJson ? toJsonbParam(input.layoutJson) : null,
      input.fieldSchema ? toJsonbParam(input.fieldSchema) : null,
      input.isActive ?? null,
      input.setDefault ?? null,
    ]
  );
}

export async function spGetDefaultTemplate(ownerId: string) {
  return queryOne(`SELECT * FROM sp_get_default_bill_template($1)`, [ownerId]);
}

/** Names only. Full layouts are large; load one with spGetTemplate when it is opened. */
export async function spListTemplates(ownerId: string) {
  return queryRows(
    `SELECT id, owner_id, name, is_default, is_active, updated_at, created_at
       FROM bill_templates
      WHERE owner_id = $1
      ORDER BY is_default DESC, updated_at DESC`,
    [ownerId]
  );
}

export async function spGetTemplate(ownerId: string, templateId: string) {
  return queryOne(`SELECT * FROM bill_templates WHERE id = $1 AND owner_id = $2`, [ownerId, templateId]);
}

export async function spGetInvoiceWithLines(ownerId: string, invoiceId: string) {
  return queryOne<{ invoice: unknown; lines: unknown }>(
    `SELECT * FROM sp_get_invoice_with_lines($1,$2)`,
    [ownerId, invoiceId]
  );
}

export async function getInvoiceById(ownerId: string, id: string) {
  return queryOne(`SELECT * FROM invoices WHERE id = $1 AND owner_id = $2`, [
    id,
    ownerId,
  ]);
}
