"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/SiteChrome";
import { Pill } from "@/components/Pill";
import { inr, statusColor } from "@/lib/format";

export default function PaySafePage() {
  const [gstin, setGstin] = useState("09AAGCS9988K1Z2");
  const [amount, setAmount] = useState("50000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    matched: boolean;
    name: string;
    trustScore: number;
    fraudScore: number;
    riskLevel: string;
    flags?: string[];
    recommendation: string;
    maxAdvance: number;
  } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/trust/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstin }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Verify failed");
        return;
      }
      const amt = Number(amount) || 0;
      let maxAdvance = 0;
      let recommendation = "";
      if (data.riskLevel === "critical") {
        maxAdvance = 0;
        recommendation = "Do not pay advance. Use COD / LC / escrow only.";
      } else if (data.riskLevel === "high") {
        maxAdvance = Math.round(amt * 0.1);
        recommendation = "Cap advance at 10%. Prefer milestone payments.";
      } else if (data.riskLevel === "medium") {
        maxAdvance = Math.round(amt * 0.2);
        recommendation = "Cap advance at 20%. Collect factory proof first.";
      } else {
        maxAdvance = Math.round(amt * 0.3);
        recommendation = "Safe for up to 30% advance with purchase protection (when live).";
      }
      setResult({
        matched: data.matched,
        name: data.name,
        trustScore: data.trustScore,
        fraudScore: data.fraudScore,
        riskLevel: data.riskLevel,
        flags: data.flags,
        recommendation,
        maxAdvance,
      });
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="Pay Safe"
      subtitle="Before you send an advance to a supplier — trust score + recommended max advance."
    >
      <form
        onSubmit={onSubmit}
        className="grid max-w-xl gap-3 rounded-3xl border border-[var(--line)] bg-white p-5"
      >
        <label className="text-sm font-medium">
          Supplier GSTIN
          <input
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase().slice(0, 15))}
            className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
          />
        </label>
        <label className="text-sm font-medium">
          Order value (₹)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={loading || gstin.length < 15}
          className="rounded-xl bg-[var(--brand)] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Scoring…" : "Check before paying"}
        </button>
      </form>

      {result && (
        <div className="mt-6 max-w-xl rounded-3xl border border-[var(--line)] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl font-semibold">{result.name}</p>
              <Pill tone={statusColor(result.riskLevel)}>{result.riskLevel}</Pill>
            </div>
            <div className="text-right">
              <p className="text-xs text-[var(--muted)]">Trust</p>
              <p className="font-display text-3xl font-semibold text-[var(--brand)]">
                {result.trustScore}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm">{result.recommendation}</p>
          <p className="mt-2 font-display text-2xl font-semibold">
            Max advance: {inr(result.maxAdvance)}
          </p>
          {result.flags && result.flags.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-sm text-red-800">
              {result.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          <Link href="/invoices/new" className="mt-4 inline-block text-sm font-semibold text-[var(--brand)]">
            Create related sales invoice →
          </Link>
        </div>
      )}
    </AppShell>
  );
}
