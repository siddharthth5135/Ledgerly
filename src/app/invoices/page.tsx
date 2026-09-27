"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/SiteChrome";
import { inr } from "@/lib/format";
import { StatusPill, Pill } from "@/components/Pill";

type Inv = {
  id: string;
  number: string;
  customer_name: string;
  source: string;
  due_date: string;
  issue_date: string;
  total_amount: string | number;
  status: string;
  money_received: boolean;
  notes?: string | null;
  field_values?: Record<string, unknown> | null;
};

const PERIODS = ["weekly", "monthly", "quarterly", "yearly"] as const;

export default function InvoicesPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("monthly");
  const [search, setSearch] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [moneyReceived, setMoneyReceived] = useState<"" | "true" | "false">("");
  const [status, setStatus] = useState("");
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ period });
    if (search.trim()) q.set("search", search.trim());
    if (amountMin) q.set("amountMin", amountMin);
    if (amountMax) q.set("amountMax", amountMax);
    if (moneyReceived) q.set("moneyReceived", moneyReceived);
    if (status) q.set("status", status);
    const res = await fetch(`/api/invoices?${q}`);
    const data = await res.json();
    if (!data.ok) {
      setError(data.error || "Failed");
      return;
    }
    setError(null);
    setInvoices(data.invoices || []);
  }, [period, search, amountMin, amountMax, moneyReceived, status]);

  // Period / status changes load immediately; typing search waits for Apply (fast)
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, status, moneyReceived]);

  async function toggleMoney(id: string, next: boolean) {
    await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moneyReceived: next }),
    });
    load();
  }

  async function approveDraft(id: string) {
    await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    load();
  }

  function isRecurringDraft(inv: Inv) {
    if (inv.status !== "draft") return false;
    const fv = inv.field_values;
    if (fv && typeof fv === "object" && (fv as { __recurring_draft?: boolean }).__recurring_draft) {
      return true;
    }
    return String(inv.notes || "").toLowerCase().includes("recurring draft");
  }

  return (
    <AppShell
      title="Invoices"
      subtitle="All generated bills — recurring drafts glow amber until you approve."
    >
      <div className="mb-6 space-y-3 rounded-3xl border border-[var(--line)] bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                period === p ? "bg-[var(--brand)] text-white" : "border border-[var(--line)]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, INV#, phone, GSTIN"
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm lg:col-span-2"
          />
          <input
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            placeholder="Amount from"
            type="number"
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          />
          <input
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            placeholder="Amount to"
            type="number"
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          />
          <select
            value={moneyReceived}
            onChange={(e) => setMoneyReceived(e.target.value as "" | "true" | "false")}
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          >
            <option value="">Money: all</option>
            <option value="true">Received</option>
            <option value="false">Not received</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          >
            <option value="">Status: all</option>
            <option value="draft">draft</option>
            <option value="sent">sent</option>
            <option value="paid">paid</option>
            <option value="overdue">overdue</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={load}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
          >
            Apply filters
          </button>
          <Link
            href="/invoices/manual"
            className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold"
          >
            + Quick bill
          </Link>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-3xl border border-[var(--line)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--bg)] text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Issue</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Money received</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const pending = isRecurringDraft(inv);
              return (
              <tr
                key={inv.id}
                className={`border-b border-[var(--line)] last:border-0 ${
                  pending ? "bg-amber-50" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <Link href={`/invoices/${inv.id}`} className="font-semibold text-[var(--brand)]">
                    {inv.number}
                  </Link>
                  {pending && (
                    <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                      Needs OK
                    </span>
                  )}
                  <Link
                    href={`/invoices/${inv.id}/print`}
                    className="ml-2 text-xs text-[var(--muted)] underline"
                  >
                    Print
                  </Link>
                </td>
                <td className="px-4 py-3">{inv.customer_name}</td>
                <td className="px-4 py-3 font-mono text-xs">{String(inv.issue_date).slice(0, 10)}</td>
                <td className="px-4 py-3 font-mono text-xs">{String(inv.due_date).slice(0, 10)}</td>
                <td className="px-4 py-3 font-semibold">{inr(Number(inv.total_amount))}</td>
                <td className="px-4 py-3">
                  <StatusPill status={inv.status} />
                  {pending ? (
                    <button
                      type="button"
                      onClick={() => approveDraft(inv.id)}
                      className="ml-2 rounded-full bg-amber-800 px-2 py-0.5 text-[10px] font-semibold text-white"
                    >
                      Approve
                    </button>
                  ) : (
                    <span className="ml-1 text-xs capitalize text-[var(--muted)]">{inv.source}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(inv.money_received)}
                      onChange={(e) => toggleMoney(inv.id, e.target.checked)}
                    />
                    {inv.money_received ? (
                      <Pill>Yes</Pill>
                    ) : (
                      <span className="text-[var(--muted)]">No</span>
                    )}
                  </label>
                </td>
              </tr>
            );})}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[var(--muted)]">
                  No invoices for these filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
