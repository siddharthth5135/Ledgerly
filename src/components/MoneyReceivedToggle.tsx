"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MoneyReceivedToggle({
  invoiceId,
  initial,
}: {
  invoiceId: string;
  initial: boolean;
}) {
  const [checked, setChecked] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onChange(next: boolean) {
    setBusy(true);
    setChecked(next);
    try {
      await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moneyReceived: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex items-center gap-3 text-sm font-medium">
      <input
        type="checkbox"
        checked={checked}
        disabled={busy}
        onChange={(e) => onChange(e.target.checked)}
      />
      Money received
    </label>
  );
}
