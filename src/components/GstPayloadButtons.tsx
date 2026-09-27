"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Download JSON or live-submit using THIS business’s Settings → GST API credentials.
 */
export function GstPayloadButtons({
  invoiceId,
  irn,
  ewbNumber,
}: {
  invoiceId: string;
  irn?: string | null;
  ewbNumber?: string | null;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vehicleNo, setVehicleNo] = useState("");

  async function run(kind: "einvoice" | "eway", live: boolean) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          kind,
          live,
          vehicleNo: vehicleNo || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error || "Failed");
        return;
      }
      if (live) {
        setMsg(
          kind === "eway"
            ? `e-Way live: ${data.ewbNumber || "OK"}`
            : `IRN live: ${data.irn || "OK"}`
        );
        return;
      }
      const blob = new Blob([JSON.stringify(data.payload, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download =
        kind === "eway" ? `eway-${invoiceId.slice(0, 8)}.json` : `einvoice-${invoiceId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg(data.note || "Downloaded");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-[var(--ink)]">Govt GST (your business login)</p>
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        Uses credentials from{" "}
        <Link href="/settings#gst-api" className="text-[var(--brand)] underline">
          Settings → GST API
        </Link>
        . Each Quill customer has their own connection.
      </p>
      {(irn || ewbNumber) && (
        <div className="rounded-xl bg-[var(--ok)]/10 px-3 py-2 text-xs text-[var(--ok)]">
          {irn && <p>IRN: {irn}</p>}
          {ewbNumber && <p>e-Way: {ewbNumber}</p>}
        </div>
      )}
      <input
        value={vehicleNo}
        onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
        placeholder="Vehicle no (for e-Way)"
        className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run("einvoice", false)}
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          e-Invoice file
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run("einvoice", true)}
          className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Get IRN (live)
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run("eway", false)}
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          e-Way file
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run("eway", true)}
          className="rounded-full bg-[var(--ink)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Get e-Way (live)
        </button>
      </div>
      {msg && <p className="text-xs text-[var(--muted)]">{msg}</p>}
    </div>
  );
}
