"use client";

import { FormEvent, useState } from "react";
import { AppShell } from "@/components/SiteChrome";

export default function PilotPage() {
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [interest, setInterest] = useState("pilot");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          business,
          phone,
          email: email || undefined,
          city: city || undefined,
          interest,
          message: message || undefined,
          source: "pilot-page",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not submit");
        return;
      }
      setDone(
        "You're in. We'll WhatsApp you a 15-min demo slot. Meanwhile try AI Invoice with your real chat paste."
      );
      setName("");
      setBusiness("");
      setPhone("");
      setEmail("");
      setCity("");
      setMessage("");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Start making money with Quill"
      subtitle="7-day pilot for Indian SMEs — AI invoices from WhatsApp, trust checks, collections. Pay only if it saves you time."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4 text-sm text-[var(--muted)]">
          <p className="font-display text-2xl font-semibold text-[var(--ink)]">
            Pilot offer (tomorrow-ready)
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-[var(--ink)]">₹999 / 7 days</strong> — full Growth trial:
              exact bill PDF, collections copilot, Tally XML, payment CSV match
            </li>
            <li>
              Then <strong className="text-[var(--ink)]">Growth ₹1,499/mo</strong> (Starter ₹499) —
              under Zoho Soft, priced to beat one overdue chase
            </li>
            <li>Same-day WhatsApp PDF + Razorpay link walkthrough</li>
            <li>Buyers: traders, wholesalers, manufacturers, CA desks</li>
          </ul>
          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <p className="font-semibold text-[var(--ink)]">What you say on the call</p>
            <p className="mt-2">
              “Paste one WhatsApp order. Watch Quill build a GST invoice with HSN and tax in 30
              seconds. If it doesn’t save you an hour this week, don’t pay.”
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 rounded-3xl border border-[var(--line)] bg-white p-5">
          <label className="block text-sm font-medium">
            Your name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
            />
          </label>
          <label className="block text-sm font-medium">
            Business name
            <input
              required
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
            />
          </label>
          <label className="block text-sm font-medium">
            WhatsApp number
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98XXXXXXXX"
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Email (optional)
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </label>
            <label className="block text-sm font-medium">
              City
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Interest
            <select
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
            >
              <option value="pilot">7-day pilot ₹999</option>
              <option value="demo">Free WhatsApp→invoice demo</option>
              <option value="growth">Growth plan ₹5,999/mo</option>
              <option value="trust-api">Trust API for my marketplace</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Anything else?
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          {done && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{done}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--deep)] disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Book my pilot"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
