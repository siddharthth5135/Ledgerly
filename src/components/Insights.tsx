"use client";

import Link from "next/link";
import { useMemo } from "react";
import { inr } from "@/lib/format";
import type { TrendPoint } from "@/lib/dashboard-insights";

function n(v: unknown) {
  return Number(v || 0);
}

function short(v: number) {
  if (Math.abs(v) >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(0)}k`;
  return `₹${Math.round(v)}`;
}

/** Tiny inline trend line for KPI cards. */
export function Sparkline({
  values,
  color = "var(--chart-1)",
  cumulative = false,
}: {
  values: number[];
  color?: string;
  cumulative?: boolean;
}) {
  const series = useMemo(() => {
    const src = values || [];
    if (!cumulative) return src;
    let run = 0;
    return src.map((v) => (run += v));
  }, [values, cumulative]);

  if (series.length < 2) return <div className="h-8" />;

  const w = 120;
  const h = 32;
  const max = Math.max(...series);
  const min = Math.min(...series, 0);
  const span = max - min || 1;
  const step = w / (series.length - 1);
  const pts = series.map((v, i) => [i * step, h - ((v - min) / span) * (h - 3) - 1.5]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gid = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={color} />
    </svg>
  );
}

/** The three numbers that decide the month — shown as one dark band. */
export function MoneyBand({
  pace,
  collectionDays,
  overdue,
  outstanding,
}: {
  pace: { projected: number; perDay: number; remainingDays: number; priorGap: number | null; complete: boolean };
  collectionDays: { days: number; verdict: string };
  overdue: number;
  outstanding: number;
}) {
  const overdueShare = outstanding > 0 ? Math.round((overdue / outstanding) * 100) : 0;
  const verdictColor =
    collectionDays.verdict === "healthy"
      ? "#5fd6a2"
      : collectionDays.verdict === "watch"
        ? "#f0b357"
        : "#f08a7d";

  return (
    <section className="grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-3">
      <div className="bg-[var(--ink)] p-5 text-white">
        <p className="rule-label text-white/40">
          {pace.complete ? "Period closed at" : "On pace to bill"}
        </p>
        <p className="mt-2.5 font-display text-2xl font-semibold tracking-tight">{inr(pace.projected)}</p>
        <p className="mt-1.5 text-[11px] leading-snug text-white/45">
          {short(pace.perDay)}/day
          {pace.remainingDays > 0 ? ` · ${pace.remainingDays} days left` : " · period complete"}
          {pace.priorGap !== null && (
            <span className={pace.priorGap >= 0 ? " text-[#5fd6a2]" : " text-[#f08a7d]"}>
              {" "}
              · {pace.priorGap >= 0 ? "+" : ""}
              {Math.round(pace.priorGap)}% vs last
            </span>
          )}
        </p>
      </div>

      <div className="bg-[var(--ink)] p-5 text-white">
        <p className="rule-label text-white/40">Money sits with buyers for</p>
        <p className="mt-2.5 font-display text-2xl font-semibold tracking-tight">
          {collectionDays.days} <span className="text-base font-medium text-white/50">days</span>
        </p>
        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: verdictColor }}>
          {collectionDays.verdict === "healthy" && "Healthy — buyers are paying close to terms."}
          {collectionDays.verdict === "watch" && "Watch it — terms are slipping."}
          {collectionDays.verdict === "stretched" && "Stretched — you are financing your buyers."}
          {collectionDays.verdict === "no sales yet" && "No sales in this period yet."}
        </p>
      </div>

      <div className="bg-[var(--ink)] p-5 text-white">
        <p className="rule-label text-white/40">Of what is unpaid, overdue</p>
        <p className="mt-2.5 font-display text-2xl font-semibold tracking-tight">
          {overdueShare}
          <span className="text-base font-medium text-white/50">%</span>
        </p>
        <p className="mt-1.5 text-[11px] leading-snug text-white/45">
          {inr(overdue)} past its due date.{" "}
          <Link href="/collections" className="font-semibold text-[var(--accent)] hover:underline">
            Start chasing →
          </Link>
        </p>
      </div>
    </section>
  );
}

/** Where every billed rupee currently sits. */
export function CashSplitBar({
  segments,
  total,
}: {
  segments: Array<{ key: string; label: string; amount: number; color: string }>;
  total: number;
}) {
  if (!segments.length) {
    return <p className="text-sm text-[var(--muted)]">Nothing billed in this period yet.</p>;
  }
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[var(--bg)]">
        {segments.map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${inr(s.amount)}`}
            style={{ width: `${(s.amount / total) * 100}%`, background: s.color }}
            className="h-full transition-all duration-700"
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums font-semibold">
              {inr(s.amount)}
              <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                {Math.round((s.amount / total) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Contribution-graph style cash calendar. */
export function CashCalendar({
  days,
  max,
}: {
  days: Array<{ date: string; amount: number; bills: number; weekday: number }>;
  max: number;
}) {
  if (!days.length) {
    return <p className="text-sm text-[var(--muted)]">No days in this period yet.</p>;
  }

  const lead = days[0].weekday;
  const cells: Array<{ date: string; amount: number; bills: number } | null> = [
    ...Array.from({ length: lead }, () => null),
    ...days,
  ];

  const level = (v: number) => {
    if (v <= 0 || max <= 0) return 0;
    const r = v / max;
    if (r > 0.66) return 4;
    if (r > 0.38) return 3;
    if (r > 0.15) return 2;
    return 1;
  };
  const bg = ["var(--bg)", "#cfe0ef", "#8fb6d6", "#3f7fac", "var(--brand)"];

  const dry = days.filter((d) => d.amount <= 0).length;
  const best = days.reduce((a, b) => (b.amount > a.amount ? b : a), days[0]);

  return (
    <div>
      <div className="flex gap-2">
        <div className="grid grid-rows-7 gap-[3px] pr-1 text-[9px] leading-[11px] text-[var(--muted)]">
          {["M", "", "W", "", "F", "", "S"].map((d, i) => (
            <span key={i} className="h-[11px]">
              {d}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="grid auto-cols-[11px] grid-flow-col grid-rows-7 gap-[3px]">
            {cells.map((c, i) =>
              c === null ? (
                <span key={`b${i}`} className="h-[11px] w-[11px]" />
              ) : (
                <span
                  key={c.date}
                  title={`${c.date}: ${inr(c.amount)} · ${c.bills} bill${c.bills === 1 ? "" : "s"}`}
                  className="h-[11px] w-[11px] rounded-[2px]"
                  style={{ background: bg[level(c.amount)] }}
                />
              )
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
        <span>
          Best day <span className="font-semibold text-[var(--ink)]">{best.date.slice(8, 10)}/{best.date.slice(5, 7)}</span>{" "}
          · {inr(best.amount)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="mr-1">{dry} days with no billing</span>
          {bg.map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
          ))}
        </span>
      </div>
    </div>
  );
}

/** Which weekday your business actually happens on. */
export function WeekdayBars({
  rows,
  best,
}: {
  rows: Array<{ label: string; amount: number; bills: number }>;
  best: { label: string; amount: number };
}) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div>
      <div className="flex h-28 items-end gap-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="min-w-0 flex-1 rounded-t-[3px] transition-all duration-500"
            title={`${r.label}: ${inr(r.amount)} · ${r.bills} bills`}
            style={{
              height: `${Math.max(2, (r.amount / max) * 100)}%`,
              background: r.label === best.label ? "var(--accent)" : "var(--chart-1)",
              opacity: r.label === best.label ? 1 : 0.32,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 border-t border-[var(--line)] pt-1.5">
        {rows.map((r) => (
          <span key={r.label} className="min-w-0 flex-1 text-center text-[10px] text-[var(--muted)]">
            {r.label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        {best.amount > 0 ? (
          <>
            <span className="font-semibold text-[var(--ink)]">{best.label}</span> is your heaviest
            billing day. Line up dispatches and follow-ups around it.
          </>
        ) : (
          "Raise a few bills to see your weekly rhythm."
        )}
      </p>
    </div>
  );
}

/** Revenue concentration — the buyer you cannot afford to lose. */
export function ConcentrationPanel({
  rows,
  top1,
  top3,
  risk,
}: {
  rows: Array<{ customer_name: string; bills: number; amount: number; share: number }>;
  top1: number;
  top3: number;
  risk: "low" | "medium" | "high";
}) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--muted)]">No sales yet in this period.</p>;
  }
  const tone =
    risk === "high"
      ? { c: "var(--danger)", t: "Concentrated" }
      : risk === "medium" ? { c: "var(--warn)", t: "Watch" } : { c: "var(--ok)", t: "Well spread" };

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-xs text-[var(--muted)]">
          Top 3 buyers are{" "}
          <span className="font-semibold text-[var(--ink)]">{Math.round(top3)}%</span> of sales
        </p>
        <span
          className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: tone.c, background: `color-mix(in srgb, ${tone.c} 12%, white)` }}
        >
          {tone.t}
        </span>
      </div>
      <ul className="space-y-3">
        {rows.map((c, i) => (
          <li key={`${c.customer_name}-${i}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">
                <span className="mr-2 font-mono text-[10px] text-[var(--muted)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {c.customer_name}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--muted)]">
                {inr(n(c.amount))}
                <span className="ml-2 font-semibold text-[var(--ink)]">{Math.round(c.share)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg)]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, c.share)}%`,
                  background: i === 0 ? "var(--brand)" : "var(--line-strong)",
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      {risk === "high" && (
        <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
          {Math.round(top1)}% of your billing comes from one buyer. If they delay, your month delays
          with them.
        </p>
      )}
    </div>
  );
}

/** Who is late, by how much, and for how long. */
export function LatePayersTable({
  rows,
}: {
  rows: Array<{ customer_name: string; overdue_amount: number; max_days_late: number; overdue_bills?: number }>;
}) {
  if (!rows?.length) {
    return (
      <p className="py-6 text-center text-sm text-[var(--muted)]">
        Nobody is overdue right now. Rare and excellent.
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--line)] text-left">
          <th className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Buyer
          </th>
          <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Overdue
          </th>
          <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Late by
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const d = n(r.max_days_late);
          const tone = d > 60 ? "var(--danger)" : d > 30 ? "var(--warn)" : "var(--muted)";
          return (
            <tr key={`${r.customer_name}-${i}`} className="border-b border-[var(--line)] last:border-0">
              <td className="max-w-0 truncate py-2.5 pr-2 font-medium">{r.customer_name}</td>
              <td className="py-2.5 text-right tabular-nums font-semibold">{inr(n(r.overdue_amount))}</td>
              <td className="py-2.5 text-right tabular-nums font-semibold" style={{ color: tone }}>
                {d}d
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Regulars who have gone quiet — the cheapest sales you are not making. */
export function QuietRegulars({
  rows,
}: {
  rows: Array<{ customer_name: string; last_bill: string; lifetime_amount: number }>;
}) {
  if (!rows?.length) {
    return (
      <p className="py-6 text-center text-sm text-[var(--muted)]">
        Every regular has bought recently. Keep it that way.
      </p>
    );
  }
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => {
        const days = Math.max(
          0,
          Math.round((Date.now() - new Date(r.last_bill).getTime()) / 86400000)
        );
        return (
          <li
            key={`${r.customer_name}-${i}`}
            className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2.5 last:border-0 last:pb-0 text-sm"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{r.customer_name}</span>
              <span className="text-[11px] text-[var(--muted)]">
                Lifetime {inr(n(r.lifetime_amount))}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold tabular-nums text-[var(--warn)]">
                {days}d
              </span>
              <span className="text-[10px] text-[var(--muted)]">silent</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Helper for KPI sparkline series. */
export function seriesFrom(trend: TrendPoint[], key: "amount" | "received" | "bills") {
  return (trend || []).map((t) => n(t[key]));
}
