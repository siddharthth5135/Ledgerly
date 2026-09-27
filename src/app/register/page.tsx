"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { useSessionUser } from "@/components/SiteChrome";

export default function RegisterPage() {
  const router = useRouter();
  const { adopt } = useSessionUser();
  const [form, setForm] = useState({
    businessName: "",
    ownerName: "",
    email: "",
    phone: "",
    password: "",
    userType: "regular" as "regular" | "commercial",
    gstin: "",
    city: "",
    state: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Registration failed");
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
      router.push("/dashboard");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-[var(--line)] bg-white p-8">
        <BrandLogo href="/" size="md" />
        <h1 className="mt-6 font-display text-3xl font-semibold">Create business account</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          You become the Owner. Later you can add staff with Invoices + Quick Bill only.
        </p>
        <form onSubmit={onSubmit} className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">
            Business name
            <input
              required
              value={form.businessName}
              onChange={(e) => set("businessName", e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Your name
            <input
              value={form.ownerName}
              onChange={(e) => set("ownerName", e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Email
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Phone (WhatsApp)
            <input
              required
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium">Client type</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    v: "commercial" as const,
                    t: "Commercial",
                    d: "Offices/factories — fewer bills, bigger value, customer autofill + GST",
                  },
                  {
                    v: "regular" as const,
                    t: "Regular",
                    d: "Shops/restaurants — high bill volume, visit insights",
                  },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => set("userType", o.v)}
                  className={`rounded-2xl border p-3 text-left text-sm ${
                    form.userType === o.v
                      ? "border-[var(--brand)] bg-[var(--brand)]/5"
                      : "border-[var(--line)]"
                  }`}
                >
                  <p className="font-semibold">{o.t}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{o.d}</p>
                </button>
              ))}
            </div>
          </fieldset>
          {form.userType === "commercial" && (
            <>
              <label className="text-sm font-medium">
                Your GSTIN
                <input
                  value={form.gstin}
                  onChange={(e) => set("gstin", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm font-medium">
                City
                <input
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                State
                <input
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                />
              </label>
            </>
          )}
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-[var(--brand)] py-3 text-sm font-semibold text-white sm:col-span-2 disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--brand)]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
