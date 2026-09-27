import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession, requirePermission } from "@/lib/auth";
import { queryOne, queryRows } from "@/lib/db";
import { SECURITY_HEADERS } from "@/lib/security";
import { spCreateInvoice } from "@/lib/sp";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

type Recurring = {
  id: string;
  customer_id: string | null;
  template_id: string | null;
  customer_name: string;
  customer_gstin: string | null;
  customer_phone: string | null;
  title: string;
  cadence: string;
  next_run_date: string;
  due_days: number;
  lines_json: unknown;
  field_values: unknown;
  is_active: boolean;
};

function addCadence(d: Date, cadence: string) {
  const n = new Date(d);
  if (cadence === "weekly") n.setDate(n.getDate() + 7);
  else if (cadence === "quarterly") n.setMonth(n.getMonth() + 3);
  else n.setMonth(n.getMonth() + 1);
  return n.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "invoices");
    const rows = await queryRows(
      `SELECT id, customer_id, template_id, customer_name, customer_gstin, customer_phone,
              title, cadence, next_run_date::text, due_days, lines_json, field_values, is_active,
              last_invoice_id, created_at
         FROM recurring_invoices
        WHERE owner_id = $1
        ORDER BY is_active DESC, next_run_date ASC`,
      [session.ownerId]
    );
    return json({ ok: true, recurring: rows });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    return json({ ok: false, error: "Failed" }, 500);
  }
}

/** Create recurring schedule from body or from existing invoice id */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "invoices");
    const body = await req.json();

    if (body.fromInvoiceId) {
      const inv = await queryOne<{
        customer_id: string | null;
        template_id: string | null;
        customer_name: string;
        customer_gstin: string | null;
        customer_phone: string | null;
        field_values: unknown;
      }>(
        `SELECT customer_id, template_id, customer_name, customer_gstin, customer_phone, field_values
           FROM invoices WHERE id = $1 AND owner_id = $2`,
        [String(body.fromInvoiceId), session.ownerId]
      );
      if (!inv) return json({ ok: false, error: "Invoice not found" }, 404);
      const lines = await queryRows(
        `SELECT description, hsn, qty, rate, gst_percent FROM invoice_lines WHERE invoice_id = $1 ORDER BY line_no`,
        [String(body.fromInvoiceId)]
      );
      const cadence = ["weekly", "monthly", "quarterly"].includes(body.cadence) ? body.cadence : "monthly";
      const next = String(body.nextRunDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const row = await queryOne(
        `INSERT INTO recurring_invoices (
           owner_id, customer_id, template_id, created_by, customer_name, customer_gstin, customer_phone,
           title, cadence, next_run_date, due_days, lines_json, field_values
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$12::jsonb,$13::jsonb)
         RETURNING *`,
        [
          session.ownerId,
          inv.customer_id,
          inv.template_id,
          session.userId,
          inv.customer_name,
          inv.customer_gstin,
          inv.customer_phone,
          body.title || `Recurring · ${inv.customer_name}`,
          cadence,
          next,
          Number(body.dueDays) || 10,
          JSON.stringify(lines),
          JSON.stringify(inv.field_values || {}),
        ]
      );
      return json({ ok: true, recurring: row }, 201);
    }

    const customerName = String(body.customerName || "").trim();
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!customerName || !lines.length) return json({ ok: false, error: "customerName and lines required" }, 400);
    const cadence = ["weekly", "monthly", "quarterly"].includes(body.cadence) ? body.cadence : "monthly";
    const row = await queryOne(
      `INSERT INTO recurring_invoices (
         owner_id, customer_id, template_id, created_by, customer_name, customer_gstin, customer_phone,
         title, cadence, next_run_date, due_days, lines_json, field_values
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$12::jsonb,$13::jsonb)
       RETURNING *`,
      [
        session.ownerId,
        body.customerId || null,
        body.templateId || null,
        session.userId,
        customerName,
        body.customerGstin || null,
        body.customerPhone || null,
        body.title || `Recurring · ${customerName}`,
        cadence,
        String(body.nextRunDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
        Number(body.dueDays) || 10,
        JSON.stringify(lines),
        JSON.stringify(body.fieldValues || {}),
      ]
    );
    return json({ ok: true, recurring: row }, 201);
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Create failed" }, 400);
  }
}

/** Run due recurring invoices (or force one id) */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "invoices");
    const body = await req.json().catch(() => ({}));
    const onlyId = body.id ? String(body.id) : null;

    const due = await queryRows<Recurring>(
      onlyId
        ? `SELECT id, customer_id, template_id, customer_name, customer_gstin, customer_phone,
                  title, cadence, next_run_date::text, due_days, lines_json, field_values, is_active
             FROM recurring_invoices WHERE owner_id = $1 AND id = $2 AND is_active`
        : `SELECT id, customer_id, template_id, customer_name, customer_gstin, customer_phone,
                  title, cadence, next_run_date::text, due_days, lines_json, field_values, is_active
             FROM recurring_invoices
            WHERE owner_id = $1 AND is_active AND next_run_date <= CURRENT_DATE
            ORDER BY next_run_date
            LIMIT 50`,
      onlyId ? [session.ownerId, onlyId] : [session.ownerId]
    );

    const created: unknown[] = [];
    for (const r of due) {
      const rawLines = Array.isArray(r.lines_json) ? r.lines_json : [];
      const lines = rawLines.map((l: Record<string, unknown>) => ({
        description: String(l.description || "Item"),
        hsn: String(l.hsn || "9997"),
        qty: Math.max(0.001, Number(l.qty) || 1),
        rate: Math.max(0, Number(l.rate) || 0),
        gst_percent: Number(l.gst_percent ?? l.gstPercent ?? 18),
      }));
      if (!lines.length) continue;
      const invoice = await spCreateInvoice({
        ownerId: session.ownerId,
        createdBy: session.userId,
        customerId: r.customer_id,
        templateId: r.template_id,
        customerName: r.customer_name,
        customerGstin: r.customer_gstin || undefined,
        customerPhone: r.customer_phone || undefined,
        status: "draft",
        source: "quick_bill",
        notes: `Recurring draft · awaiting your approval · ${r.title}`,
        fieldValues: {
          ...((r.field_values as object) || {}),
          __recurring_draft: true,
          __recurring_schedule_id: r.id,
          __recurring_title: r.title,
        },
        lines,
        dueDate: (() => {
          const d = new Date();
          d.setDate(d.getDate() + (r.due_days || 10));
          return d.toISOString().slice(0, 10);
        })(),
      });
      const invId = (invoice as { id?: string } | null)?.id;
      const next = addCadence(new Date(r.next_run_date), r.cadence);
      await queryOne(
        `UPDATE recurring_invoices
            SET next_run_date = $2::date, last_invoice_id = $3, updated_at = NOW()
          WHERE id = $1 RETURNING id`,
        [r.id, next, invId || null]
      );
      created.push(invoice);
    }

    return json({ ok: true, generated: created.length, invoices: created });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Run failed" }, 400);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return json({ ok: false, error: "id required" }, 400);
    const row = await queryOne(
      `UPDATE recurring_invoices
          SET is_active = COALESCE($3, is_active),
              next_run_date = COALESCE($4::date, next_run_date),
              title = COALESCE($5, title),
              updated_at = NOW()
        WHERE id = $1 AND owner_id = $2
        RETURNING *`,
      [id, session.ownerId, typeof body.isActive === "boolean" ? body.isActive : null, body.nextRunDate || null, body.title || null]
    );
    if (!row) return json({ ok: false, error: "Not found" }, 404);
    return json({ ok: true, recurring: row });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    return json({ ok: false, error: "Update failed" }, 400);
  }
}
