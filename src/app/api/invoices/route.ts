import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession, requirePermission } from "@/lib/auth";
import { spCreateInvoice, spListInvoices, spUpsertCustomer } from "@/lib/sp";
import { num } from "@/lib/bill-spec";
import { sanitizePhone, sanitizeText, SECURITY_HEADERS, normalizeGstin } from "@/lib/security";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "Cache-Control": "private, max-age=12",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "invoices");

    const sp = req.nextUrl.searchParams;
    const money = sp.get("moneyReceived");
    const invoices = await spListInvoices(session.ownerId, {
      period: sp.get("period") || "monthly",
      from: sp.get("from"),
      to: sp.get("to"),
      search: sp.get("search"),
      status: sp.get("status"),
      moneyReceived:
        money === "true" ? true : money === "false" ? false : null,
      amountMin: sp.get("amountMin") ? Number(sp.get("amountMin")) : null,
      amountMax: sp.get("amountMax") ? Number(sp.get("amountMax")) : null,
      source: sp.get("source"),
      limit: Number(sp.get("limit") || 100),
      offset: Number(sp.get("offset") || 0),
    });

    return json({ ok: true, invoices, period: sp.get("period") || "monthly" });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: "Failed to list invoices" }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "invoices");

    const body = await req.json();
    const customerName = sanitizeText(body.customerName || "", 120);
    const linesIn = Array.isArray(body.lines) ? body.lines : [];
    if (!customerName || linesIn.length === 0) {
      return json({ ok: false, error: "customerName and lines required" }, 400);
    }

    const lines = linesIn.map((l: Record<string, unknown>) => ({
      description: sanitizeText(String(l.description || "Item"), 200) || "Item",
      hsn: sanitizeText(String(l.hsn || "9997"), 8) || "9997",
      qty: Math.max(0.001, num(l.qty) || 0.001),
      rate: Math.max(0, num(l.rate)),
      gst_percent: Number(l.gstPercent ?? l.gst_percent ?? 18),
    }));

    let customerId: string | null = body.customerId || null;
    const phone = sanitizePhone(body.customerPhone);
    const gstin = normalizeGstin(body.customerGstin);

    // Commercial: persist customer for autofill; Regular: light upsert if phone present
    if (session.userType === "commercial" || phone) {
      const cust = await spUpsertCustomer({
        ownerId: session.ownerId,
        name: customerName,
        phone: phone || undefined,
        gstin,
        email: body.customerEmail ? String(body.customerEmail) : undefined,
        city: body.city ? String(body.city) : undefined,
        state: body.state ? String(body.state) : undefined,
        customerId: customerId || undefined,
        customerKind: session.userType === "commercial" ? "b2b" : "retail",
      });
      customerId = (cust as { id?: string } | null)?.id || customerId;
    }

    const moneyReceived = Boolean(body.moneyReceived);
    const sourceMap: Record<string, string> = {
      manual: "quick_bill",
      quick_bill: "quick_bill",
      whatsapp: "whatsapp",
      gmail: "gmail",
      ocr: "ocr",
      ai: "ai",
    };
    const source = sourceMap[String(body.source || "quick_bill")] || "quick_bill";

    const invoice = await spCreateInvoice({
      ownerId: session.ownerId,
      createdBy: session.userId,
      customerId,
      templateId: body.templateId || null,
      customerName,
      customerGstin: gstin,
      customerPhone: phone || undefined,
      customerEmail: body.customerEmail ? String(body.customerEmail) : undefined,
      status: body.status === "draft" ? "draft" : "sent",
      moneyReceived,
      amountReceived: moneyReceived ? Number(body.amountReceived || 0) : 0,
      source,
      notes: body.notes ? sanitizeText(String(body.notes), 500) : undefined,
      fieldValues: body.fieldValues || {},
      razorpayLink: body.createRazorpay !== false
        ? `https://rzp.io/i/demo_${Date.now()}`
        : undefined,
      lines,
    });

    return json({ ok: true, invoice }, 201);
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Create failed" }, 500);
  }
}
