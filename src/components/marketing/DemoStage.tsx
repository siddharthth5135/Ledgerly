"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CHAPTER_MS = 7600;

type Chapter = {
  id: string;
  tab: string;
  kicker: string;
  title: string;
  note: string;
};

const CHAPTERS: Chapter[] = [
  {
    id: "learn",
    tab: "Your letterhead",
    kicker: "Day one",
    title: "Send us one old bill. We rebuild it exactly.",
    note: "Upload a PDF or a phone photo. Geometry reads the ruling, vision AI reads the words — your columns, your fonts, your footer.",
  },
  {
    id: "bill",
    tab: "Billing",
    kicker: "Every day after",
    title: "Type three letters. Press Tab. Bill done.",
    note: "Quill remembers who buys what at which rate. CGST/SGST or IGST is decided from the place of supply, not from you.",
  },
  {
    id: "send",
    tab: "Delivery",
    kicker: "Same minute",
    title: "The real PDF on WhatsApp — not a screenshot.",
    note: "A4 print-exact file, with a payment line the buyer can act on. Print, email and share all come off the same document.",
  },
  {
    id: "money",
    tab: "Money & CA",
    kicker: "Month end",
    title: "Chase politely. Hand your CA a clean file.",
    note: "Ageing shows who is late, reminders go out in your tone, promises are tracked, and the sales register exports the way your CA already works.",
  },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
}

export function DemoStage() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const holdRef = useRef(false);

  const go = useCallback((i: number) => {
    setIndex(((i % CHAPTERS.length) + CHAPTERS.length) % CHAPTERS.length);
  }, []);

  useEffect(() => {
    if (reduced || paused) return;
    const t = window.setTimeout(() => {
      if (!holdRef.current) setIndex((i) => (i + 1) % CHAPTERS.length);
    }, CHAPTER_MS);
    return () => window.clearTimeout(t);
  }, [index, paused, reduced]);

  const chapter = CHAPTERS[index];

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Chapter rail */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-white/10 pb-3">
        {CHAPTERS.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => go(i)}
            className={`group relative pb-2 text-left text-[13px] font-semibold transition ${
              i === index ? "text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            <span className="mr-2 font-mono text-[10px] text-white/30">
              {String(i + 1).padStart(2, "0")}
            </span>
            {c.tab}
            <span className="absolute inset-x-0 bottom-0 h-px bg-white/10">
              <span
                key={`${c.id}-${index}-${paused}`}
                className="block h-full origin-left bg-[var(--accent)]"
                style={
                  i === index && !reduced
                    ? {
                        animation: `progress-fill ${CHAPTER_MS}ms linear both`,
                        animationPlayState: paused ? "paused" : "running",
                      }
                    : { transform: i < index ? "scaleX(1)" : "scaleX(0)" }
                }
              />
            </span>
          </button>
        ))}
      </div>

      {/* Screen */}
      <div className="relative mt-5 overflow-hidden rounded-2xl border border-white/12 bg-[#070d15]/80 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)]/70" />
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <p className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
            {chapter.kicker}
          </p>
          <p className="ml-auto font-mono text-[10px] text-white/25">
            {paused ? "paused" : reduced ? "static" : "playing"}
          </p>
        </div>

        <div className="relative min-h-[330px] p-4 sm:min-h-[360px] sm:p-6">
          {chapter.id === "learn" && <LearnScene key={`learn-${index}`} />}
          {chapter.id === "bill" && <BillScene key={`bill-${index}`} />}
          {chapter.id === "send" && <SendScene key={`send-${index}`} />}
          {chapter.id === "money" && <MoneyScene key={`money-${index}`} />}
        </div>
      </div>

      {/* Caption */}
      <div className="mt-5 max-w-xl">
        <h3 className="font-display text-xl leading-snug text-white sm:text-2xl">{chapter.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/55">{chapter.note}</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- scenes */

const FIELD_BOXES = [
  { l: "Seller block", t: "6%", x: "4%", w: "42%", h: "16%", d: 0.25 },
  { l: "Invoice no. + date", t: "6%", x: "58%", w: "38%", h: "16%", d: 0.55 },
  { l: "Buyer + GSTIN", t: "27%", x: "4%", w: "52%", h: "15%", d: 0.85 },
  { l: "Item grid", t: "46%", x: "4%", w: "92%", h: "28%", d: 1.15 },
  { l: "Tax split + total", t: "78%", x: "54%", w: "42%", h: "16%", d: 1.45 },
];

function LearnScene() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="relative aspect-[1/1.18] overflow-hidden rounded-lg bg-[#f5f4ef] shadow-inner">
        {/* the scanned sheet */}
        <div className="absolute inset-0 p-4 text-[#1a1a1a]">
          <div className="flex items-start justify-between border-b-2 border-[#1a1a1a] pb-2">
            <div>
              <p className="font-display text-[13px] font-bold leading-none">DEMO PACKERS PVT LTD</p>
              <p className="mt-1 text-[7px] leading-tight text-[#555]">
                Plot 42, GIDC Estate, Ahmedabad 382445
                <br />
                GSTIN 24AABCD1234E1Z5
              </p>
            </div>
            <div className="text-right text-[7px]">
              <p className="font-bold">TAX INVOICE</p>
              <p className="mt-1 text-[#555]">INV-1042 · 12-08-2026</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-px bg-[#1a1a1a] text-[6.5px]">
            {["DESCRIPTION", "HSN", "QTY", "RATE", "AMOUNT"].map((h) => (
              <div key={h} className="bg-[#e8e6df] px-1 py-1 font-bold">
                {h}
              </div>
            ))}
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="contents">
                {Array.from({ length: 5 }).map((__, c) => (
                  <div key={c} className="bg-[#f5f4ef] px-1 py-[3px] text-[#333]">
                    {c === 0 ? (r === 0 ? "FDY pack body repairing" : r < 3 ? "PP woven sack 24x36" : "") : ""}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <div className="w-1/2 space-y-[3px] text-[6.5px]">
              <div className="flex justify-between border-b border-[#ccc] pb-[2px]">
                <span>Taxable</span>
                <span>1,125.00</span>
              </div>
              <div className="flex justify-between border-b border-[#ccc] pb-[2px]">
                <span>CGST 9% / SGST 9%</span>
                <span>202.50</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>GRAND TOTAL</span>
                <span>1,328.00</span>
              </div>
            </div>
          </div>
        </div>

        {/* detection overlay */}
        {FIELD_BOXES.map((b) => (
          <div
            key={b.l}
            className="absolute rounded-[3px] border border-[var(--accent)] bg-[var(--accent)]/8"
            style={{
              top: b.t,
              left: b.x,
              width: b.w,
              height: b.h,
              animation: `row-in 0.4s cubic-bezier(0.22,1,0.36,1) ${b.d}s both`,
            }}
          >
            <span className="absolute -top-[9px] left-0 bg-[var(--accent)] px-1 font-mono text-[6px] uppercase tracking-wider text-white">
              {b.l}
            </span>
          </div>
        ))}

        {/* sweep */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 scan-sweep bg-[linear-gradient(180deg,transparent,rgba(196,92,38,0.28),transparent)]" />
      </div>

      <div className="flex flex-col justify-center gap-3">
        {[
          { k: "Grid detected", v: "5 columns · 12 rows", d: 1.5 },
          { k: "Fields mapped", v: "23 of 23", d: 1.75 },
          { k: "Fonts matched", v: "Serif head · mono figures", d: 2.0 },
          { k: "Template saved", v: "Editable like a Word doc", d: 2.25 },
        ].map((r) => (
          <div
            key={r.k}
            className="flex items-baseline justify-between gap-3 border-b border-white/8 pb-2.5"
            style={{ animation: `row-in 0.45s cubic-bezier(0.22,1,0.36,1) ${r.d}s both` }}
          >
            <span className="text-xs text-white/45">{r.k}</span>
            <span className="text-right text-[13px] font-semibold text-white">{r.v}</span>
          </div>
        ))}
        <p
          className="mt-1 text-xs leading-relaxed text-white/40"
          style={{ animation: "row-in 0.45s ease 2.5s both" }}
        >
          No &ldquo;choose a template&rdquo; step. Your buyers keep seeing the bill they already recognise.
        </p>
      </div>
    </div>
  );
}

function useTyped(text: string, startDelay = 400, speed = 55) {
  const [out, setOut] = useState("");
  useEffect(() => {
    let i = 0;
    let iv: number | undefined;
    const t = window.setTimeout(() => {
      iv = window.setInterval(() => {
        i += 1;
        setOut(text.slice(0, i));
        if (i >= text.length && iv) window.clearInterval(iv);
      }, speed);
    }, startDelay);
    return () => {
      window.clearTimeout(t);
      if (iv) window.clearInterval(iv);
    };
  }, [text, startDelay, speed]);
  return out;
}

function BillScene() {
  const typed = useTyped("Chi", 500, 130);
  const accepted = typed.length >= 3;

  const lines = useMemo(
    () => [
      { d: "FDY pack body repairing", hsn: "998729", q: "1", r: "1,125.00", a: "1,125.00" },
      { d: "PP woven sack 24×36", hsn: "63053300", q: "40", r: "38.50", a: "1,540.00" },
      { d: "Lamination charges", hsn: "998821", q: "1", r: "610.00", a: "610.00" },
    ],
    []
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_0.72fr]">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <p className="rule-label text-white/30">Quick bill</p>

        <div className="mt-3">
          <label className="text-[11px] text-white/40">Customer</label>
          <div className="relative mt-1 rounded-md border border-[var(--accent)]/50 bg-black/30 px-3 py-2 text-sm">
            <span className="text-white">{typed}</span>
            {!accepted && <span className="caret text-white/70" />}
            {accepted && <span className="text-white/30">ripal Industries Ltd</span>}
            {accepted && (
              <span
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/60"
                style={{ animation: "row-in 0.3s ease 0.1s both" }}
              >
                Tab
              </span>
            )}
          </div>
          {accepted && (
            <p className="mt-1.5 text-[11px] text-white/35" style={{ animation: "row-in 0.3s ease 0.15s both" }}>
              GSTIN 24AACCC4175D1ZP · Gujarat · 12 past bills · avg ₹24,800
            </p>
          )}
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-white/8">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-white/8 bg-white/[0.04] px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-white/35">
            <span>Item</span>
            <span>Qty</span>
            <span>Rate</span>
            <span className="text-right">Amount</span>
          </div>
          {lines.map((l, i) => (
            <div
              key={l.d}
              className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 border-b border-white/5 px-3 py-2 text-[12px] last:border-0"
              style={{ animation: `row-in 0.4s cubic-bezier(0.22,1,0.36,1) ${1.3 + i * 0.35}s both` }}
            >
              <span className="min-w-0 truncate text-white/85">
                {l.d}
                <span className="ml-2 font-mono text-[9px] text-white/25">HSN {l.hsn}</span>
              </span>
              <span className="tabular-nums text-white/55">{l.q}</span>
              <span className="tabular-nums text-white/55">{l.r}</span>
              <span className="tabular-nums text-right font-semibold text-white">{l.a}</span>
            </div>
          ))}
        </div>

        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          style={{ animation: "row-in 0.4s ease 2.5s both" }}
        >
          <span className="rounded-full border border-[var(--ok)]/40 bg-[var(--ok)]/12 px-2.5 py-1 text-[10px] font-semibold text-[#5fd6a2]">
            Intra-state → CGST 9% + SGST 9%
          </span>
          <span className="rounded-full border border-white/12 px-2.5 py-1 text-[10px] text-white/45">
            Rounded off ₹0.50
          </span>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-4 rounded-lg border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.06),transparent)] p-4">
        <div>
          <p className="rule-label text-white/30">Live totals</p>
          <dl className="mt-3 space-y-2 text-[12px]">
            {[
              ["Taxable", "3,275.00", 2.6],
              ["CGST 9%", "294.75", 2.75],
              ["SGST 9%", "294.75", 2.9],
            ].map(([k, v, d]) => (
              <div key={k as string} className="flex justify-between text-white/50" style={{ animation: `row-in 0.35s ease ${d}s both` }}>
                <dt>{k}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
            <div
              className="flex items-baseline justify-between border-t border-white/12 pt-2.5"
              style={{ animation: "row-in 0.4s ease 3.1s both" }}
            >
              <dt className="text-sm text-white/70">Grand total</dt>
              <dd className="font-display text-2xl font-semibold tabular-nums text-white">₹3,864</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-md border border-white/10 bg-black/25 p-3" style={{ animation: "row-in 0.4s ease 3.4s both" }}>
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">Elapsed</p>
          <p className="mt-1 font-display text-3xl font-semibold text-white">19.4s</p>
          <p className="mt-1 text-[11px] text-white/40">From blank screen to a signed, print-ready PDF.</p>
        </div>
      </div>
    </div>
  );
}

function SendScene() {
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="mx-auto w-[220px] overflow-hidden rounded-[26px] border border-white/15 bg-[#0b141a] p-2 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-2 border-b border-white/8 px-2 pb-2">
          <div className="h-7 w-7 rounded-full bg-[#2a3942]" />
          <div>
            <p className="text-[11px] font-semibold text-white">Chiripal Industries</p>
            <p className="text-[9px] text-white/35">online</p>
          </div>
        </div>
        <div className="space-y-2 px-2 py-3">
          <div className="ml-auto w-[88%] rounded-lg rounded-tr-sm bg-[#005c4b] p-2" style={{ animation: "row-in 0.4s ease 0.4s both" }}>
            <div className="rounded bg-black/25 p-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-[#c45c26] px-1 py-0.5 font-mono text-[7px] font-bold text-white">PDF</span>
                <p className="truncate text-[9px] text-white/85">INV-1042-Chiripal.pdf</p>
              </div>
              <p className="mt-1 text-[8px] text-white/45">1 page · 214 KB</p>
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-white/90">
              Namaste, invoice INV-1042 for ₹3,864 attached. Due 27 Aug. UPI: demopackers@ok
            </p>
            <p className="mt-1 text-right text-[8px] text-[#53bdeb]">10:42 ✓✓</p>
          </div>
          <div className="w-[70%] rounded-lg rounded-tl-sm bg-[#202c33] p-2" style={{ animation: "row-in 0.4s ease 1.6s both" }}>
            <p className="text-[10px] text-white/85">Received. Paying on Friday.</p>
            <p className="mt-1 text-right text-[8px] text-white/35">10:44</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {[
          {
            t: "One document, four destinations",
            d: "WhatsApp, email, A4 print and the customer portal all render the same file — no re-layout, no screenshot blur.",
            d2: 0.6,
          },
          {
            t: "Payment line built in",
            d: "UPI ID, bank details and due date sit on the bill, so the buyer can pay without asking you twice.",
            d2: 0.95,
          },
          {
            t: "Reply becomes a promise",
            d: "“Paying Friday” gets logged as a promise-to-pay. Quill follows up on Friday so you do not have to remember.",
            d2: 1.3,
          },
        ].map((r) => (
          <div
            key={r.t}
            className="border-l-2 border-[var(--accent)]/50 pl-3.5"
            style={{ animation: `row-in 0.45s cubic-bezier(0.22,1,0.36,1) ${r.d2}s both` }}
          >
            <p className="text-[13px] font-semibold text-white">{r.t}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/45">{r.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoneyScene() {
  const buckets = [
    { l: "Not due yet", v: "₹4,21,508", n: 16, pct: 72, c: "var(--ok)" },
    { l: "1–30 days", v: "₹86,555", n: 3, pct: 26, c: "var(--chart-1)" },
    { l: "31–60 days", v: "₹42,100", n: 2, pct: 14, c: "var(--warn)" },
    { l: "60+ days", v: "₹18,900", n: 1, pct: 7, c: "var(--danger)" },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <div>
        <p className="rule-label text-white/30">Who owes you, and how badly</p>
        <div className="mt-3 space-y-2.5">
          {buckets.map((b, i) => (
            <div key={b.l} style={{ animation: `row-in 0.4s ease ${0.3 + i * 0.16}s both` }}>
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-white/70">{b.l}</span>
                <span className="tabular-nums text-white/45">
                  {b.v} · {b.n}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${b.pct}%`,
                    background: b.c,
                    animation: `row-in 0.6s ease ${0.45 + i * 0.16}s both`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div
          className="mt-4 rounded-md border border-white/10 bg-white/[0.03] p-3"
          style={{ animation: "row-in 0.4s ease 1.2s both" }}
        >
          <p className="text-[11px] text-white/40">Reminder drafted in your tone</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-white/80">
            “Sir, INV-0987 of ₹42,100 crossed due on 18 Aug. You had mentioned Friday — shall I share the
            UPI link again?”
          </p>
          <div className="mt-2 flex gap-2">
            <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold text-white">
              Send on WhatsApp
            </span>
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-white/55">
              Softer tone
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-baseline justify-between">
          <p className="rule-label text-white/30">Sales register · Aug 2026</p>
          <span className="font-mono text-[9px] text-[var(--accent)]">.CSV</span>
        </div>
        <div className="mt-3 overflow-hidden rounded border border-white/8 font-mono text-[9px]">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 bg-white/[0.05] px-2 py-1.5 text-white/40">
            <span>DATE</span>
            <span>COMPANY</span>
            <span>TAXABLE</span>
            <span className="text-right">TOTAL</span>
          </div>
          {[
            ["12-08", "CHIRIPAL INDUSTRIES", "3,275", "3,864"],
            ["14-08", "ARIHANT POLYMERS", "18,400", "21,712"],
            ["17-08", "SHREE TEX PVT LTD", "42,000", "49,560"],
            ["21-08", "NAVKAR PACKAGING", "9,850", "11,623"],
            ["26-08", "GOKUL AGRO", "64,300", "75,874"],
          ].map((r, i) => (
            <div
              key={r[1]}
              className="grid grid-cols-[auto_1fr_auto_auto] gap-2 border-t border-white/5 px-2 py-1.5 text-white/65"
              style={{ animation: `row-in 0.3s ease ${0.5 + i * 0.13}s both` }}
            >
              <span>{r[0]}</span>
              <span className="truncate">{r[1]}</span>
              <span className="tabular-nums">{r[2]}</span>
              <span className="tabular-nums text-right text-white">{r[3]}</span>
            </div>
          ))}
          <div
            className="grid grid-cols-[auto_1fr_auto_auto] gap-2 border-t border-white/12 bg-white/[0.04] px-2 py-1.5 font-bold text-white"
            style={{ animation: "row-in 0.35s ease 1.3s both" }}
          >
            <span />
            <span>TOTAL</span>
            <span className="tabular-nums">1,37,825</span>
            <span className="tabular-nums text-right">1,62,633</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" style={{ animation: "row-in 0.4s ease 1.6s both" }}>
          {["GSTR-1 JSON", "Zoho CSV", "Tally XML", "e-Invoice IRN", "e-Way bill"].map((t) => (
            <span key={t} className="rounded border border-white/12 px-2 py-1 text-[10px] text-white/50">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
