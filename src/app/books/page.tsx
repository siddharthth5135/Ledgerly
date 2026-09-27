"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/SiteChrome";
import { Pill, StatusPill } from "@/components/Pill";
import { inrExact } from "@/lib/format";

type Row = {
  id: string;
  number: string;
  customerName: string;
  status: string;
  amount: number;
  booksSyncedTo: string;
  journal: Array<{ account: string; debit: number; credit: number }>;
};

const PERIODS = ["weekly", "monthly", "quarterly", "yearly"] as const;

export default function BooksPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("monthly");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/books?period=${period}`);
    const data = await res.json();
    if (!data.ok) {
      setError(data.error || "Failed to load");
      return;
    }
    setError(null);
    setRows(data.invoices || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function download(kind: "sales" | "zoho") {
    setNote(
      kind === "sales"
        ? `Downloading ${period} sales CSV (DATE · INV · COMPANY · GST · TAXABLE · CGST · SGST · IGST · TOTAL)…`
        : `Downloading ${period} Zoho Books CSV…`
    );
    window.location.href = `/api/books?export=${kind}&period=${period}`;
  }

  return (
    <AppShell
      title="Books Bridge"
      subtitle="Download one clean sales CSV for the whole period — weekly, monthly, quarterly or yearly. Give it to your CA / import to Tally or Zoho."
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${
              period === p ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mb-8 flex flex-wrap gap-3 rounded-2xl border border-[var(--line)] bg-white p-5">
        <button
          type="button"
          onClick={() => download("sales")}
          className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Download sales CSV ({period})
        </button>
        <button
          type="button"
          onClick={() => download("zoho")}
          className="rounded-full border border-[var(--line)] px-5 py-2.5 text-sm font-semibold"
        >
          Download Zoho CSV ({period})
        </button>
        <p className="w-full text-xs text-[var(--muted)]">
          Sales CSV matches your Excel register style (Design Comprint): one row per invoice for the
          selected period — not per single bill.
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {note && <p className="mb-4 text-sm text-[var(--ok)]">{note}</p>}

      <div className="space-y-4">
        <p className="text-sm font-semibold text-[var(--muted)]">
          Preview · {rows.length} invoice{rows.length === 1 ? "" : "s"} in this period
        </p>
        {rows.map((r) => (
          <section key={r.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link
                  href={`/invoices/${r.id}`}
                  className="font-display text-lg font-semibold text-[var(--brand)]"
                >
                  {r.number}
                </Link>
                <p className="text-sm text-[var(--muted)]">
                  {r.customerName} · {inrExact(r.amount)}
                </p>
                <div className="mt-2 flex gap-2">
                  <StatusPill status={r.status} />
                  <Pill>
                    {r.booksSyncedTo === "none" ? "Not exported yet" : `Exported → ${r.booksSyncedTo}`}
                  </Pill>
                </div>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
              {r.journal.map((j) => (
                <li key={j.account} className="flex justify-between border-t border-[var(--line)] pt-1">
                  <span>{j.account}</span>
                  <span className="font-mono">
                    Dr {inrExact(j.debit)} · Cr {inrExact(j.credit)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {rows.length === 0 && (
          <p className="rounded-2xl border border-[var(--line)] bg-white px-5 py-10 text-center text-[var(--muted)]">
            No invoices in this period
          </p>
        )}
      </div>
    </AppShell>
  );
}
