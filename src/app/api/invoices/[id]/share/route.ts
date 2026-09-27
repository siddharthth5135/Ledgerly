import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { SECURITY_HEADERS } from "@/lib/security";
import { createShareToken } from "@/lib/share-token";
import { loadInvoiceRender } from "@/lib/invoice-render";
import { inrExact } from "@/lib/format";

export const runtime = "nodejs";

/**
 * Creates a public, signed share link for an invoice and returns ready-to-use URLs:
 *  - url     : web view of the bill
 *  - pdfUrl  : the generated PDF (same design as print)
 *  - whatsapp: wa.me deep link with the PDF link in the message
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: SECURITY_HEADERS });
    const { id } = await ctx.params;
    const r = await loadInvoiceRender(session.ownerId, id);
    if (!r) return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404, headers: SECURITY_HEADERS });

    const token = createShareToken(r.invoiceId, session.ownerId);
    const origin = process.env.PUBLIC_ORIGIN || req.nextUrl.origin;
    const url = `${origin}/share/${encodeURIComponent(token)}`;
    const pdfUrl = `${origin}/api/share/${encodeURIComponent(token)}/pdf`;

    const business = r.profile.name || session.businessName || "";
    const total = inrExact(Number(r.inv.total_amount || 0));
    const customer = String(r.inv.customer_name || "");
    const text =
      `${business ? business + " — " : ""}Invoice ${r.number}` +
      (customer ? ` for ${customer}` : "") +
      `\nAmount: ${total}\nDate: ${r.issueDate}\n\nDownload PDF: ${pdfUrl}`;
    const phoneRaw = String(req.nextUrl.searchParams.get("phone") || r.inv.customer_phone || "").replace(/\D/g, "");
    const phone = phoneRaw.length === 10 ? `91${phoneRaw}` : phoneRaw;
    const whatsapp = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

    return NextResponse.json(
      { ok: true, url, pdfUrl, whatsapp, text, fileName: `Invoice-${r.number || r.invoiceId}.pdf` },
      { headers: SECURITY_HEADERS }
    );
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("share link", e);
    return NextResponse.json({ ok: false, error: "Could not create share link" }, { status: 500, headers: SECURITY_HEADERS });
  }
}
