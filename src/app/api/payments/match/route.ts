import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession, requirePermission } from "@/lib/auth";
import { query, queryRows } from "@/lib/db";
import { SECURITY_HEADERS } from "@/lib/security";
import { parsePaymentCsv, suggestPaymentMatches } from "@/lib/payment-csv";
import { spSetMoneyReceived } from "@/lib/sp";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

/** POST { csvText } → match suggestions against unpaid invoices */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "collections");

    const body = await req.json();
    const csvText = String(body.csvText || "");
    if (csvText.trim().length < 10) {
      return json({ ok: false, error: "Paste a bank/UPI CSV export (header + rows)" }, 400);
    }

    const txns = parsePaymentCsv(csvText);
    if (!txns.length) {
      return json({
        ok: false,
        error: "No credit rows found. Export CSV with Date, Credit/Amount, Narration columns.",
      }, 400);
    }

    const bills = await queryRows<{
      id: string;
      number: string;
      customer_name: string;
      total_amount: string | number;
      amount_received: string | number;
      due_date: string;
    }>(
      `SELECT id, number, customer_name, total_amount, amount_received, due_date::text
         FROM invoices
        WHERE owner_id = $1
          AND status <> 'cancelled'
          AND money_received = FALSE
          AND (total_amount - COALESCE(amount_received, 0)) > 0.5
        ORDER BY due_date ASC
        LIMIT 300`,
      [session.ownerId]
    );

    const unpaid = bills.map((b) => ({
      id: b.id,
      number: b.number,
      customer_name: b.customer_name,
      balance: Math.max(0, Number(b.total_amount) - Number(b.amount_received || 0)),
      due_date: b.due_date,
    }));

    const suggestions = suggestPaymentMatches(txns, unpaid);

    // Persist lightly for audit — skip bad dates
    for (const s of suggestions.slice(0, 100)) {
      let txnDate: string | null = null;
      const iso = s.txn.date.match(/(\d{4})-(\d{2})-(\d{2})/);
      const dmy = s.txn.date.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
      if (iso) txnDate = `${iso[1]}-${iso[2]}-${iso[3]}`;
      else if (dmy) txnDate = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
      await query(
        `INSERT INTO payment_matches (owner_id, invoice_id, txn_date, amount, reference, counterparty, source_row, matched)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, FALSE)`,
        [
          session.ownerId,
          s.invoiceId,
          txnDate,
          s.txn.amount,
          s.txn.reference?.slice(0, 500) || null,
          s.txn.counterparty?.slice(0, 200) || null,
          s.txn.raw?.slice(0, 800) || null,
        ]
      ).catch(() => null);
    }

    return json({
      ok: true,
      txnCount: txns.length,
      unpaidCount: unpaid.length,
      suggestions,
      tip: "Confirm high-confidence matches — we mark invoices paid. Low confidence: pick invoice manually.",
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: "Match failed" }, 500);
  }
}

/** PUT { matches: [{ invoiceId, amount, reference }] } → mark paid */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "collections");

    const body = await req.json();
    const matches = Array.isArray(body.matches) ? body.matches : [];
    if (!matches.length) return json({ ok: false, error: "matches required" }, 400);

    let applied = 0;
    for (const m of matches) {
      const invoiceId = String(m.invoiceId || "");
      if (!invoiceId) continue;
      const amount = Number(m.amount);
      await spSetMoneyReceived(
        session.ownerId,
        invoiceId,
        session.userId,
        true,
        Number.isFinite(amount) ? amount : null
      );
      await query(
        `UPDATE payment_matches SET matched = TRUE, invoice_id = $2
          WHERE id = (
            SELECT id FROM payment_matches
             WHERE owner_id = $1 AND matched = FALSE AND amount = $3
               AND (invoice_id IS NULL OR invoice_id = $2)
             ORDER BY created_at DESC LIMIT 1
          )`,
        [session.ownerId, invoiceId, Number.isFinite(amount) ? amount : 0]
      ).catch(() => null);
      applied++;
    }

    return json({ ok: true, applied });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Apply failed" }, 400);
  }
}
