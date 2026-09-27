"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CollectionRemindButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("Remind");

  async function remind() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remind", channel: "whatsapp" }),
      });
      const data = await res.json();
      setLabel(data.ok ? "Sent" : "Retry");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={remind}
      className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
    >
      {busy ? "…" : label}
    </button>
  );
}
