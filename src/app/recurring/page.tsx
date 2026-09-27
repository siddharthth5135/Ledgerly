"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/SiteChrome";

type Row = {
  id: string;
  title: string;
  customer_name: string;
  cadence: string;
  next_run_date: string;
  is_active: boolean;
  due_days: number;
};

export default function RecurringPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromInvoiceId, setFromInvoiceId] = useState("");
  const [cadence, setCadence] = useState("monthly");

  async function load() {
    const res = await fetch("/api/recurring");
    const data = await res.json();
    if (data.ok) setRows(data.recurring || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createFromInvoice(e: FormEvent) {
    e.preventDefault();
    if (!fromInvoiceId.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromInvoiceId: fromInvoiceId.trim(), cadence }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error || "Failed");
        return;
      }
      setMsg("Recurring schedule created");
      setFromInvoiceId("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function runDue() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/recurring", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error || "Failed");
        return;
      }
      setMsg(`Prepared ${data.generated || 0} draft(s) — approve on Invoices (amber rows)`);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, isActive: boolean) {
    await fetch("/api/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive }),
    });
    load();
  }

  async function runOne(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      setMsg(data.ok ? `Prepared ${data.generated || 0} draft(s)` : data.error);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Recurring bills"
      subtitle="AMCs & retainers — we prepare a draft on schedule. You approve before it becomes a real bill."
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={runDue}
          className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Prepare due drafts
        </button>
        <Link href="/invoices" className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold">
          Pick invoice id from Invoices
        </Link>
      </div>

      <form onSubmit={createFromInvoice} className="mb-8 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] bg-white p-4">
        <label className="text-sm">
          Invoice id
          <input
            value={fromInvoiceId}
            onChange={(e) => setFromInvoiceId(e.target.value)}
            placeholder="uuid from invoice URL"
            className="mt-1 block w-72 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          Cadence
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            className="mt-1 block rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Create schedule
        </button>
      </form>

      {msg && <p className="mb-4 text-sm text-[var(--ok)]">{msg}</p>}

      <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-semibold">{r.title}</p>
              <p className="text-sm text-[var(--muted)]">
                {r.customer_name} · {r.cadence} · next {String(r.next_run_date).slice(0, 10)} · due +{r.due_days}d
                {!r.is_active ? " · paused" : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => runOne(r.id)}
                className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold"
              >
                Generate draft
              </button>
              <button
                type="button"
                onClick={() => toggle(r.id, !r.is_active)}
                className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold"
              >
                {r.is_active ? "Pause" : "Resume"}
              </button>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-5 py-10 text-center text-[var(--muted)]">
            No recurring schedules yet. Create one from any past invoice.
          </li>
        )}
      </ul>
    </AppShell>
  );
}
