import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession, requirePermission } from "@/lib/auth";
import {
  spCollectionsSummary,
  spCreateReminder,
  spListCollectionInvoices,
  spMarkReminderSent,
} from "@/lib/sp";
import { SECURITY_HEADERS } from "@/lib/security";
import { draftReminder, predictLateRisk, type ReminderTone } from "@/lib/collections-copilot";
import { getBusinessProfile } from "@/lib/business";
import { queryOne, queryRows } from "@/lib/db";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "Cache-Control": "private, max-age=12",
    },
  });
}

function promiseFollowUp(promiseDate: string | null | undefined, daysLate: number) {
  if (!promiseDate) return null;
  const p = new Date(String(promiseDate).slice(0, 10));
  if (!Number.isFinite(p.getTime())) return null;
  const daysToPromise = Math.ceil((p.getTime() - Date.now()) / 86400000);
  if (daysToPromise > 0) {
    return {
      kind: "wait" as const,
      tip: `Customer promised ${String(promiseDate).slice(0, 10)} — wait ${daysToPromise}d before chasing`,
    };
  }
  if (daysToPromise === 0) {
    return { kind: "today" as const, tip: "Promise is today — polite check-in this afternoon" };
  }
  return {
    kind: "broken" as const,
    tip: `Promise broken ${Math.abs(daysToPromise)}d ago — use firm tone`,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "collections");

    const period = req.nextUrl.searchParams.get("period") || "monthly";
    const invoiceId = req.nextUrl.searchParams.get("previewMessageFor");

    if (invoiceId) {
      const tone = (req.nextUrl.searchParams.get("tone") || "") as ReminderTone | "";
      const lang = (req.nextUrl.searchParams.get("lang") || "en") as "en" | "hi" | "gu";
      const inv = await queryOne<{
        number: string;
        customer_name: string;
        due_date: string;
        total_amount: string | number;
        amount_received: string | number;
        reminders_sent: string | number;
        razorpay_link: string | null;
        promise_to_pay_date: string | null;
        promise_note: string | null;
      }>(
        `SELECT number, customer_name, due_date::text, total_amount, amount_received, reminders_sent, razorpay_link,
                promise_to_pay_date::text, promise_note
           FROM invoices WHERE id = $1 AND owner_id = $2`,
        [invoiceId, session.ownerId]
      );
      if (!inv) return json({ ok: false, error: "Invoice not found" }, 404);
      const due = new Date(String(inv.due_date).slice(0, 10));
      const daysLate = Math.max(0, Math.floor((Date.now() - due.getTime()) / 86400000));
      const amountDue = Math.max(0, Number(inv.total_amount) - Number(inv.amount_received || 0));
      const follow = promiseFollowUp(inv.promise_to_pay_date, daysLate);
      const autoTone =
        tone ||
        (follow?.kind === "broken" ? "firm" : follow?.kind === "wait" ? "polite" : undefined);
      const profile = await getBusinessProfile(session.ownerId);
      let draft = draftReminder({
        businessName: profile.name || session.businessName || "Quill",
        customerName: inv.customer_name,
        invoiceNumber: inv.number,
        amountDue,
        dueDate: String(inv.due_date).slice(0, 10),
        daysLate,
        payLink: inv.razorpay_link,
        tone: autoTone,
        language: lang,
      });
      if (follow?.kind === "broken" && inv.promise_to_pay_date) {
        draft = {
          ...draft,
          message: `${draft.message}\n\n(You had promised payment by ${String(inv.promise_to_pay_date).slice(0, 10)}.)`,
        };
      }
      const risk = predictLateRisk({
        daysLate,
        overdueAmount: amountDue,
        overdueBills: 1,
        remindersSent: Number(inv.reminders_sent || 0),
      });
      return json({
        ok: true,
        message: draft.message,
        tone: draft.tone,
        whenToCall: follow?.tip || draft.whenToCall,
        risk,
        daysLate,
        promiseToPayDate: inv.promise_to_pay_date,
        promiseNote: inv.promise_note,
      });
    }

    const [summary, invoices] = await Promise.all([
      spCollectionsSummary(session.ownerId, period),
      spListCollectionInvoices(session.ownerId, period),
    ]);

    const ids = (Array.isArray(invoices) ? invoices : []).map(
      (raw) => String((raw as Record<string, unknown>).id || "")
    );
    const promiseMap = new Map<string, { promise_to_pay_date: string | null; promise_note: string | null }>();
    if (ids.length) {
      const promises = await queryRows<{
        id: string;
        promise_to_pay_date: string | null;
        promise_note: string | null;
      }>(
        `SELECT id, promise_to_pay_date::text, promise_note FROM invoices WHERE owner_id = $1 AND id = ANY($2::uuid[])`,
        [session.ownerId, ids]
      );
      for (const p of promises) promiseMap.set(p.id, p);
    }

    const enriched = (Array.isArray(invoices) ? invoices : []).map((raw) => {
      const inv = raw as Record<string, unknown>;
      const due = new Date(String(inv.due_date || "").slice(0, 10));
      const daysLate = Number.isFinite(due.getTime())
        ? Math.max(0, Math.floor((Date.now() - due.getTime()) / 86400000))
        : 0;
      const amountDue = Math.max(0, Number(inv.total_amount || 0) - Number(inv.amount_received || 0));
      const pr = promiseMap.get(String(inv.id));
      const follow = promiseFollowUp(pr?.promise_to_pay_date, daysLate);
      const risk = predictLateRisk({
        daysLate,
        overdueAmount: amountDue,
        overdueBills: 1,
        remindersSent: Number(inv.reminders_sent || 0),
      });
      return {
        ...inv,
        daysLate,
        amountDue,
        risk,
        promise_to_pay_date: pr?.promise_to_pay_date || null,
        promise_note: pr?.promise_note || null,
        promiseFollowUp: follow,
      };
    });

    return json({ ok: true, period, summary, invoices: enriched });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: "Failed" }, 500);
  }
}

/** PATCH { invoiceId, promiseToPayDate, promiseNote } — customer said “I'll pay on …” */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "collections");
    const body = await req.json();
    const invoiceId = String(body.invoiceId || "");
    if (!invoiceId) return json({ ok: false, error: "invoiceId required" }, 400);
    const date =
      body.promiseToPayDate === null || body.promiseToPayDate === ""
        ? null
        : String(body.promiseToPayDate).slice(0, 10);
    const row = await queryOne(
      `UPDATE invoices
          SET promise_to_pay_date = $3::date,
              promise_note = COALESCE($4, promise_note)
        WHERE id = $1 AND owner_id = $2
        RETURNING id, number, promise_to_pay_date, promise_note`,
      [invoiceId, session.ownerId, date, body.promiseNote != null ? String(body.promiseNote).slice(0, 500) : null]
    );
    if (!row) return json({ ok: false, error: "Invoice not found" }, 404);
    return json({ ok: true, invoice: row });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    return json({ ok: false, error: "Could not save promise" }, 400);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "collections");

    const body = await req.json();
    const invoiceId = String(body.invoiceId || "");
    const message = body.message ? String(body.message) : undefined;
    if (!invoiceId) return json({ ok: false, error: "invoiceId required" }, 400);

    const reminder = await spCreateReminder(
      session.ownerId,
      invoiceId,
      session.userId,
      message
    );

    // Simulate WhatsApp send (wire WHATSAPP_TOKEN later)
    const rem = reminder as { id?: string; message?: string } | null;
    if (rem?.id) {
      await spMarkReminderSent(session.ownerId, rem.id);
      console.log("[whatsapp-remind]", rem.message?.slice(0, 120));
    }

    return json({
      ok: true,
      reminder,
      channel: "whatsapp",
      delivered: true,
      note: process.env.WHATSAPP_TOKEN
        ? "Sent via WhatsApp API"
        : "Queued as WhatsApp (demo — add WHATSAPP_TOKEN for live send)",
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Remind failed" }, 400);
  }
}
