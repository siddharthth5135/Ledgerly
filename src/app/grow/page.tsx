"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/SiteChrome";

type Offer = {
  id: string;
  title: string;
  message: string;
  minDailySpend: number;
  minInvoiceCount: number;
  tagsAny: string[];
  active: boolean;
};

type LinkRow = {
  customerId: string;
  name: string;
  phone: string;
  url: string;
};

export default function GrowPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerId, setOfferId] = useState("");
  const [message, setMessage] = useState("");
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/offers")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setOffers(d.offers || []);
          if (d.offers?.[0]) {
            setOfferId(d.offers[0].id);
            setMessage(d.offers[0].message);
          }
        }
      });
  }, []);

  function pickOffer(id: string) {
    setOfferId(id);
    const o = offers.find((x) => x.id === id);
    if (o) setMessage(o.message);
  }

  async function prepare() {
    setBusy(true);
    setError(null);
    setNote(null);
    setLinks([]);
    try {
      const res = await fetch("/api/offers/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, message }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed");
        return;
      }
      setLinks(data.links || []);
      setNote(`${data.count} customers ready · ${data.note}`);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Grow / offers"
      subtitle="Use your customer phone book to push daily-buyer perks and new-stock updates. ₹0 via WhatsApp share."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="space-y-4 rounded-3xl border border-[var(--line)] bg-white p-5">
          <label className="block text-sm font-medium">
            Offer template
            <select
              value={offerId}
              onChange={(e) => pickOffer(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm"
            >
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Message (editable)
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="mt-1.5 w-full rounded-2xl border border-[var(--line)] px-3 py-2.5 text-sm"
            />
          </label>
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          )}
          {note && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-950">{note}</p>
          )}
          <button
            type="button"
            disabled={busy || !offerId}
            onClick={prepare}
            className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Preparing…" : "Prepare WhatsApp broadcast"}
          </button>
        </section>

        <section className="rounded-3xl border border-[var(--line)] bg-white p-5">
          <h2 className="font-display text-lg font-semibold">Eligible customers</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Click each link to open WhatsApp with the offer pre-filled (demo-safe, ₹0).
          </p>
          <ul className="mt-4 max-h-[420px] space-y-2 overflow-auto text-sm">
            {links.length === 0 && (
              <li className="text-[var(--muted)]">No links yet — prepare a broadcast.</li>
            )}
            {links.map((l) => (
              <li
                key={l.customerId}
                className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-2"
              >
                <div>
                  <p className="font-medium">{l.name}</p>
                  <p className="font-mono text-xs text-[var(--muted)]">{l.phone}</p>
                </div>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[#128C7E] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  WhatsApp
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
