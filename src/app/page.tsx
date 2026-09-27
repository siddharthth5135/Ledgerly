import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { DemoStage } from "@/components/marketing/DemoStage";
import { RoiCalculator } from "@/components/marketing/RoiCalculator";
import { Reveal } from "@/components/marketing/Reveal";

const TICKER = [
  "Your letterhead, rebuilt to the millimetre",
  "Tab-to-accept autofill",
  "Place-of-supply decides CGST/SGST vs IGST",
  "GSTIN checksum validation",
  "WhatsApp the real PDF",
  "Ageing radar",
  "Promise-to-pay tracking",
  "Recurring bills as drafts you approve",
  "UPI & bank CSV auto-matching",
  "Sales register your CA already uses",
  "GSTR-1 JSON",
  "e-Invoice IRN",
  "e-Way bill",
  "Zoho CSV · Tally XML",
];

const TODAY = [
  ["09:10", "Customer calls. You open last month's Word file."],
  ["09:14", "Copy, paste, fix the date, fix the invoice number."],
  ["09:19", "Hunt for the rate you gave him in June."],
  ["09:24", "Guess the tax head. He's in Maharashtra — IGST? CGST?"],
  ["09:31", "Print, scan, crop the photo, send on WhatsApp."],
  ["09:38", "Write it in the register so the CA can find it later."],
];

const ON_QUILL = [
  ["09:10", "Open Quick bill. Type three letters of his name."],
  ["09:11", "Tab. Address, GSTIN, last rates, payment terms — all in."],
  ["09:12", "Tax head chosen from place of supply. Totals live."],
  ["09:13", "Real PDF on WhatsApp. Delivered ticks."],
  ["—", "Due date, reminders and the CA's file: already handled."],
];

const DEPTH = [
  {
    n: "01",
    title: "A billing engine that knows Indian trade",
    body: "Place of supply drives the tax head. HSN and rates come back from the last bill you raised for that buyer. GSTIN is checksum-verified before it can be saved, so your GSTR-1 does not bounce three weeks later.",
    proof: [
      ["Tax head", "Auto CGST/SGST · IGST"],
      ["Rate memory", "Per customer, per item"],
      ["GSTIN", "15-char checksum verified"],
      ["Rounding", "Nearest rupee, on the face"],
    ],
  },
  {
    n: "02",
    title: "Your stationery is the template",
    body: "Send one old bill — a PDF, a scan, even a phone photo. Geometry reads the ruling and column widths, vision AI reads the labels. You get an editable document that prints at A4 exactly like the one your buyers already recognise.",
    proof: [
      ["Input", "PDF · scan · photo"],
      ["Output", "Print-exact A4"],
      ["Editing", "Click and type, like Word"],
      ["Per customer", "Different template each"],
    ],
  },
  {
    n: "03",
    title: "Collections that do the awkward part",
    body: "Ageing shows exactly who is late and by how much. Reminders are drafted in your tone — polite for the regular, firm for the repeat offender. When a buyer says “Friday”, that promise is tracked and followed up without you remembering it.",
    proof: [
      ["Ageing", "Current · 30 · 60 · 90+"],
      ["Tone", "Polite → firm, your words"],
      ["Promises", "Logged and followed up"],
      ["Matching", "UPI/bank CSV → invoice"],
    ],
  },
  {
    n: "04",
    title: "Month-end your CA will not complain about",
    body: "Export the sales register in the exact column layout your CA already works in, or push to Zoho and Tally. GSTR-1 JSON is one click. When a buyer needs an IRN or goods are moving, e-Invoice and e-Way bill go out on your own GST credentials.",
    proof: [
      ["Sales register", "Weekly · monthly · yearly"],
      ["Books", "Zoho CSV · Tally XML"],
      ["Returns", "GSTR-1 JSON"],
      ["Statutory", "IRN + e-Way, live"],
    ],
  },
];

const SPEC = [
  {
    head: "Billing",
    items: [
      "Quick bill with keyboard-first entry",
      "Learned autofill for customers, items, rates",
      "Multiple bill templates, one default per customer",
      "Recurring bills prepared as drafts you approve",
      "Draft → sent → paid → cancelled lifecycle",
      "Credit terms and due dates per customer",
    ],
  },
  {
    head: "Money",
    items: [
      "Ageing buckets with drill-down",
      "WhatsApp, SMS and email reminders",
      "Promise-to-pay with automatic follow-up",
      "UPI and bank statement CSV matching",
      "Part payments and balance tracking",
      "Collection rate and days-to-pay trends",
    ],
  },
  {
    head: "Compliance",
    items: [
      "GSTIN checksum validation",
      "Automatic CGST/SGST vs IGST split",
      "HSN/SAC on every line",
      "GSTR-1 JSON export",
      "e-Invoice IRN on your NIC credentials",
      "e-Way bill generation with validity",
    ],
  },
  {
    head: "Control",
    items: [
      "Owner and staff roles with scoped access",
      "Unlimited users on every plan",
      "Encrypted storage for GST API credentials",
      "Audit trail on invoice actions",
      "Postgres-backed, no spreadsheet exports to lose",
      "Works on the shop laptop and the phone",
    ],
  },
];

const FAQ = [
  {
    q: "Will my invoice really look the same?",
    a: "Yes — that is the whole point. We rebuild your existing layout, including column widths, the ruling, your footer terms and where the signature sits. Your buyers should not be able to tell you changed software.",
  },
  {
    q: "I already use Tally. Do I have to leave it?",
    a: "No. Quill is where the bill is made and the money is chased. At month end it hands Tally or Zoho a clean file, and hands your CA the sales register in the layout they already use.",
  },
  {
    q: "Do I need e-Invoice and e-Way bill?",
    a: "Only if your turnover or your buyer requires it. Quill always prepares the payload. When you are ready, enter your own NIC credentials in Settings and the IRN and e-Way bill go out live — encrypted, per business, never shared.",
  },
  {
    q: "What if my staff makes a mistake?",
    a: "Staff get scoped access — they can raise bills but not change rates, delete history or see the money dashboard. Everything they do is stamped against their name.",
  },
  {
    q: "How long until I am actually billing?",
    a: "Send one old bill and you can raise your next invoice the same day. Importing your customer list and past rates takes an afternoon, and we do it with you on the pilot.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      {/* ------------------------------------------------------------ hero */}
      <section className="hero-mesh grain blueprint relative overflow-hidden text-white">
        <SiteHeader dark />

        <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-12 md:px-8 md:pb-20 md:pt-16">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-14">
            <div className="lg:pt-6">
              <p className="animate-rise rule-label text-[var(--accent)]">
                For traders · wholesalers · manufacturers
              </p>
              <h1 className="animate-rise-1 mt-5 font-display text-[clamp(2.6rem,6.2vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.035em]">
                Bills that look
                <br />
                like yours.
                <br />
                <span className="text-white/45">Money that</span>
                <br />
                <span className="text-white/45">arrives on time.</span>
              </h1>
              <p className="animate-rise-2 mt-7 max-w-md text-[15px] leading-relaxed text-white/60">
                Quill rebuilds the invoice you already send — down to the ruling — then fills the
                next one from memory, chases the payment until it lands, and hands your CA a clean
                file at month end.
              </p>

              <div className="animate-rise-3 mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/register"
                  className="rounded-full bg-[var(--accent)] px-7 py-3.5 text-sm font-semibold text-white transition hover:brightness-110"
                >
                  Start free
                </Link>
                <Link
                  href="/pilot"
                  className="rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold backdrop-blur transition hover:bg-white/10"
                >
                  Book the ₹999 pilot
                </Link>
              </div>

              <dl className="animate-rise-3 mt-10 grid max-w-md grid-cols-3 gap-5 border-t border-white/12 pt-6">
                {[
                  ["19 sec", "average bill"],
                  ["₹0", "per invoice"],
                  ["From ₹499", "a month, all users"],
                ].map(([v, l]) => (
                  <div key={l}>
                    <dt className="font-display text-xl font-semibold tracking-tight">{v}</dt>
                    <dd className="mt-1 text-[11px] leading-snug text-white/40">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="animate-rise-2 min-w-0">
              <DemoStage />
            </div>
          </div>
        </div>

        {/* capability ticker */}
        <div className="relative overflow-hidden border-y border-white/10 bg-black/25 py-3">
          <div className="ticker-track whitespace-nowrap">
            {[0, 1].map((dup) => (
              <span key={dup} className="flex shrink-0">
                {TICKER.map((t) => (
                  <span
                    key={`${dup}-${t}`}
                    className="flex items-center gap-6 px-6 font-mono text-[11px] uppercase tracking-[0.14em] text-white/35"
                  >
                    {t}
                    <span className="text-[var(--accent)]/60">/</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- today vs quill */}
      <section className="border-b border-[var(--line)] bg-white px-5 py-20 md:px-8 md:py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p className="rule-label text-[var(--muted)]">One invoice · one morning</p>
            <h2 className="mt-4 max-w-2xl font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.06] tracking-[-0.03em]">
              The same bill, on two different Tuesdays.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] md:grid-cols-2">
            <Reveal className="bg-[var(--bg-elevated)] p-6 sm:p-8">
              <div className="flex items-baseline justify-between">
                <p className="rule-label text-[var(--muted)]">Today</p>
                <p className="font-mono text-xs text-[var(--danger)]">28 min</p>
              </div>
              <ol className="mt-6 space-y-0">
                {TODAY.map(([t, s]) => (
                  <li key={t} className="flex gap-4 border-b border-[var(--line)] py-3 last:border-0">
                    <span className="w-11 shrink-0 font-mono text-[11px] text-[var(--muted)]">{t}</span>
                    <span className="text-sm leading-snug text-[var(--muted)]">{s}</span>
                  </li>
                ))}
              </ol>
            </Reveal>

            <Reveal delay={90} className="bg-[var(--ink)] p-6 text-white sm:p-8">
              <div className="flex items-baseline justify-between">
                <p className="rule-label text-white/40">On Quill</p>
                <p className="font-mono text-xs text-[#5fd6a2]">3 min</p>
              </div>
              <ol className="mt-6 space-y-0">
                {ON_QUILL.map(([t, s]) => (
                  <li key={s} className="flex gap-4 border-b border-white/10 py-3 last:border-0">
                    <span className="w-11 shrink-0 font-mono text-[11px] text-white/35">{t}</span>
                    <span className="text-sm leading-snug text-white/85">{s}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-xs leading-relaxed text-white/40">
                Twenty-five minutes back, on one bill. Multiply that by the number of bills you raise
                this month.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- depth */}
      <section className="px-5 py-20 md:px-8 md:py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p className="rule-label text-[var(--brand)]">What is actually under the hood</p>
            <h2 className="mt-4 max-w-2xl font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.06] tracking-[-0.03em]">
              Not a prettier form. A system that understands the trade.
            </h2>
          </Reveal>

          <div className="mt-14 space-y-0">
            {DEPTH.map((d, i) => (
              <Reveal
                key={d.n}
                as="article"
                delay={i * 60}
                className="grid gap-6 border-t border-[var(--line)] py-10 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.75fr)] md:gap-10"
              >
                <p className="font-mono text-xs text-[var(--accent)] md:pt-1.5">{d.n}</p>
                <div>
                  <h3 className="font-display text-2xl font-semibold leading-tight tracking-[-0.02em] md:text-[1.75rem]">
                    {d.title}
                  </h3>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)] md:text-[15px]">
                    {d.body}
                  </p>
                </div>
                <dl className="self-start rounded-xl border border-[var(--line)] bg-white p-4">
                  {d.proof.map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-2 last:border-0"
                    >
                      <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{k}</dt>
                      <dd className="text-right text-xs font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- roi */}
      <section className="border-y border-[var(--line)] bg-white px-5 py-20 md:px-8 md:py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p className="rule-label text-[var(--muted)]">Run your own numbers</p>
            <h2 className="mt-4 max-w-2xl font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.06] tracking-[-0.03em]">
              What is slow billing costing you this month?
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
              Move the sliders to your business. The maths is deliberately conservative — working
              capital costed at 14% a year, and only a third of your overdue pile assumed to come in
              earlier.
            </p>
          </Reveal>
          <Reveal delay={80} className="mt-12">
            <RoiCalculator />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- spec */}
      <section className="px-5 py-20 md:px-8 md:py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p className="rule-label text-[var(--brand)]">Included, not upsold</p>
            <h2 className="mt-4 max-w-2xl font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.06] tracking-[-0.03em]">
              The full sheet.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {SPEC.map((s, i) => (
              <Reveal key={s.head} delay={i * 60}>
                <h3 className="border-b border-[var(--ink)] pb-2 font-display text-lg font-semibold">
                  {s.head}
                </h3>
                <ul className="mt-3">
                  {s.items.map((it) => (
                    <li
                      key={it}
                      className="border-b border-[var(--line)] py-2.5 text-[13px] leading-snug text-[var(--muted)]"
                    >
                      {it}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- faq */}
      <section className="border-t border-[var(--line)] bg-white px-5 py-20 md:px-8 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)]">
          <Reveal>
            <p className="rule-label text-[var(--muted)]">Straight answers</p>
            <h2 className="mt-4 font-display text-[clamp(1.7rem,3.4vw,2.5rem)] font-semibold leading-[1.08] tracking-[-0.03em]">
              The things people ask before they switch.
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <div className="border-t border-[var(--line)]">
              {FAQ.map((f) => (
                <details key={f.q} className="group border-b border-[var(--line)] py-4">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[15px] font-semibold">
                    {f.q}
                    <span className="mt-0.5 shrink-0 text-[var(--muted)] transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{f.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- cta */}
      <section className="hero-mesh grain relative overflow-hidden px-5 py-20 text-white md:px-8 md:py-28">
        <div className="relative mx-auto max-w-6xl">
          <Reveal>
            <h2 className="max-w-2xl font-display text-[clamp(2rem,4.6vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
              Send us one old bill. See the next one built in twenty seconds.
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-white/55">
              Seven days, ₹999, and we set the whole thing up with you — your template, your customer
              list, your rates. If it does not save you a morning a week, walk away.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="rounded-full bg-[var(--accent)] px-7 py-3.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Create your account
              </Link>
              <Link
                href="/pricing"
                className="rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold transition hover:bg-white/10"
              >
                See pricing
              </Link>
              <Link
                href="/pilot"
                className="rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold transition hover:bg-white/10"
              >
                Book the ₹999 pilot
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
