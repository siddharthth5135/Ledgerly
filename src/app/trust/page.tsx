"use client";

import { FormEvent, useMemo, useState } from "react";
import { AppShell } from "@/components/SiteChrome";
import { searchSuppliers } from "@/lib/suppliers";
import { Pill } from "@/components/Pill";
import { statusColor } from "@/lib/format";

export default function TrustPage() {
  const [q, setQ] = useState("");
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<{
    matched: boolean;
    name: string;
    gstin?: string | null;
    pan?: string | null;
    cin?: string | null;
    trustScore: number;
    fraudScore: number;
    riskLevel: string;
    badge?: string;
    flags?: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => searchSuppliers(q), [q]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/trust/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gstin: gstin || undefined,
          pan: pan || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Verify failed");
        return;
      }
      setReport(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="Supplier Trust"
      subtitle="Know before you pay — GST + PAN checks and AI fraud scores inside your invoice workflow."
    >
      <form
        onSubmit={verify}
        className="grid gap-3 rounded-3xl border border-[var(--line)] bg-white p-5 sm:grid-cols-[1fr_1fr_auto]"
      >
        <input
          value={gstin}
          onChange={(e) => setGstin(e.target.value.toUpperCase().slice(0, 15))}
          placeholder="GSTIN e.g. 27AABCA1234D1Z5"
          maxLength={15}
          className="rounded-xl border border-[var(--line)] px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
        />
        <input
          value={pan}
          onChange={(e) => setPan(e.target.value.toUpperCase().slice(0, 10))}
          placeholder="PAN (optional) e.g. AABCA1234D"
          maxLength={10}
          className="rounded-xl border border-[var(--line)] px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
        />
        <button
          type="submit"
          disabled={loading || (!gstin && !pan)}
          className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Checking…" : "Verify"}
        </button>
      </form>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Demo: trusted <button type="button" className="font-mono text-[var(--brand)] underline" onClick={() => { setGstin("27AABCA1234D1Z5"); setPan("AABCA1234D"); }}>27AABCA1234D1Z5</button>
        {" · "}
        flagged <button type="button" className="font-mono text-[var(--brand)] underline" onClick={() => { setGstin("09AAGCS9988K1Z2"); setPan(""); }}>09AAGCS9988K1Z2</button>
      </p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {report && (
        <div className="mt-4 rounded-3xl border border-[var(--line)] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl font-semibold">{report.name}</p>
              <p className="font-mono text-xs text-[var(--muted)]">
                {report.gstin || "—"} · PAN {report.pan || "—"} · CIN {report.cin || "—"}
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                {report.matched ? "Matched network profile" : "Unmatched entity score"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-3xl font-semibold text-[var(--brand)]">
                {report.trustScore}
              </p>
              <Pill tone={statusColor(report.riskLevel)}>{report.riskLevel}</Pill>
            </div>
          </div>
          {report.flags && report.flags.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-sm text-red-800">
              {report.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-8">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search directory…"
          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
        />
        <ul className="mt-4 divide-y divide-[var(--line)] rounded-3xl border border-[var(--line)] bg-white">
          {list.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium">{s.tradeName}</p>
                <p className="text-xs text-[var(--muted)]">
                  {s.category} · {s.city} · {s.gstin}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-semibold text-[var(--brand)]">
                  {s.trustScore}
                </span>
                <Pill tone={statusColor(s.status)}>{s.status}</Pill>
                <Pill tone={statusColor(s.riskLevel)}>{s.riskLevel}</Pill>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
