"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AppShell } from "@/components/SiteChrome";
import { inr } from "@/lib/format";
import { Pill } from "@/components/Pill";
import { AgeingChart, DeltaBadge, GstDonut, TrendChart } from "@/components/Charts";
import {
  CashCalendar,
  CashSplitBar,
  ConcentrationPanel,
  LatePayersTable,
  MoneyBand,
  QuietRegulars,
  Sparkline,
  WeekdayBars,
  seriesFrom,
} from "@/components/Insights";
import {
  buildCalendar,
  buildCashSplit,
  buildCollectionDays,
  buildConcentration,
  buildPace,
  buildWeekdayPattern,
  type TrendPoint,
} from "@/lib/dashboard-insights";
import { buildGrowthTips, type Tip } from "@/lib/growth-tips";

type Overview = {
  period_start: string;
  period_end: string;
  invoice_count: string | number;
  business_total: string | number;
  received_amount?: string | number;
  outstanding_amount?: string | number;
  paid_count: string | number;
  overdue_count: string | number;
  draft_count: string | number;
  avg_invoice_value: string | number;
  customer_count: string | number;
  new_customers: string | number;
  reminders_sent: string | number;
  top_customers: Array<{ customer_name: string; bills: number; amount: number }> | null;
  daily_trend: TrendPoint[] | null;
  status_breakdown: Record<string, number> | null;
  collection_pct?: string | number;
  gst_taxable?: string | number;
  gst_cgst?: string | number;
  gst_sgst?: string | number;
  gst_igst?: string | number;
  gst_total?: string | number;
  ageing?: Array<{ bucket: string; bills: number; amount: number }> | null;
  prior_business_total?: string | number;
  prior_received?: string | number;
  prior_invoice_count?: string | number;
  quiet_regulars?: Array<{ customer_name: string; last_bill: string; lifetime_amount: number }> | null;
  late_payers?: Array<{ customer_name: string; overdue_amount: number; max_days_late: number }> | null;
};

const PERIODS = [
  { v: "weekly", l: "Week" },
  { v: "monthly", l: "Month" },
  { v: "quarterly", l: "Quarter" },
  { v: "yearly", l: "Year" },
];

function num(v: unknown) {
  return Number(v || 0);
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

function Panel({
  title,
  hint,
  action,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-card flex flex-col p-5 ${className}`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold tracking-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-[11px] text-[var(--muted)]">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState("monthly");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recent, setRecent] = useState<Array<Record<string, unknown>>>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");

  useEffect(() => {
    setError(null);
    fetch(`/api/dashboard?period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error === "Unauthorized" || (!d.ok && !d.overview)) {
          window.location.href = "/login?next=/dashboard";
          return;
        }
        if (!d.ok) {
          setError(d.error || "Failed");
          return;
        }
        const o = d.overview as Overview;
        o.top_customers = parseJson(o.top_customers, []);
        o.daily_trend = parseJson(o.daily_trend, []);
        o.status_breakdown = parseJson(o.status_breakdown, {});
        o.ageing = parseJson(o.ageing, []);
        o.quiet_regulars = parseJson(o.quiet_regulars, []);
        o.late_payers = parseJson(o.late_payers, []);
        setOverview(o);
        setRecent(d.recent || []);
        setBusinessName(d.businessName || "");
        setTips(
          d.tips ||
            buildGrowthTips({
              business_total: num(o.business_total),
              received_amount: num(o.received_amount),
              outstanding_amount: num(o.outstanding_amount),
              collection_pct: num(o.collection_pct),
              overdue_count: num(o.overdue_count),
              invoice_count: num(o.invoice_count),
              avg_invoice_value: num(o.avg_invoice_value),
              new_customers: num(o.new_customers),
              customer_count: num(o.customer_count),
              prior_business_total: num(o.prior_business_total),
              prior_invoice_count: num(o.prior_invoice_count),
              gst_total: num(o.gst_total),
              ageing: o.ageing,
              quiet_regulars: o.quiet_regulars,
              late_payers: o.late_payers,
            })
        );
      })
      .catch(() => setError("Network error"));
  }, [period]);

  const trend = useMemo(() => overview?.daily_trend || [], [overview]);

  const derived = useMemo(() => {
    if (!overview) return null;
    const billed = num(overview.business_total);
    const collected = num(overview.received_amount);
    const outstanding = num(overview.outstanding_amount);
    const pace = buildPace({
      periodStart: String(overview.period_start),
      periodEnd: String(overview.period_end),
      billed,
      priorBilled: num(overview.prior_business_total),
    });
    return {
      billed,
      collected,
      outstanding,
      pace,
      collectionDays: buildCollectionDays(billed, outstanding, pace.totalDays),
      concentration: buildConcentration(overview.top_customers || [], billed),
      weekday: buildWeekdayPattern(trend),
      calendar: buildCalendar(trend, String(overview.period_start), String(overview.period_end)),
      cash: buildCashSplit({ billed, collected, ageing: overview.ageing }),
    };
  }, [overview, trend]);

  return (
    <AppShell
      title="Dashboard"
      subtitle={
        businessName
          ? `${businessName} — sales, cash and GST risk, read in one screen.`
          : "Sales, cash and GST risk, read in one screen."
      }
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-full border border-[var(--line)] bg-white p-1 shadow-[var(--shadow-sm)]">
          {PERIODS.map((p) => (
            <button
              key={p.v}
              type="button"
              onClick={() => setPeriod(p.v)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                period === p.v ? "bg-[var(--ink)] text-white" : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {p.l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {overview && (
            <p className="font-mono text-[11px] text-[var(--muted)]">
              {String(overview.period_start).slice(0, 10)} → {String(overview.period_end).slice(0, 10)}
            </p>
          )}
          <Link
            href="/books"
            className="rounded-full border border-[var(--line)] bg-white px-3.5 py-1.5 text-xs font-semibold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            Export for CA
          </Link>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      {!overview || !derived ? (
        <div className="space-y-4">
          <div className="grid animate-pulse gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-white/70" />
            ))}
          </div>
          <div className="h-28 animate-pulse rounded-2xl bg-white/70" />
          <div className="grid animate-pulse gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="h-72 rounded-2xl bg-white/70" />
            <div className="h-72 rounded-2xl bg-white/70" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ------------------------------------------------------ KPI strip */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                l: "Billed",
                v: inr(derived.billed),
                delta: (
                  <DeltaBadge
                    current={derived.billed}
                    prior={num(overview.prior_business_total)}
                    label="vs prior"
                  />
                ),
                spark: seriesFrom(trend, "amount"),
                color: "var(--chart-1)",
                cumulative: false,
              },
              {
                l: "Collected",
                v: inr(derived.collected),
                delta: <DeltaBadge current={derived.collected} prior={num(overview.prior_received)} />,
                spark: seriesFrom(trend, "received"),
                color: "var(--ok)",
                cumulative: true,
              },
              {
                l: "Outstanding",
                v: inr(derived.outstanding),
                delta: (
                  <span className="text-xs font-semibold text-[var(--danger)]">
                    {num(overview.overdue_count)} overdue
                  </span>
                ),
                spark: seriesFrom(trend, "amount"),
                color: "var(--danger)",
                cumulative: false,
              },
              {
                l: "Collection rate",
                v: `${num(overview.collection_pct)}%`,
                delta: (
                  <span className="text-xs text-[var(--muted)]">
                    {overview.invoice_count} bills · avg {inr(num(overview.avg_invoice_value))}
                  </span>
                ),
                spark: seriesFrom(trend, "bills"),
                color: "var(--chart-4)",
                cumulative: false,
              },
            ].map((c) => (
              <div key={c.l} className="surface-card overflow-hidden p-4">
                <p className="rule-label text-[var(--muted)]">{c.l}</p>
                <p className="mt-2 font-display text-[26px] font-semibold leading-none tracking-tight">
                  {c.v}
                </p>
                <div className="mt-2">{c.delta}</div>
                <div className="-mx-1 mt-2">
                  <Sparkline values={c.spark} color={c.color} cumulative={c.cumulative} />
                </div>
              </div>
            ))}
          </div>

          {/* ------------------------------------------------- the money band */}
          <MoneyBand
            pace={derived.pace}
            collectionDays={derived.collectionDays}
            overdue={derived.cash.overdue}
            outstanding={derived.outstanding}
          />

          {/* ------------------------------------------------- trend + ageing */}
          <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
            <Panel title="Revenue & cash trend" hint="Billed against what actually came in, day by day">
              <TrendChart data={trend} />
            </Panel>
            <Panel
              title="Outstanding ageing"
              hint="How old your unpaid money is"
              action={
                <Link href="/collections" className="shrink-0 text-xs font-semibold text-[var(--brand)]">
                  Collect →
                </Link>
              }
            >
              <AgeingChart data={overview.ageing || []} />
            </Panel>
          </div>

          {/* ------------------------------------------ calendar + split + gst */}
          <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
            <Panel
              title="Billing calendar"
              hint="Every day of the period — dark means a strong day, blank means nothing was raised"
            >
              <CashCalendar days={derived.calendar.days} max={derived.calendar.max} />
            </Panel>
            <Panel title="Where your billed money sits" hint="Of everything invoiced this period">
              <CashSplitBar segments={derived.cash.segments} total={derived.cash.total} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.15fr]">
            <Panel title="GST liability" hint="What you owe the department this period">
              <GstDonut
                cgst={num(overview.gst_cgst)}
                sgst={num(overview.gst_sgst)}
                igst={num(overview.gst_igst)}
              />
              <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
                Taxable {inr(num(overview.gst_taxable))}. Export GSTR-1 JSON from Books when you are
                ready to file.
              </p>
            </Panel>

            <Panel title="Your billing week" hint="Where the volume actually lands">
              <WeekdayBars rows={derived.weekday.rows} best={derived.weekday.best} />
            </Panel>

            <Panel
              title="Who your revenue depends on"
              hint="Top buyers and their share of the period"
              action={
                <Link href="/customers" className="shrink-0 text-xs font-semibold text-[var(--brand)]">
                  Customers →
                </Link>
              }
            >
              <ConcentrationPanel
                rows={derived.concentration.rows}
                top1={derived.concentration.top1}
                top3={derived.concentration.top3}
                risk={derived.concentration.risk}
              />
            </Panel>
          </div>

          {/* -------------------------------------------- late + quiet + tips */}
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr_1.15fr]">
            <Panel
              title="Chase these first"
              hint="Biggest overdue amounts, worst delays"
              action={
                <Link href="/collections" className="shrink-0 text-xs font-semibold text-[var(--brand)]">
                  Remind →
                </Link>
              }
            >
              <LatePayersTable rows={overview.late_payers || []} />
            </Panel>

            <Panel
              title="Regulars gone quiet"
              hint="Repeat buyers who have not ordered in a while"
              action={
                <Link href="/grow" className="shrink-0 text-xs font-semibold text-[var(--brand)]">
                  Grow →
                </Link>
              }
            >
              <QuietRegulars rows={overview.quiet_regulars || []} />
            </Panel>

            <section className="surface-card border-[var(--brand)]/20 bg-[linear-gradient(160deg,#fff_0%,var(--brand-soft)_130%)] p-5">
              <h2 className="font-display text-[17px] font-semibold tracking-tight">What to do next</h2>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                Read off your own numbers, not generic advice
              </p>
              <ul className="mt-4 space-y-2.5">
                {tips.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-xl border border-white/80 bg-white/85 p-3 shadow-[var(--shadow-sm)]"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                          t.severity === "high"
                            ? "bg-[var(--danger)]"
                            : t.severity === "medium"
                              ? "bg-[var(--warn)]"
                              : "bg-[var(--ok)]"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold leading-snug">{t.title}</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{t.body}</p>
                        <Link
                          href={t.actionHref}
                          className="mt-1.5 inline-block text-[11px] font-semibold text-[var(--brand)]"
                        >
                          {t.actionLabel} →
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* --------------------------------------------- pipeline + recent */}
          <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
            <Panel title="Pipeline & activity" hint="Status of everything raised this period">
              <div className="flex flex-wrap gap-2">
                {Object.entries(overview.status_breakdown || {}).map(([k, v]) => (
                  <Pill key={k}>
                    {k}: {v}
                  </Pill>
                ))}
                {!Object.keys(overview.status_breakdown || {}).length && (
                  <p className="text-sm text-[var(--muted)]">No status data yet.</p>
                )}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
                {[
                  { l: "Customers", v: overview.customer_count, s: `+${overview.new_customers} new`, c: "var(--ok)" },
                  { l: "Reminders", v: overview.reminders_sent, s: "sent this period", c: "var(--muted)" },
                  { l: "Drafts", v: overview.draft_count, s: "awaiting approval", c: "var(--warn)" },
                ].map((b) => (
                  <div key={b.l} className="rounded-xl bg-[var(--bg)] p-3">
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{b.l}</p>
                    <p className="mt-1 font-display text-xl font-semibold">{String(b.v)}</p>
                    <p className="text-[10px]" style={{ color: b.c }}>
                      {b.s}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/invoices/manual"
                  className="rounded-full bg-[var(--ink)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--brand)]"
                >
                  Quick bill
                </Link>
                <Link
                  href="/smart-invoice"
                  className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-xs font-semibold"
                >
                  Smart invoice
                </Link>
                <Link
                  href="/recurring"
                  className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-xs font-semibold"
                >
                  Recurring
                </Link>
              </div>
            </Panel>

            <section className="surface-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
                <div>
                  <h2 className="font-display text-[17px] font-semibold tracking-tight">Recent invoices</h2>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">Latest activity across the book</p>
                </div>
                <Link href="/invoices" className="text-xs font-semibold text-[var(--brand)]">
                  All invoices →
                </Link>
              </div>
              <ul className="divide-y divide-[var(--line)]">
                {recent.length === 0 && (
                  <li className="px-5 py-8 text-center text-sm text-[var(--muted)]">No invoices yet.</li>
                )}
                {recent.map((inv) => (
                  <li key={String(inv.id)}>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition hover:bg-[var(--bg-elevated)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{String(inv.customer_name || "")}</p>
                        <p className="font-mono text-[11px] text-[var(--muted)]">
                          {String(inv.number || "")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{inr(num(inv.total_amount))}</p>
                        <Pill>{String(inv.money_received ? "paid" : inv.status || "")}</Pill>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}
