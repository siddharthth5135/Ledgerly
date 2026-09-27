import { NextRequest, NextResponse } from "next/server";
import { verifyShareToken } from "@/lib/share-token";
import { loadInvoiceRender } from "@/lib/invoice-render";
import { renderInvoicePdf, safeFileName } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Public PDF of a shared invoice (signed, expiring token). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const p = verifyShareToken(token);
  if (!p) return NextResponse.json({ ok: false, error: "Link expired or invalid" }, { status: 404 });
  const r = await loadInvoiceRender(p.own, p.inv);
  if (!r) return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });

  try {
    const origin = process.env.INTERNAL_ORIGIN || req.nextUrl.origin;
    const pdf = await renderInvoicePdf(`${origin}/share/${encodeURIComponent(token)}?raw=1`);
    const name = `Invoice-${safeFileName(r.number || r.invoiceId)}.pdf`;
    const inline = req.nextUrl.searchParams.get("dl") !== "1";
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
        "Cache-Control": "private, max-age=300",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    console.error("share pdf", e);
    return NextResponse.json({ ok: false, error: "PDF generation failed" }, { status: 500 });
  }
}
