"use client";

import { useMemo, useState } from "react";

function inrShort(v: number) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-medium text-[var(--ink)]">{label}</label>
        <span className="font-display text-lg font-semibold tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[var(--brand)] [&::-webkit-slider-thumb]:shadow-[0_1px_6px_rgba(11,18,32,0.3)] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[var(--brand)]"
        style={{
          background: `linear-gradient(90deg, var(--brand) ${pct}%, var(--line) ${pct}%)`,
        }}
      />
      <p className="mt-1.5 text-[11px] text-[var(--muted)]">{hint}</p>
    </div>
  );
}

export function RoiCalculator() {
  const [bills, setBills] = useState(120);
  const [value, setValue] = useState(18000);
  const [overduePct, setOverduePct] = useState(22);
  const [minutes, setMinutes] = useState(9);

  const r = useMemo(() => {
    const monthlySales = bills * value;
    const overdueAmount = (monthlySales * overduePct) / 100;

    // Time: manual minutes per bill vs ~1.5 min on a learned template with autofill.
    const minutesSaved = Math.max(0, minutes - 1.5) * bills;
    const hoursSaved = minutesSaved / 60;

    // Cash: structured ageing + tracked promises typically recover a slice of the
    // overdue pile ~3 weeks earlier. Valued at 14% p.a. working-capital cost.
    const recovered = overdueAmount * 0.35;
    const financeSaved = (recovered * 0.14 * 21) / 365;

    // Errors: wrong tax head / missed bills that quietly never get raised.
    const leakSaved = monthlySales * 0.004;

    const cost = bills <= 60 ? 499 : bills <= 400 ? 1499 : 2999;
    const plan = bills <= 60 ? "Starter" : bills <= 400 ? "Growth" : "CA Desk";

    return {
      monthlySales,
      overdueAmount,
      hoursSaved,
      recovered,
      financeSaved,
      leakSaved,
      cost,
      plan,
      net: financeSaved + leakSaved - cost,
      payback: Math.max(1, Math.round(cost / Math.max(1, (financeSaved + leakSaved) / 30))),
    };
  }, [bills, value, overduePct, minutes]);

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
      <div className="space-y-6">
        <Slider
          label="Bills you raise a month"
          hint="Counts every tax invoice, including the small ones."
          value={bills}
          min={10}
          max={900}
          step={10}
          onChange={setBills}
          display={String(bills)}
        />
        <Slider
          label="Average bill value"
          hint="Rough average across your customers."
          value={value}
          min={1000}
          max={200000}
          step={1000}
          onChange={setValue}
          display={inrShort(value)}
        />
        <Slider
          label="Share of sales that goes overdue"
          hint="Money sitting past its due date at any given time."
          value={overduePct}
          min={0}
          max={60}
          step={1}
          onChange={setOverduePct}
          display={`${overduePct}%`}
        />
        <Slider
          label="Minutes to make one bill today"
          hint="Typing, checking last rate, tax head, printing, sending."
          value={minutes}
          min={2}
          max={30}
          step={1}
          onChange={setMinutes}
          display={`${minutes} min`}
        />
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-md)] sm:p-8">
        <p className="rule-label text-[var(--muted)]">Your month on Quill</p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="font-display text-4xl font-semibold tracking-tight">
              {r.hoursSaved.toFixed(0)}
              <span className="ml-1 text-lg font-medium text-[var(--muted)]">hrs</span>
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Billing time returned to you each month
            </p>
          </div>
          <div>
            <p className="font-display text-4xl font-semibold tracking-tight text-[var(--brand)]">
              {inrShort(r.recovered)}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Overdue money pulled in roughly 3 weeks earlier
            </p>
          </div>
        </div>

        <div className="mt-7 space-y-0 border-t border-[var(--line)]">
          {[
            ["Working-capital cost avoided", inrShort(r.financeSaved), "Cash in your bank instead of your customer's."],
            ["Billing leakage stopped", inrShort(r.leakSaved), "Missed bills, wrong tax head, stale rates."],
            [`Quill ${r.plan} plan`, `− ₹${r.cost.toLocaleString("en-IN")}`, "Unlimited users. No per-invoice charge."],
          ].map(([k, v, sub]) => (
            <div key={k} className="flex items-start justify-between gap-4 border-b border-[var(--line)] py-3">
              <div>
                <p className="text-sm font-medium">{k}</p>
                <p className="text-[11px] text-[var(--muted)]">{sub}</p>
              </div>
              <p className="shrink-0 tabular-nums text-sm font-semibold">{v}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="rule-label text-[var(--muted)]">Net every month</p>
            <p
              className={`font-display text-3xl font-semibold tracking-tight ${
                r.net >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
              }`}
            >
              {r.net >= 0 ? "+" : "−"}
              {inrShort(Math.abs(r.net))}
            </p>
          </div>
          <p className="max-w-[16rem] text-[11px] leading-relaxed text-[var(--muted)]">
            Plus {r.hoursSaved.toFixed(0)} hours you stop spending on typing. Pays for itself in about{" "}
            <span className="font-semibold text-[var(--ink)]">{r.payback} day{r.payback === 1 ? "" : "s"}</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
