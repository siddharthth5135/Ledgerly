import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession, requirePermission } from "@/lib/auth";
import { query, queryRows } from "@/lib/db";
import { SECURITY_HEADERS } from "@/lib/security";
import { buildSalesRegisterCsv, buildZohoInvoiceCsv } from "@/lib/sales-register-csv";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

function journalFromInvoice(inv: {
  taxable_amount: string | number;
  cgst_amount: string | number;
  sgst_amount: string | number;
  igst_amount: string | number;
  total_amount: string | number;
}) {
  const taxable = Number(inv.taxable_amount);
  const cgst = Number(inv.cgst_amount);
  const sgst = Number(inv.sgst_amount);
  const igst = Number(inv.igst_amount);
  const total = Number(inv.total_amount);
  const rows = [
    { account: "Accounts Receivable", debit: total, credit: 0 },
    { account: "Sales", debit: 0, credit: taxable },
  ];
  if (igst > 0) rows.push({ account: "Output IGST", debit: 0, credit: igst });
  else {
    rows.push({ account: "Output CGST", debit: 0, credit: cgst });
    rows.push({ account: "Output SGST", debit: 0, credit: sgst });
  }
  return rows;
}

const PERIODS = new Set(["weekly", "monthly", "quarterly", "yearly"]);

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "books");

    const periodRaw = req.nextUrl.searchParams.get("period") || "monthly";
    const period = PERIODS.has(periodRaw) ? periodRaw : "monthly";
    const exportFmt = req.nextUrl.searchParams.get("export"); // sales | zoho

    if (exportFmt === "sales" || exportFmt === "tally" || exportFmt === "csv") {
      const invoices = await queryRows<{
        id: string;
        number: string;
        issue_date: string;
        customer_name: string;
        customer_gstin: string | null;
        taxable_amount: string | number;
        cgst_amount: string | number;
        sgst_amount: string | number;
        igst_amount: string | number;
        total_amount: string | number;
        status: string;
      }>(
        `SELECT id, number, issue_date::text, customer_name, customer_gstin,
                taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, status::text
           FROM sp_list_invoices(
             $1, $2::period_filter, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 500, 0
           ) AS i
          WHERE i.status <> 'cancelled'`,
        [session.ownerId, period]
      );

      const title = `Quill SALES REGISTER (${period.toUpperCase()})`;
      const csv = buildSalesRegisterCsv(
        invoices.map((r) => ({
          issueDate: r.issue_date,
          invoiceNumber: r.number,
          customerName: r.customer_name,
          customerGstin: r.customer_gstin,
          taxable: Number(r.taxable_amount || 0),
          cgst: Number(r.cgst_amount || 0),
          sgst: Number(r.sgst_amount || 0),
          igst: Number(r.igst_amount || 0),
          total: Number(r.total_amount || 0),
        })),
        { title }
      );

      const ids = invoices.map((i) => i.id);
      if (ids.length) {
        await query(
          `UPDATE invoices SET books_synced_to = 'tally'::books_target, books_synced_at = NOW()
            WHERE owner_id = $1 AND id = ANY($2::uuid[])`,
          [session.ownerId, ids]
        ).catch(() => null);
      }

      return new NextResponse(csv, {
        status: 200,
        headers: {
          ...SECURITY_HEADERS,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="Sales-Register-${period}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (exportFmt === "zoho") {
      const invoices = await queryRows<{
        id: string;
        number: string;
        issue_date: string;
        customer_name: string;
        customer_gstin: string | null;
        taxable_amount: string | number;
        cgst_amount: string | number;
        sgst_amount: string | number;
        igst_amount: string | number;
      }>(
        `SELECT id, number, issue_date::text, customer_name, customer_gstin,
                taxable_amount, cgst_amount, sgst_amount, igst_amount
           FROM sp_list_invoices(
             $1, $2::period_filter, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 500, 0
           )`,
        [session.ownerId, period]
      );

      // One query for all lines (fast) instead of N+1
      const ids = invoices.map((i) => i.id);
      const allLines = ids.length
        ? await queryRows<{
            invoice_id: string;
            description: string;
            qty: string | number;
            rate: string | number;
            gst_percent: string | number;
          }>(
            `SELECT invoice_id, description, qty, rate, gst_percent
               FROM invoice_lines
              WHERE invoice_id = ANY($1::uuid[])
              ORDER BY invoice_id, line_no`,
            [ids]
          )
        : [];
      const byInv = new Map<string, typeof allLines>();
      for (const l of allLines) {
        const arr = byInv.get(l.invoice_id) || [];
        arr.push(l);
        byInv.set(l.invoice_id, arr);
      }

      const csvRows: Array<{
        invoiceNumber: string;
        invoiceDate: string;
        customerName: string;
        customerGstin?: string;
        itemName: string;
        quantity: number;
        rate: number;
        taxPercent: number;
      }> = [];
      for (const inv of invoices) {
        const lines = byInv.get(inv.id) || [];
        const tax =
          Number(inv.taxable_amount) > 0
            ? +(
                ((Number(inv.cgst_amount) + Number(inv.sgst_amount) + Number(inv.igst_amount)) /
                  Number(inv.taxable_amount)) *
                100
              ).toFixed(2)
            : 18;
        if (!lines.length) {
          csvRows.push({
            invoiceNumber: inv.number,
            invoiceDate: inv.issue_date,
            customerName: inv.customer_name,
            customerGstin: inv.customer_gstin || undefined,
            itemName: "Sales",
            quantity: 1,
            rate: Number(inv.taxable_amount) || 0,
            taxPercent: tax,
          });
        } else {
          for (const l of lines) {
            csvRows.push({
              invoiceNumber: inv.number,
              invoiceDate: inv.issue_date,
              customerName: inv.customer_name,
              customerGstin: inv.customer_gstin || undefined,
              itemName: l.description || "Item",
              quantity: Number(l.qty) || 1,
              rate: Number(l.rate) || 0,
              taxPercent: Number(l.gst_percent) || tax,
            });
          }
        }
      }
      const csv = buildZohoInvoiceCsv(csvRows);
      await query(
        `UPDATE invoices SET books_synced_to = 'zoho'::books_target, books_synced_at = NOW()
          WHERE owner_id = $1 AND id = ANY($2::uuid[])`,
        [session.ownerId, ids]
      ).catch(() => null);

      return new NextResponse(csv, {
        status: 200,
        headers: {
          ...SECURITY_HEADERS,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="Zoho-Books-${period}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const invoices = await queryRows(
      `SELECT * FROM sp_list_invoices(
        $1, $2::period_filter, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 100, 0
      )`,
      [session.ownerId, period]
    );

    return NextResponse.json(
      {
        ok: true,
        period,
        invoices: invoices.map((i) => ({
          id: i.id,
          number: i.number,
          customerName: i.customer_name,
          status: i.status,
          amount: Number(i.total_amount),
          booksSyncedTo: i.books_synced_to || "none",
          moneyReceived: i.money_received,
          journal: journalFromInvoice(i as never),
        })),
      },
      {
        status: 200,
        headers: {
          ...SECURITY_HEADERS,
          "Cache-Control": "private, max-age=15",
        },
      }
    );
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: "Books failed" }, 500);
  }
}

/** Mark period exported (optional) — downloads happen via GET ?export= */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "books");
    const body = await req.json().catch(() => ({}));
    const period = PERIODS.has(body.period) ? body.period : "monthly";
    const target = body.target === "zoho" ? "zoho" : "tally";
    return json({
      ok: true,
      download:
        target === "zoho"
          ? `/api/books?export=zoho&period=${period}`
          : `/api/books?export=sales&period=${period}`,
      message:
        target === "zoho"
          ? `Zoho CSV for ${period} ready`
          : `Sales register CSV for ${period} ready (same columns as your Excel sales sheet)`,
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    return json({ ok: false, error: "Failed" }, 400);
  }
}
