"use client";

import { useMemo } from "react";

function n(v: unknown) {
  return Number(v || 0);
}

/** Dual-series revenue vs received bars (SVG, no chart library). */
export function TrendChart({
  data,
}: {
  data: Array<{ day: string; amount: number; received: number; bills?: number }>;
}) {
  const pts = useMemo(() => {
    const rows = [...(data || [])].slice(-31);
    const max = Math.max(1, ...rows.map((r) => Math.max(n(r.amount), n(r.received))));
    return { rows, max };
  }, [data]);

  if (!pts.rows.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[var(--muted)]">
        No invoices in this period yet — raise a Quick bill to see the trend.
      </div>
    );
  }

  const w = 640;
  const h = 200;
  const pad = { t: 12, r: 8, b: 28, l: 8 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const gap = 0.28;
  const slot = innerW / pts.rows.length;
  const barW = slot * (1 - gap);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-52 w-full min-w-[480px]" role="img" aria-label="Revenue trend">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={pad.l}
            x2={w - pad.r}
            y1={pad.t + innerH * (1 - f)}
            y2={pad.t + innerH * (1 - f)}
            stroke="var(--line)"
            strokeDasharray="3 4"
          />
        ))}
        {pts.rows.map((r, i) => {
          const x = pad.l + i * slot + (slot * gap) / 2;
          const ah = (n(r.amount) / pts.max) * innerH;
          const rh = (n(r.received) / pts.max) * innerH;
          const label = String(r.day).slice(8, 10) || String(i + 1);
          return (
            <g key={String(r.day) + i}>
              <rect
                x={x}
                y={pad.t + innerH - ah}
                width={barW}
                height={ah}
                rx={3}
                fill="var(--chart-1)"
                opacity={0.9}
                style={{ transformOrigin: `${x + barW / 2}px ${pad.t + innerH}px`, animation: "draw-bar 0.5s ease both" }}
              >
                <title>{`${r.day}: billed ₹${n(r.amount).toLocaleString("en-IN")}, received ₹${n(r.received).toLocaleString("en-IN")}`}</title>
              </rect>
              <rect
                x={x}
                y={pad.t + innerH - rh}
                width={barW * 0.55}
                height={rh}
                rx={2}
                fill="var(--chart-3)"
                opacity={0.95}
              />
              <text x={x + barW / 2} y={h - 8} textAnchor="middle" fontSize="9" fill="var(--muted)">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--chart-1)]" /> Billed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--chart-3)]" /> Received
        </span>
      </div>
    </div>
  );
}

/** Horizontal ageing buckets. */
export function AgeingChart({
  data,
}: {
  data: Array<{ bucket: string; bills: number; amount: number }>;
}) {
  const order = ["current", "1-30", "31-60", "61-90", "90+"];
  const labels: Record<string, string> = {
    current: "Not due yet",
    "1-30": "1–30 days",
    "31-60": "31–60 days",
    "61-90": "61–90 days",
    "90+": "90+ days",
  };
  const colors: Record<string, string> = {
    current: "var(--chart-3)",
    "1-30": "var(--chart-1)",
    "31-60": "var(--warn)",
    "61-90": "var(--accent)",
    "90+": "var(--danger)",
  };
  const rows = order.map((b) => data.find((d) => d.bucket === b) || { bucket: b, bills: 0, amount: 0 });
  const max = Math.max(1, ...rows.map((r) => n(r.amount)));

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.bucket}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium">{labels[r.bucket]}</span>
            <span className="tabular-nums text-[var(--muted)]">
              ₹{Math.round(n(r.amount)).toLocaleString("en-IN")} · {r.bills}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(n(r.amount) / max) * 100}%`, background: colors[r.bucket] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Simple donut for GST split. */
export function GstDonut({
  cgst,
  sgst,
  igst,
}: {
  cgst: number;
  sgst: number;
  igst: number;
}) {
  const parts = [
    { l: "CGST", v: n(cgst), c: "var(--chart-1)" },
    { l: "SGST", v: n(sgst), c: "var(--chart-3)" },
    { l: "IGST", v: n(igst), c: "var(--chart-2)" },
  ].filter((p) => p.v > 0);
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;

  if (parts.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No GST in this period.</p>;
  }

  return (
    <div className="flex items-center gap-5">
      <svg width="110" height="110" viewBox="0 0 110 110" aria-hidden>
        <g transform="translate(55,55) rotate(-90)">
          {parts.map((p) => {
            const len = (p.v / total) * c;
            const el = (
              <circle
                key={p.l}
                r={r}
                fill="none"
                stroke={p.c}
                strokeWidth="14"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="55" y="52" textAnchor="middle" className="fill-[var(--ink)]" fontSize="11" fontWeight="700">
          ₹{Math.round(total).toLocaleString("en-IN")}
        </text>
        <text x="55" y="66" textAnchor="middle" className="fill-[var(--muted)]" fontSize="9">
          GST
        </text>
      </svg>
      <ul className="space-y-1.5 text-xs">
        {parts.map((p) => (
          <li key={p.l} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.c }} />
            <span className="font-medium">{p.l}</span>
            <span className="tabular-nums text-[var(--muted)]">₹{Math.round(p.v).toLocaleString("en-IN")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DeltaBadge({ current, prior, label }: { current: number; prior: number; label?: string }) {
  if (!prior && !current) return null;
  if (!prior) return <span className="text-xs font-semibold text-[var(--ok)]">New</span>;
  const pct = ((current - prior) / prior) * 100;
  const up = pct >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(pct))}%{label ? ` ${label}` : ""}
    </span>
  );
}
