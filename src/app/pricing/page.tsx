import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

const plans = [
  {
    name: "Starter",
    price: "₹499",
    period: "/mo",
    blurb: "Solo trader / shop — exact bills + WhatsApp PDF.",
    features: [
      "1 bill template",
      "Unlimited Quick bills",
      "WhatsApp PDF share",
      "GSTR-1 JSON export",
      "GSTIN checksum",
    ],
    cta: "Start free trial",
    href: "/register",
    highlight: false,
  },
  {
    name: "Growth",
    price: "₹1,499",
    period: "/mo",
    blurb: "Wholesaler / manufacturer — collect cash faster than Vyapar alone.",
    features: [
      "Everything in Starter",
      "Collections copilot (EN/HI/GU)",
      "Promise-to-pay tracking",
      "Bank/UPI CSV payment match",
      "Tally XML + Zoho CSV",
      "Recurring bills",
      "e-Invoice + e-Way payloads",
      "Staff login (2)",
    ],
    cta: "Start 7-day pilot ₹999",
    href: "/pilot",
    highlight: true,
  },
  {
    name: "CA Desk",
    price: "₹3,999",
    period: "/mo",
    blurb: "For CAs managing 10–40 MSME clients — one cockpit.",
    features: [
      "Everything in Growth",
      "Multi-business (soon)",
      "Priority WhatsApp support",
      "Affiliate 20% year-1",
    ],
    cta: "Talk to us",
    href: "/pilot",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-16 md:px-8">
        <p className="font-display text-5xl font-semibold tracking-tight md:text-6xl">Pricing</p>
        <p className="mt-4 max-w-xl text-[var(--muted)]">
          Cheaper than hiring a clerk. Priced under Zoho Books Soft + under most CA retainers.
          Pay for collections ROI — not feature bloat.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <article
              key={p.name}
              className={`flex flex-col rounded-3xl border p-6 ${
                p.highlight
                  ? "border-[var(--brand)] bg-[var(--brand-soft)] shadow-[var(--shadow-sm)]"
                  : "border-[var(--line)] bg-white"
              }`}
            >
              <h2 className="font-display text-2xl font-semibold">{p.name}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{p.blurb}</p>
              <p className="mt-6 font-display text-4xl font-semibold">
                {p.price}
                <span className="text-base font-sans font-normal text-[var(--muted)]">{p.period}</span>
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-[var(--brand)]">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={p.href}
                className={`mt-8 block rounded-full px-4 py-3 text-center text-sm font-semibold ${
                  p.highlight
                    ? "bg-[var(--brand)] text-white"
                    : "border border-[var(--line)] bg-white"
                }`}
              >
                {p.cta}
              </Link>
            </article>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-[var(--muted)]">
          Compare: Vyapar ~₹5–8k/yr · Zoho Books Soft ~₹2.5k+/mo · TallyPrime license + CA hours.
          Quill Growth at ₹1,499 aims to pay for itself with one recovered overdue invoice.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
