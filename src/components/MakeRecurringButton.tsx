"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MakeRecurringButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromInvoiceId: invoiceId, cadence: "monthly" }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error || "Failed");
        return;
      }
      router.push("/recurring");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={create}
        className="w-full rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Creating…" : "Make monthly recurring"}
      </button>
      {msg && <p className="mt-1 text-xs text-[var(--danger)]">{msg}</p>}
    </div>
  );
}
