import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession, requirePermission } from "@/lib/auth";
import { spSetMoneyReceived, getInvoiceById, spGetInvoiceWithLines } from "@/lib/sp";
import { query } from "@/lib/db";
import { SECURITY_HEADERS } from "@/lib/security";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    const { id } = await ctx.params;
    const detail = await spGetInvoiceWithLines(session.ownerId, id);
    if (!detail?.invoice) return json({ ok: false, error: "Not found" }, 404);
    return json({ ok: true, ...detail });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    return json({ ok: false, error: "Failed" }, 500);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "invoices");
    const { id } = await ctx.params;
    const body = await req.json();

    if (body.action === "money_received" || typeof body.moneyReceived === "boolean") {
      const moneyReceived = Boolean(
        body.moneyReceived ?? body.action === "money_received"
      );
      const inv = await spSetMoneyReceived(
        session.ownerId,
        id,
        session.userId,
        moneyReceived,
        body.amountReceived != null ? Number(body.amountReceived) : null
      );
      return json({ ok: true, invoice: inv, message: moneyReceived ? "Marked received" : "Marked unpaid" });
    }

    if (body.action === "mark_paid") {
      const inv = await spSetMoneyReceived(session.ownerId, id, session.userId, true, null);
      return json({ ok: true, invoice: inv, message: "Marked paid / money received" });
    }

    if (body.action === "cancel") {
      const res = await query(
        `UPDATE invoices
         SET status = 'cancelled'::invoice_status
         WHERE id = $1 AND owner_id = $2 AND status <> 'cancelled'
         RETURNING *`,
        [id, session.ownerId]
      );
      if (!res.rows[0]) return json({ ok: false, error: "Invoice not found or already cancelled" }, 404);
      return json({ ok: true, invoice: res.rows[0], message: "Invoice cancelled" });
    }

    /** Approve a recurring draft → becomes a real sent bill */
    if (body.action === "approve" || body.action === "approve_send") {
      const res = await query(
        `UPDATE invoices
            SET status = 'sent'::invoice_status,
                notes = CASE
                  WHEN notes ILIKE 'Recurring draft%' THEN 'Recurring · approved'
                  ELSE notes
                END,
                field_values = COALESCE(field_values, '{}'::jsonb) - '__recurring_draft'
         WHERE id = $1 AND owner_id = $2 AND status = 'draft'
         RETURNING *`,
        [id, session.ownerId]
      );
      if (!res.rows[0]) {
        return json({ ok: false, error: "Draft not found (already approved or cancelled?)" }, 404);
      }
      return json({ ok: true, invoice: res.rows[0], message: "Approved — invoice is now sent" });
    }

    /** Discard recurring draft */
    if (body.action === "reject_draft") {
      const res = await query(
        `UPDATE invoices
            SET status = 'cancelled'::invoice_status
         WHERE id = $1 AND owner_id = $2 AND status = 'draft'
         RETURNING *`,
        [id, session.ownerId]
      );
      if (!res.rows[0]) return json({ ok: false, error: "Draft not found" }, 404);
      return json({ ok: true, invoice: res.rows[0], message: "Draft discarded" });
    }

    if (body.action === "remind") {
      return json(
        {
          ok: false,
          error: "Use Collections → Remind for WhatsApp reminders",
        },
        400
      );
    }

    const existing = await getInvoiceById(session.ownerId, id);
    if (!existing) return json({ ok: false, error: "Not found" }, 404);
    return json({ ok: true, invoice: existing });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Patch failed" }, 400);
  }
}
