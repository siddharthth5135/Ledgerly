"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/SiteChrome";
import { inr } from "@/lib/format";
import { Pill } from "@/components/Pill";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  address_line1: string | null;
  visit_count: number;
  invoice_count: number;
  total_purchases: string | number;
  last_purchase_at: string | null;
  tags: string[] | null;
  customer_kind: string;
  default_template_id?: string | null;
};

type Insights = {
  total_customers: string | number;
  regulars: string | number;
  quiet_over_14_days: string | number;
  new_in_period: string | number;
};

type Tpl = { id: string; name: string };

const PERIODS = ["weekly", "monthly", "quarterly", "yearly"] as const;

export default function CustomersPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("monthly");
  const [userType, setUserType] = useState<"commercial" | "regular">("regular");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    gstin: "",
    email: "",
    addressLine1: "",
    city: "",
    state: "",
  });

  async function load(q = search) {
    const [res, tplRes] = await Promise.all([
      fetch(`/api/customers?period=${period}${q ? `&search=${encodeURIComponent(q)}` : ""}`),
      fetch("/api/templates"),
    ]);
    const data = await res.json();
    const tpl = await tplRes.json().catch(() => ({}));
    if (data.ok) {
      setCustomers(data.customers || []);
      setInsights(data.insights || null);
      setUserType(data.userType || "regular");
    }
    if (Array.isArray(tpl.templates)) {
      setTemplates(tpl.templates.map((t: Tpl) => ({ id: t.id, name: t.name })));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function setDefaultTemplate(customerId: string, defaultTemplateId: string) {
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: customerId,
        defaultTemplateId: defaultTemplateId || null,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      setMsg(data.error || "Could not set template");
      return;
    }
    setMsg("Default bill template saved");
    load();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Save failed");
      return;
    }
    setMsg("Customer saved");
    setForm({
      name: "",
      phone: "",
      gstin: "",
      email: "",
      addressLine1: "",
      city: "",
      state: "",
    });
    load();
  }

  const commercial = userType === "commercial";

  return (
    <AppShell
      title="Customers"
      subtitle={
        commercial
          ? "B2B profiles with GST & address — power autofill on Quick bill."
          : "High-volume shoppers — track visits, bills, and who went quiet."
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
              period === p ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white"
            }`}
          >
            {p}
          </button>
        ))}
        <Pill>{userType}</Pill>
      </div>

      {insights && (
        <div className="mb-8 grid gap-4 sm:grid-cols-4">
          {[
            { l: "Customers", v: insights.total_customers },
            { l: "Regulars", v: insights.regulars },
            { l: "Quiet >14 days", v: insights.quiet_over_14_days },
            { l: "New in period", v: insights.new_in_period },
          ].map((c) => (
            <div key={c.l} className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <p className="text-xs text-[var(--muted)]">{c.l}</p>
              <p className="font-display text-3xl font-semibold">{c.v}</p>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={save}
        className="mb-8 grid gap-3 rounded-3xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2"
      >
        <p className="font-display text-lg font-semibold sm:col-span-2">Add / update customer</p>
        <input
          required
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
        />
        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
        />
        {commercial && (
          <>
            <input
              placeholder="GSTIN"
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
            <input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
            <input
              placeholder="Address"
              value={form.addressLine1}
              onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              placeholder="City"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
            <input
              placeholder="State"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
          </>
        )}
        <button
          type="submit"
          className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white sm:col-span-2"
        >
          Save customer
        </button>
        {msg && <p className="text-sm text-[var(--muted)] sm:col-span-2">{msg}</p>}
      </form>

      <div className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={commercial ? "Search name / GSTIN / phone" : "Search name / phone"}
          className="flex-1 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => load(search)}
          className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
        >
          Search
        </button>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-[var(--line)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--bg)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              {commercial && <th className="px-4 py-3">GSTIN</th>}
              {commercial && <th className="px-4 py-3">City / State</th>}
              <th className="px-4 py-3">Visits</th>
              <th className="px-4 py-3">Bills</th>
              <th className="px-4 py-3">Purchases</th>
              <th className="px-4 py-3">Bill template</th>
              <th className="px-4 py-3">Last buy</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.phone || "—"}</td>
                {commercial && (
                  <td className="px-4 py-3 font-mono text-xs">{c.gstin || "—"}</td>
                )}
                {commercial && (
                  <td className="px-4 py-3 text-xs">
                    {[c.city, c.state].filter(Boolean).join(", ") || "—"}
                  </td>
                )}
                <td className="px-4 py-3">{c.visit_count}</td>
                <td className="px-4 py-3">{c.invoice_count}</td>
                <td className="px-4 py-3">{inr(Number(c.total_purchases))}</td>
                <td className="px-4 py-3">
                  {templates.length ? (
                    <select
                      value={c.default_template_id || ""}
                      onChange={(e) => setDefaultTemplate(c.id, e.target.value)}
                      className="max-w-[140px] rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                    >
                      <option value="">Default</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {c.last_purchase_at
                    ? String(c.last_purchase_at).slice(0, 10)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
