"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Invoice } from "@/lib/types";
import { whatsappShareUrl } from "@/lib/whatsapp";
import { calcInvoiceTotals } from "@/lib/invoice-ai";

export function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = calcInvoiceTotals(invoice.lines, invoice.customerGstin).total;
  const waUrl = whatsappShareUrl(invoice, amount);

  async function act(action: string, extra?: Record<string, string>) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMsg(data.error || "Action failed");
        return;
      }
      setMsg(data.message || "Done");
      router.refresh();
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-[var(--line)] bg-white p-5">
      <h2 className="font-display text-lg font-semibold">Actions</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/invoices/${invoice.id}/print`}
          className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white"
        >
          Print / PDF
        </Link>
        <a
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-[#128C7E] px-3 py-1.5 text-xs font-semibold text-white"
        >
          Send on WhatsApp
        </a>
        {invoice.status !== "paid" && invoice.status !== "cancelled" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("mark_paid")}
            className="rounded-full bg-[var(--ok)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Mark paid
          </button>
        )}
        {invoice.status !== "paid" && invoice.status !== "cancelled" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("cancel")}
            className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-800 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        {invoice.status !== "paid" && invoice.status !== "cancelled" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("remind", { channel: "whatsapp" })}
            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Log WA reminder
          </button>
        )}
        {invoice.status !== "paid" && invoice.status !== "cancelled" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("remind", { channel: "email" })}
            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Log email reminder
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => act("sync_books", { target: "tally" })}
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Sync Tally
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act("sync_books", { target: "zoho" })}
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Sync Zoho
        </button>
      </div>
      {msg && <p className="mt-3 text-sm text-[var(--muted)]">{msg}</p>}
    </section>
  );
}
