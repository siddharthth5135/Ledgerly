"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { useSessionUser } from "@/components/SiteChrome";

const DEMO_EMAIL = "owner@demopackers.in";
const DEMO_PASSWORD = "Password@123";

export default function LoginClient() {
  const router = useRouter();
  const { adopt } = useSessionUser();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [showPw, setShowPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Login failed");
        return;
      }
      if (data.user) {
        adopt({
          name: data.user.name,
          role: data.user.role,
          userType: data.user.userType,
          businessName: data.user.businessName,
        });
      }
      const dest =
        data.user?.role === "staff"
          ? "/invoices"
          : next.startsWith("/")
            ? next
            : "/dashboard";
      router.push(dest);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      {/* ---------------------------------------------------- brand column */}
      <aside className="hero-mesh grain blueprint relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14">
        <div className="relative">
          <BrandLogo href="/" dark size="md" />
        </div>

        <div className="relative max-w-md">
          <p className="rule-label text-[var(--accent)]">Since you were last here</p>
          <h2 className="mt-5 font-display text-[clamp(1.9rem,3vw,2.6rem)] font-semibold leading-[1.06] tracking-[-0.03em]">
            Three buyers paid.
            <br />
            <span className="text-white/45">Two still owe you.</span>
          </h2>

          <div className="mt-8 space-y-2.5">
            {[
              { l: "Not due yet", v: "₹4,21,508", pct: 72, c: "var(--ok)" },
              { l: "1–30 days late", v: "₹86,555", pct: 26, c: "var(--chart-1)" },
              { l: "60+ days late", v: "₹18,900", pct: 7, c: "var(--danger)" },
            ].map((b) => (
              <div key={b.l}>
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="text-white/60">{b.l}</span>
                  <span className="tabular-nums text-white/40">{b.v}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: b.c }} />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 border-l-2 border-[var(--accent)]/50 pl-4 text-sm leading-relaxed text-white/50">
            Reminders are drafted and waiting. Two recurring bills need your approval before they go
            out. Your August sales register is ready for the CA.
          </p>
        </div>

        <div className="relative flex flex-wrap gap-x-8 gap-y-3 border-t border-white/12 pt-6">
          {[
            ["GSTR-1", "ready"],
            ["e-Invoice", "connected"],
            ["Backups", "hourly"],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">{k}</p>
              <p className="mt-0.5 text-sm font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </aside>

      {/* ----------------------------------------------------- form column */}
      <main className="flex items-center justify-center bg-white px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <BrandLogo href="/" size="md" />
          </div>

          <p className="mt-8 rule-label text-[var(--muted)] lg:mt-0">Sign in</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em]">
            Welcome back.
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Pick up where your bills and your money left off.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="text-[13px] font-medium">
                Email or phone
              </label>
              <input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--brand)] focus:bg-white"
                autoComplete="username"
                placeholder="you@yourbusiness.in"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="password" className="text-[13px] font-medium">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[12px] text-[var(--muted)] underline-offset-2 hover:text-[var(--brand)] hover:underline"
                >
                  Forgot?
                </Link>
              </div>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsOn(e.getModifierState?.("CapsLock") ?? false)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3.5 py-3 pr-16 text-sm outline-none transition focus:border-[var(--brand)] focus:bg-white"
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--ink)]"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
              {capsOn && (
                <p className="mt-1.5 text-[12px] text-[var(--warn)]">Caps Lock is on.</p>
              )}
            </div>

            {error && (
              <p className="rounded-lg border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3.5 py-2.5 text-[13px] text-[var(--danger)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--brand)] disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
              {!loading && (
                <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>
                  →
                </span>
              )}
            </button>
          </form>

          <p className="mt-6 text-sm text-[var(--muted)]">
            New here?{" "}
            <Link href="/register" className="font-semibold text-[var(--brand)] underline-offset-2 hover:underline">
              Create an account
            </Link>
          </p>

          <div className="mt-10 flex items-start justify-between gap-4 border-t border-[var(--line)] pt-5">
            <div>
              <p className="rule-label text-[var(--muted)]">Demo account</p>
              <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-[var(--muted)]">
                {DEMO_EMAIL}
                <br />
                {DEMO_PASSWORD}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEmail(DEMO_EMAIL);
                setPassword(DEMO_PASSWORD);
                setError(null);
              }}
              className="shrink-0 rounded-full border border-[var(--line)] px-3.5 py-1.5 text-[12px] font-semibold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              Fill it in
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
