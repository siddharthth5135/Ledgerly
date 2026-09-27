"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/SiteChrome";
import { StatusPill } from "@/components/Pill";
import { inr } from "@/lib/format";

type Summary = {
  business_total: string | number;
  money_received: string | number;
  money_not_received: string | number;
  outstanding_count: string | number;
  overdue_amount: string | number;
  overdue_count: string | number;
  pending_reminders: string | number;
};

type Risk = { score: number; label: "low" | "medium" | "high"; tip: string };

type Inv = {
  id: string;
  number: string;
  customer_name: string;
  customer_phone: string | null;
  due_date: string;
  total_amount: string | number;
  amount_received: string | number;
  status: string;
  money_received: boolean;
  razorpay_link: string | null;
  daysLate?: number;
  amountDue?: number;
  risk?: Risk;
  promise_to_pay_date?: string | null;
  promiseFollowUp?: { kind: string; tip: string } | null;
};

type MatchRow = {
  txn: { date: string; amount: number; reference: string; counterparty: string };
  invoiceId: string | null;
  invoiceNumber: string | null;
  confidence: number;
  reason: string;
};

const PERIODS = ["weekly", "monthly", "quarterly", "yearly"] as const;

export default function CollectionsPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("monthly");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [modal, setModal] = useState<Inv | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"polite" | "firm" | "final">("polite");
  const [lang, setLang] = useState<"en" | "hi" | "gu">("en");
  const [whenToCall, setWhenToCall] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [promiseDate, setPromiseDate] = useState("");
  const [csvText, setCsvText] = useState("");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [showMatch, setShowMatch] = useState(false);

  async function load() {
    const res = await fetch(`/api/collections?period=${period}`);
    const data = await res.json();
    if (data.ok) {
      setSummary(data.summary);
      setInvoices(data.invoices || []);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function openRemind(inv: Inv, t?: "polite" | "firm" | "final") {
    setModal(inv);
    setNote(null);
    setPromiseDate(inv.promise_to_pay_date?.slice(0, 10) || "");
    const nextTone =
      t ||
      (inv.promiseFollowUp?.kind === "broken"
        ? "firm"
        : inv.risk?.label === "high"
          ? "final"
          : inv.risk?.label === "medium"
            ? "firm"
            : "polite");
    setTone(nextTone);
    const res = await fetch(
      `/api/collections?previewMessageFor=${inv.id}&tone=${nextTone}&lang=${lang}`
    );
    const data = await res.json();
    setMessage(data.message || "");
    setWhenToCall(data.whenToCall || "");
    if (data.tone) setTone(data.tone);
  }

  async function refreshDraft(nextTone: "polite" | "firm" | "final", nextLang: "en" | "hi" | "gu") {
    if (!modal) return;
    setTone(nextTone);
    setLang(nextLang);
    const res = await fetch(
      `/api/collections?previewMessageFor=${modal.id}&tone=${nextTone}&lang=${nextLang}`
    );
    const data = await res.json();
    setMessage(data.message || "");
    setWhenToCall(data.whenToCall || "");
  }

  async function savePromise() {
    if (!modal) return;
    setBusy(true);
    try {
      const res = await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: modal.id, promiseToPayDate: promiseDate || null }),
      });
      const data = await res.json();
      if (!data.ok) {
        setNote(data.error || "Failed");
        return;
      }
      setNote(promiseDate ? `Promise saved: ${promiseDate}` : "Promise cleared");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function sendRemind() {
    if (!modal) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: modal.id, message }),
      });
      const data = await res.json();
      if (!data.ok) {
        setNote(data.error || "Failed");
        return;
      }
      const phone = (modal.customer_phone || "").replace(/\D/g, "");
      const wa = phone
        ? `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(wa, "_blank", "noopener");
      setNote(data.note || "WhatsApp reminder opened");
      setModal(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function runMatch() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/payments/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });
      const data = await res.json();
      if (!data.ok) {
        setNote(data.error || "Match failed");
        return;
      }
      setMatches(data.suggestions || []);
      setNote(data.tip || `Matched ${data.txnCount} rows`);
    } finally {
      setBusy(false);
    }
  }

  async function applyMatches() {
    const selected = matches.filter((m) => m.invoiceId && m.confidence >= 0.55);
    if (!selected.length) {
      setNote("No high-confidence matches to apply");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/payments/match", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matches: selected.map((m) => ({
            invoiceId: m.invoiceId,
            amount: m.txn.amount,
            reference: m.txn.reference,
          })),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setNote(data.error || "Apply failed");
        return;
      }
      setNote(`Marked ${data.applied} invoices paid`);
      setMatches([]);
      setCsvText("");
      setShowMatch(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  const riskColor = { high: "text-[var(--danger)]", medium: "text-[var(--warn)]", low: "text-[var(--ok)]" };

  return (
    <AppShell
      title="Collections"
      subtitle="Copilot + promise-to-pay + bank CSV match — recover cash without hiring a clerk."
    >
      <div className="mb-6 flex flex-wrap gap-1.5 rounded-full border border-[var(--line)] bg-white p-1 w-fit shadow-[var(--shadow-sm)]">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${
              period === p ? "bg-[var(--ink)] text-white" : "text-[var(--muted)]"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowMatch((v) => !v)}
          className="rounded-full px-4 py-1.5 text-sm font-semibold text-[var(--brand)]"
        >
          Match UPI/bank CSV
        </button>
      </div>

      {showMatch && (
        <div className="mb-6 space-y-3 rounded-2xl border border-[var(--line)] bg-white p-4">
          <p className="text-sm text-[var(--muted)]">
            Paste PhonePe / GPay / bank credit CSV. We suggest invoice matches by amount + name (like Zoho/Tally bank recon — simpler).
          </p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            placeholder="Date,Narration,Credit&#10;01/09/2026,UPI/SHARMA TRADERS,12500"
            className="w-full rounded-xl border border-[var(--line)] p-3 font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || csvText.trim().length < 10}
              onClick={runMatch}
              className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Suggest matches
            </button>
            {matches.some((m) => m.invoiceId) && (
              <button
                type="button"
                disabled={busy}
                onClick={applyMatches}
                className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Mark matched as paid
              </button>
            )}
          </div>
          {matches.length > 0 && (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {matches.slice(0, 40).map((m, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    ₹{m.txn.amount.toLocaleString("en-IN")} · {m.txn.counterparty || m.txn.reference.slice(0, 40)}
                  </span>
                  <span className={m.invoiceId ? "text-[var(--ok)]" : "text-[var(--muted)]"}>
                    {m.invoiceNumber || "—"} ({Math.round(m.confidence * 100)}%) · {m.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { l: "Business done", v: inr(Number(summary.business_total)) },
            { l: "Money received", v: inr(Number(summary.money_received)) },
            { l: "Not received", v: inr(Number(summary.money_not_received)) },
            { l: "Overdue amount", v: inr(Number(summary.overdue_amount)) },
          ].map((x) => (
            <div key={x.l} className="surface-card p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{x.l}</p>
              <p className="mt-1 font-display text-2xl font-semibold">{x.v}</p>
            </div>
          ))}
        </div>
      )}

      {note && !modal && <p className="mt-4 text-sm text-[var(--ok)]">{note}</p>}

      <ul className="mt-8 divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-sm)]">
        {invoices.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <Link href={`/invoices/${r.id}`} className="font-semibold text-[var(--brand)]">
                {r.number}
              </Link>
              <p className="text-sm text-[var(--muted)]">
                {r.customer_name} · due {String(r.due_date).slice(0, 10)}
                {typeof r.daysLate === "number" && r.daysLate > 0 ? ` · ${r.daysLate}d late` : ""}
              </p>
              {r.promiseFollowUp && (
                <p className="mt-1 text-xs text-[var(--warn)]">{r.promiseFollowUp.tip}</p>
              )}
              {r.risk && (
                <p className={`mt-1 text-xs font-semibold ${riskColor[r.risk.label]}`}>
                  Risk {r.risk.label} ({r.risk.score}) — {r.risk.tip}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold tabular-nums">{inr(Number(r.amountDue ?? r.total_amount))}</span>
              <StatusPill status={r.status} />
              {!r.money_received && (
                <button
                  type="button"
                  onClick={() => openRemind(r)}
                  className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Copilot remind
                </button>
              )}
            </div>
          </li>
        ))}
        {invoices.length === 0 && (
          <li className="px-5 py-8 text-center text-[var(--muted)]">No unpaid invoices in this period</li>
        )}
      </ul>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-display text-xl font-semibold">Collections copilot</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {modal.number} · {modal.customer_name}
              {modal.customer_phone ? ` · ${modal.customer_phone}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-[var(--surface)] p-3">
              <label className="text-xs">
                Promise to pay
                <input
                  type="date"
                  value={promiseDate}
                  onChange={(e) => setPromiseDate(e.target.value)}
                  className="mt-1 block rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={savePromise}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold"
              >
                Save promise
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["polite", "firm", "final"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => refreshDraft(t, lang)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                    tone === t ? "bg-[var(--ink)] text-white" : "border border-[var(--line)]"
                  }`}
                >
                  {t}
                </button>
              ))}
              {(["en", "hi", "gu"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => refreshDraft(tone, l)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                    lang === l ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "border border-[var(--line)]"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {whenToCall && (
              <p className="mt-3 rounded-xl bg-[var(--warn-soft)] px-3 py-2 text-xs text-[var(--warn)]">{whenToCall}</p>
            )}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={12}
              className="mt-4 w-full rounded-2xl border border-[var(--line)] p-3 font-mono text-xs leading-relaxed"
            />
            {note && <p className="mt-2 text-sm text-[var(--danger)]">{note}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setModal(null)} className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={sendRemind}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Opening…" : "Open WhatsApp"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
