"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ApproveRecurringDraft({
  invoiceId,
  isDraft,
  isRecurringDraft,
}: {
  invoiceId: string;
  isDraft: boolean;
  isRecurringDraft: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!isDraft || !isRecurringDraft) return null;

  async function act(action: "approve" | "reject_draft") {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error || "Failed");
        return;
      }
      setMsg(data.message || "Done");
      router.refresh();
      if (action === "reject_draft") router.push("/invoices");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-2">
      <p className="text-sm font-semibold text-amber-900">Recurring draft — needs your OK</p>
      <p className="text-xs text-amber-800/80">
        Auto-generated from a schedule. Approve to send, or discard. You stay in control.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => act("approve")}
          className="rounded-full bg-amber-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Approve &amp; send
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act("reject_draft")}
          className="rounded-full border border-amber-400 px-4 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"
        >
          Discard draft
        </button>
      </div>
      {msg && <p className="text-xs text-amber-900">{msg}</p>}
    </div>
  );
}
