import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession, requirePermission } from "@/lib/auth";
import { SECURITY_HEADERS } from "@/lib/security";
import { itemAmount, num } from "@/lib/bill-spec";
import { loadInvoiceRender } from "@/lib/invoice-render";
import { spCreateInvoice } from "@/lib/sp";

export const runtime = "nodejs";

/** Duplicate an invoice as a new draft (today's date, new number). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: SECURITY_HEADERS });
    }
    requirePermission(session, "invoices");
    const { id } = await ctx.params;
    const r = await loadInvoiceRender(session.ownerId, id);
    if (!r) {
      return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404, headers: SECURITY_HEADERS });
    }

    const lines = r.items
      .filter((it) => (it.description || "").trim())
      .flatMap((it) => {
        const qty = num(it.qty);
        if (qty <= 0) return [];
        const amount = itemAmount(it, r.spec);
        return [
          {
            description: it.description || "Item",
            hsn: it.hsn || "9997",
            qty,
            rate: +(amount / qty).toFixed(4),
            gst_percent: Number(it.gst || 18),
          },
        ];
      });

    if (!lines.length && r.lines.length) {
      for (const l of r.lines) {
        const qty = num(l.qty);
        if (qty <= 0) continue;
        lines.push({
          description: String(l.description || "Item"),
          hsn: String(l.hsn || "9997"),
          qty,
          rate: num(l.rate),
          gst_percent: Number(l.gst_percent || 18),
        });
      }
    }

    if (!lines.length) {
      return NextResponse.json({ ok: false, error: "Nothing to duplicate" }, { status: 400, headers: SECURITY_HEADERS });
    }

    const fieldValues = { ...r.values };
    delete fieldValues.invoice_no;
    delete fieldValues.invoice_date;

    const invoice = await spCreateInvoice({
      ownerId: session.ownerId,
      createdBy: session.userId,
      customerId: r.inv.customer_id ? String(r.inv.customer_id) : null,
      customerName: String(r.inv.customer_name || r.values.customer_name || "Customer"),
      customerGstin: String(r.inv.customer_gstin || r.values.gstin || "") || undefined,
      customerPhone: String(r.inv.customer_phone || "") || undefined,
      customerEmail: String(r.inv.customer_email || "") || undefined,
      lines,
      notes: String(r.inv.notes || ""),
      source: "quick_bill",
      status: "draft",
      moneyReceived: false,
      amountReceived: 0,
      templateId: r.inv.template_id ? String(r.inv.template_id) : null,
      fieldValues: { ...fieldValues, __items: r.items },
    });

    return NextResponse.json(
      { ok: true, invoice, note: "Duplicated as draft — edit dates/qty then send." },
      { headers: SECURITY_HEADERS }
    );
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status, headers: SECURITY_HEADERS });
    }
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Duplicate failed" },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }
}
