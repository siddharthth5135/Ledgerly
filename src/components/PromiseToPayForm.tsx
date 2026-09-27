"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PromiseToPayForm({
  invoiceId,
  initialDate,
  initialNote,
}: {
  invoiceId: string;
  initialDate?: string | null;
  initialNote?: string | null;
}) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate?.slice(0, 10) || "");
  const [note, setNote] = useState(initialNote || "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          promiseToPayDate: date || null,
          promiseNote: note || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error || "Failed");
        return;
      }
      setMsg(date ? `Promise saved · ${date}` : "Promise cleared");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-[var(--ink)]">Promise to pay</p>
      <p className="text-xs text-[var(--muted)]">Customer said they’ll pay on this date — we pause firm chase until then.</p>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="w-full rounded-xl bg-[var(--ink)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save promise"}
      </button>
      {msg && <p className="text-xs text-[var(--ok)]">{msg}</p>}
    </div>
  );
}
