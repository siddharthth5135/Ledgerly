import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession, requirePermission } from "@/lib/auth";
import { SECURITY_HEADERS } from "@/lib/security";
import { lookupGstin, buildGstr1Json, buildEinvoicePayload } from "@/lib/gst-compliance";
import { getBusinessProfile } from "@/lib/business";
import { query, queryRows } from "@/lib/db";
import { loadInvoiceRender } from "@/lib/invoice-render";
import { buildEwayBillPayload, validateHsn } from "@/lib/eway-bill";
import { itemAmount, num } from "@/lib/bill-spec";
import { getOwnerGstApiPublic, getOwnerGstApiSecrets } from "@/lib/owner-gst-api";
import { submitEinvoiceIrn, submitEwayBill } from "@/lib/nic-gst-client";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" } });
}

/** GET ?gstin=… → validate / lookup · ?gstr1=1&month=MM&year=YYYY → export */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);

    const gstin = req.nextUrl.searchParams.get("gstin");
    if (gstin) {
      const result = await lookupGstin(gstin);
      return json({ ok: true, ...result });
    }

    if (req.nextUrl.searchParams.get("gstr1") === "1") {
      requirePermission(session, "dashboard");
      const month = Number(req.nextUrl.searchParams.get("month") || new Date().getMonth() + 1);
      const year = Number(req.nextUrl.searchParams.get("year") || new Date().getFullYear());
      const fp = `${String(month).padStart(2, "0")}${year}`;
      const profile = await getBusinessProfile(session.ownerId);
      if (!profile.gstin) return json({ ok: false, error: "Set your GSTIN in Business details first" }, 400);

      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0);
      const end = endDate.toISOString().slice(0, 10);

      const rows = await queryRows<{
        number: string;
        issue_date: string;
        customer_gstin: string | null;
        customer_name: string;
        taxable_amount: string | number;
        cgst_amount: string | number;
        sgst_amount: string | number;
        igst_amount: string | number;
        total_amount: string | number;
      }>(
        `SELECT number, issue_date::text, customer_gstin, customer_name,
                taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount
           FROM invoices
          WHERE owner_id = $1 AND status <> 'cancelled'
            AND issue_date BETWEEN $2::date AND $3::date
          ORDER BY issue_date, number`,
        [session.ownerId, start, end]
      );

      const gstr1 = buildGstr1Json({
        gstin: profile.gstin,
        fp,
        invoices: rows.map((r) => ({
          number: r.number,
          issue_date: r.issue_date,
          customer_gstin: r.customer_gstin,
          customer_name: r.customer_name,
          taxable_amount: Number(r.taxable_amount || 0),
          cgst_amount: Number(r.cgst_amount || 0),
          sgst_amount: Number(r.sgst_amount || 0),
          igst_amount: Number(r.igst_amount || 0),
          total_amount: Number(r.total_amount || 0),
        })),
      });
      return json({ ok: true, gstr1, fileName: `GSTR1_${profile.gstin}_${fp}.json` });
    }

    return json({ ok: false, error: "Pass ?gstin= or ?gstr1=1" }, 400);
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: "GST request failed" }, 500);
  }
}

/**
 * POST { invoiceId, kind?: "einvoice"|"eway", vehicleNo?, distance?, live?: boolean }
 * - live=false (default): download payload JSON
 * - live=true: submit with THIS business’s Settings → GST API credentials (multi-tenant)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    const body = await req.json();
    const invoiceId = String(body.invoiceId || "");
    if (!invoiceId) return json({ ok: false, error: "invoiceId required" }, 400);
    const kind = body.kind === "eway" ? "eway" : "einvoice";
    const live = body.live === true || body.live === "1";

    const r = await loadInvoiceRender(session.ownerId, invoiceId);
    if (!r || !r.spec) return json({ ok: false, error: "Invoice or template missing" }, 404);

    const hsnTips = (r.items.length ? r.items : r.lines.map((l) => ({ hsn: String(l.hsn || "") }))).map(
      (it) => validateHsn(String((it as { hsn?: string }).hsn || ""))
    );
    const hsnIssues = hsnTips.filter((h) => !h.ok);

    const buyerGstin = (r.values.gstin || String(r.inv.customer_gstin || "")).toUpperCase();
    const docDate = r.issueDate.includes("-")
      ? r.issueDate.split("-").reverse().join("/")
      : r.issueDate.replace(/-/g, "/");
    const buyerPin =
      Number(String(r.values.pincode || "").replace(/\D/g, "").slice(0, 6)) || 0;
    const sellerPin = Number(String(r.profile.pincode || "").replace(/\D/g, "").slice(0, 6)) || 0;

    const gstStatus = await getOwnerGstApiPublic(session.ownerId);

    if (kind === "eway") {
      const items = r.items.length
        ? r.items.map((it) => ({
            desc: it.description,
            hsn: it.hsn,
            qty: num(it.qty) || 1,
            taxable: itemAmount(it, r.spec),
            gstPercent: Number(it.gst || r.spec!.totals.gstPercent) || 18,
          }))
        : r.lines.map((l) => ({
            desc: String(l.description || "Item"),
            hsn: String(l.hsn || ""),
            qty: Number(l.qty) || 1,
            taxable: Number(l.line_amount) || 0,
            gstPercent: Number(l.gst_percent) || 18,
          }));
      const payload = buildEwayBillPayload({
        supplierGstin: r.spec.seller.gstin,
        supplierName: r.spec.seller.name,
        supplierAddr: r.spec.seller.address,
        supplierPincode: sellerPin || buyerPin,
        supplierStateCode: r.spec.seller.stateCode || r.spec.seller.gstin.slice(0, 2),
        recipientGstin: isLikelyGstin(buyerGstin) ? buyerGstin : "URP",
        recipientName: r.values.customer_name || String(r.inv.customer_name || ""),
        recipientAddr: r.values.address || "",
        recipientPincode: buyerPin || sellerPin,
        recipientStateCode: r.values.buyer_code || (isLikelyGstin(buyerGstin) ? buyerGstin.slice(0, 2) : r.spec.seller.stateCode),
        docNo: r.number,
        docDate,
        taxableValue: Number(r.inv.taxable_amount || 0),
        cgst: Number(r.inv.cgst_amount || 0),
        sgst: Number(r.inv.sgst_amount || 0),
        igst: Number(r.inv.igst_amount || 0),
        totalValue: Number(r.inv.total_amount || 0),
        transMode: "1",
        vehicleNo: body.vehicleNo ? String(body.vehicleNo) : undefined,
        distance: body.distance ? Number(body.distance) : undefined,
        items,
      });

      if (live) {
        const secrets = await getOwnerGstApiSecrets(session.ownerId);
        if (!secrets || !gstStatus.ewbReady) {
          return json(
            {
              ok: false,
              error: "Connect e-Way under Settings → GST API first (your business credentials).",
              setupHref: "/settings#gst-api",
            },
            400
          );
        }
        const submitted = await submitEwayBill(secrets, payload);
        if (!submitted.ok) {
          await query(
            `UPDATE invoices SET gst_submit_error = $3, updated_at = NOW()
              WHERE id = $1 AND owner_id = $2`,
            [invoiceId, session.ownerId, (submitted.error || "").slice(0, 500)]
          );
          return json({ ok: false, error: submitted.error, raw: submitted.raw, hsnIssues }, 400);
        }
        await query(
          `UPDATE invoices SET
             ewb_number = $3,
             ewb_valid_upto = NULL,
             ewb_vehicle_no = $4,
             gst_submit_error = NULL,
             updated_at = NOW()
           WHERE id = $1 AND owner_id = $2`,
          [
            invoiceId,
            session.ownerId,
            submitted.ewbNumber,
            body.vehicleNo ? String(body.vehicleNo).toUpperCase() : null,
          ]
        );
        return json({
          ok: true,
          kind: "eway",
          live: true,
          ewbNumber: submitted.ewbNumber,
          validUpto: submitted.validUpto,
          hsnIssues,
          note: "e-Way generated with your business API credentials.",
        });
      }

      return json({
        ok: true,
        kind: "eway",
        payload,
        hsnIssues,
        ewbReady: gstStatus.ewbReady,
        note: gstStatus.ewbReady
          ? "Payload ready. Use Get e-Way (live) to submit with your Settings credentials."
          : "Payload ready. Connect e-Way under Settings → GST API to submit live.",
      });
    }

    if (!isLikelyGstin(buyerGstin)) {
      return json({ ok: false, error: "Buyer GSTIN required for e-Invoice (B2B)", hsnIssues }, 400);
    }

    const payload = buildEinvoicePayload({
      sellerGstin: r.spec.seller.gstin,
      sellerName: r.spec.seller.name,
      sellerAddr: r.spec.seller.address,
      sellerStateCode: r.spec.seller.stateCode || r.spec.seller.gstin.slice(0, 2),
      buyerGstin,
      buyerName: r.values.customer_name || String(r.inv.customer_name || ""),
      buyerAddr: r.values.address || "",
      buyerStateCode: r.values.buyer_code || buyerGstin.slice(0, 2),
      invoiceNumber: r.number,
      invoiceDate: docDate,
      items: r.items.map((it) => ({
        desc: it.description,
        hsn: it.hsn,
        qty: num(it.qty) || 1,
        rate: num(it.rate),
        gstPercent: Number(it.gst || r.spec!.totals.gstPercent) || 18,
        amount: itemAmount(it, r.spec),
      })),
      taxable: Number(r.inv.taxable_amount || 0),
      cgst: Number(r.inv.cgst_amount || 0),
      sgst: Number(r.inv.sgst_amount || 0),
      igst: Number(r.inv.igst_amount || 0),
      total: Number(r.inv.total_amount || 0),
    });

    if (live) {
      const secrets = await getOwnerGstApiSecrets(session.ownerId);
      if (!secrets || !gstStatus.einvReady) {
        return json(
          {
            ok: false,
            error: "Connect e-Invoice under Settings → GST API first (your business credentials).",
            setupHref: "/settings#gst-api",
          },
          400
        );
      }
      const submitted = await submitEinvoiceIrn(secrets, payload);
      if (!submitted.ok) {
        await query(
          `UPDATE invoices SET gst_submit_error = $3, updated_at = NOW()
            WHERE id = $1 AND owner_id = $2`,
          [invoiceId, session.ownerId, (submitted.error || "").slice(0, 500)]
        );
        return json({ ok: false, error: submitted.error, raw: submitted.raw, hsnIssues }, 400);
      }
      await query(
        `UPDATE invoices SET
           irn = $3,
           irn_ack_no = $4,
           irn_ack_date = NOW(),
           irn_qr = $5,
           gst_submit_error = NULL,
           updated_at = NOW()
         WHERE id = $1 AND owner_id = $2`,
        [invoiceId, session.ownerId, submitted.irn, submitted.ackNo || null, submitted.signedQr || null]
      );
      return json({
        ok: true,
        kind: "einvoice",
        live: true,
        irn: submitted.irn,
        ackNo: submitted.ackNo,
        ackDate: submitted.ackDate,
        hsnIssues,
        note: "IRN minted with your business API credentials.",
      });
    }

    return json({
      ok: true,
      kind: "einvoice",
      payload,
      hsnIssues,
      nicReady: gstStatus.einvReady,
      note: gstStatus.einvReady
        ? "Payload ready. Use Get IRN (live) to submit with your Settings credentials."
        : "Payload ready. Connect e-Invoice under Settings → GST API to submit live.",
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: "GST payload build failed" }, 500);
  }
}

function isLikelyGstin(g: string) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g);
}
