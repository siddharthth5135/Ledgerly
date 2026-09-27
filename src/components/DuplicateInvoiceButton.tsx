"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DuplicateInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function duplicate() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErr(data.error || "Duplicate failed");
        return;
      }
      const id = data.invoice?.id || data.invoice?.invoice_id;
      if (id) router.push(`/invoices/${id}`);
      else router.push("/invoices");
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={duplicate}
        disabled={busy}
        className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Duplicating…" : "Duplicate as draft"}
      </button>
      {err && <p className="mt-1 text-xs text-[var(--danger)]">{err}</p>}
    </div>
  );
}
