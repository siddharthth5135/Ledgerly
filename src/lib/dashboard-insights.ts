/**
 * Derived dashboard metrics. Everything here is computed from what
 * sp_dashboard_overview already returns — no extra round trips.
 */

export type TrendPoint = { day: string; bills: number; amount: number; received: number };

function n(v: unknown) {
  return Number(v || 0);
}

function daysBetween(from: string, to: string) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/** Where the period stands today, and where it lands if the pace holds. */
export function buildPace(opts: {
  periodStart: string;
  periodEnd: string;
  billed: number;
  priorBilled: number;
}) {
  const total = daysBetween(opts.periodStart, opts.periodEnd);
  const today = new Date();
  const start = new Date(opts.periodStart);
  const elapsedRaw = Math.round((today.getTime() - start.getTime()) / 86400000) + 1;
  const elapsed = Math.min(total, Math.max(1, elapsedRaw));
  const perDay = opts.billed / elapsed;
  const projected = perDay * total;
  const priorGap = opts.priorBilled > 0 ? ((projected - opts.priorBilled) / opts.priorBilled) * 100 : null;

  return {
    totalDays: total,
    elapsedDays: elapsed,
    remainingDays: Math.max(0, total - elapsed),
    perDay,
    projected,
    priorGap,
    complete: elapsed >= total,
  };
}

/** Rough days-sales-outstanding: how long your money sits with buyers. */
export function buildCollectionDays(billed: number, outstanding: number, periodDays: number) {
  if (billed <= 0) return { days: 0, verdict: "no sales yet" as const };
  const days = Math.round((outstanding / billed) * periodDays);
  const verdict = days <= 15 ? ("healthy" as const) : days <= 35 ? ("watch" as const) : ("stretched" as const);
  return { days, verdict };
}

/** Revenue concentration — how exposed you are to losing one buyer. */
export function buildConcentration(
  top: Array<{ customer_name: string; bills: number; amount: number }>,
  billed: number
) {
  const rows = (top || []).map((c) => ({
    ...c,
    amount: n(c.amount),
    share: billed > 0 ? (n(c.amount) / billed) * 100 : 0,
  }));
  const top1 = rows[0]?.share || 0;
  const top3 = rows.slice(0, 3).reduce((s, r) => s + r.share, 0);
  const risk = top1 >= 40 ? ("high" as const) : top1 >= 25 ? ("medium" as const) : ("low" as const);
  return { rows, top1, top3, risk };
}

/** Which weekdays actually bring the money in. */
export function buildWeekdayPattern(trend: TrendPoint[]) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const buckets = names.map((label) => ({ label, amount: 0, bills: 0 }));
  for (const p of trend || []) {
    const d = new Date(p.day);
    if (Number.isNaN(d.getTime())) continue;
    const b = buckets[d.getDay()];
    b.amount += n(p.amount);
    b.bills += n(p.bills);
  }
  // Monday-first reads better for a working week.
  const ordered = [...buckets.slice(1), buckets[0]];
  const best = ordered.reduce((a, b) => (b.amount > a.amount ? b : a), ordered[0]);
  return { rows: ordered, best };
}

/** Continuous day-by-day series so gaps show up as gaps, not as missing bars. */
export function buildCalendar(trend: TrendPoint[], periodStart: string, periodEnd: string) {
  const map = new Map<string, TrendPoint>();
  for (const p of trend || []) map.set(String(p.day).slice(0, 10), p);

  const out: Array<{ date: string; amount: number; bills: number; weekday: number }> = [];
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { days: out, max: 0 };

  const today = new Date();
  const stop = end.getTime() > today.getTime() ? today : end;

  for (let d = new Date(start); d.getTime() <= stop.getTime(); d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const hit = map.get(key);
    out.push({
      date: key,
      amount: n(hit?.amount),
      bills: n(hit?.bills),
      weekday: (d.getDay() + 6) % 7, // 0 = Monday
    });
  }
  const max = Math.max(0, ...out.map((o) => o.amount));
  return { days: out, max };
}

/** Billed money split into what landed, what is still in time, and what is late. */
export function buildCashSplit(opts: {
  billed: number;
  collected: number;
  ageing: Array<{ bucket: string; bills: number; amount: number }> | null | undefined;
}) {
  const ageing = opts.ageing || [];
  const overdue = ageing
    .filter((a) => a.bucket !== "current")
    .reduce((s, a) => s + n(a.amount), 0);
  const notDue = Math.max(0, opts.billed - opts.collected - overdue);
  const total = Math.max(1, opts.billed);
  return {
    total,
    segments: [
      { key: "collected", label: "In your bank", amount: opts.collected, color: "var(--ok)" },
      { key: "notdue", label: "Not due yet", amount: notDue, color: "var(--chart-1)" },
      { key: "overdue", label: "Overdue", amount: overdue, color: "var(--danger)" },
    ].filter((s) => s.amount > 0),
    overdue,
    notDue,
  };
}
