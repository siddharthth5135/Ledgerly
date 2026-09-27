"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/SiteChrome";
import { BillDocument, type CustomerSuggestion } from "@/components/BillDocument";
import { inrExact } from "@/lib/format";
import {
  GST_OVERRIDE_KEY,
  GST_SLABS,
  TAX_MODE_KEY,
  billGstPercent,
  billTaxMode,
  computeTotals,
  hasGstColumn,
  isItemEmpty,
  itemAmount,
  itemGstPercent,
  num,
  parseDocumentLayout,
  todayDDMMYYYY,
  type BillItem,
  type BillSpec,
  type TaxMode,
} from "@/lib/bill-spec";

type Template = { id: string; name: string; layout_json: unknown };

type Suggest = CustomerSuggestion & { email: string | null; address?: string | null };

/** Slabs shown as one-tap chips (0.25% gold/diamond slab is reachable via "Custom"). */
const SLAB_CHIPS: number[] = GST_SLABS.filter((s) => s === 0 || s >= 3);

export default function QuickBillPage() {
  const router = useRouter();
  const [userType, setUserType] = useState<"commercial" | "regular">("regular");
  const [template, setTemplate] = useState<Template | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [spec, setSpec] = useState<BillSpec | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [items, setItems] = useState<BillItem[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [suggests, setSuggests] = useState<Suggest[]>([]);
  const [moneyReceived, setMoneyReceived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [aiGhost, setAiGhost] = useState<{
    label: string;
    values: Record<string, string>;
    items: BillItem[];
    customerId?: string | null;
    reason: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, tplRes, listRes, aiRes] = await Promise.all([
          fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
          fetch("/api/templates?default=1", { credentials: "include", cache: "no-store" }),
          fetch("/api/templates", { credentials: "include", cache: "no-store" }),
          fetch("/api/ai/autofill", { credentials: "include", cache: "no-store" }),
        ]);
        const me = await meRes.json();
        const tpl = await tplRes.json();
        const list = await listRes.json().catch(() => ({}));
        const ai = await aiRes.json().catch(() => ({}));
        if (cancelled) return;
        if (me.user?.userType) setUserType(me.user.userType);
        if (Array.isArray(list.templates)) setTemplates(list.templates);
        if (tpl.template) {
          setTemplate(tpl.template);
          const layout = parseDocumentLayout(tpl.template.layout_json);
          if (layout) {
            setSpec(layout.spec);
            setValues({
              invoice_date: todayDDMMYYYY(),
              buyer_state: layout.spec.seller.state || "",
              buyer_code: layout.spec.seller.stateCode || "",
            });
          }
        }
        if (ai.ok) {
          setAiReady(!!ai.ready);
          if (!ai.ready) {
            setAiHint(`Learned autofill unlocks after 10 bills (you have ${ai.invoiceCount || 0}).`);
          } else if (ai.suggestions?.[0]?.kind === "full_bill") {
            const s = ai.suggestions[0];
            setAiGhost({
              label: s.label,
              values: s.values || {},
              items: s.items || [],
              customerId: s.customerId,
              reason: s.reason,
            });
            setAiHint(`Press Tab to fill “${s.label}” — ${s.reason}`);
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tab accepts AI ghost suggestion (IDE-style)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab" || e.shiftKey || !aiGhost) return;
      const t = e.target as HTMLElement | null;
      // only when focus is on the bill (or nowhere special)
      if (t && t.closest && !t.closest(".bill-document") && t.tagName !== "BODY") return;
      // if user is mid-typing a long customer name, let normal tab work unless empty-ish
      const name = (values.customer_name || "").trim();
      if (name.length >= 3 && !aiGhost.values.customer_name?.toLowerCase().startsWith(name.toLowerCase())) return;
      e.preventDefault();
      setCustomerId(aiGhost.customerId || null);
      setValues((v) => ({ ...v, ...aiGhost.values }));
      if (aiGhost.items.length) setItems(aiGhost.items);
      setAiHint(`Filled from history: ${aiGhost.label}. Edit anything, then Create invoice.`);
      setAiGhost(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aiGhost, values.customer_name]);

  const customerName = values.customer_name || "";

  // Refresh AI suggestions while typing customer name
  useEffect(() => {
    if (!aiReady || customerId) return;
    const q = customerName.trim();
    if (q.length < 1) return;
    const t = setTimeout(() => {
      fetch(`/api/ai/autofill?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => {
          const s = (d.suggestions || []).find((x: { kind: string }) => x.kind === "full_bill");
          if (s) {
            setAiGhost({
              label: s.label,
              values: s.values || {},
              items: s.items || [],
              customerId: s.customerId,
              reason: s.reason,
            });
            setAiHint(`Tab → ${s.label} (${s.reason})`);
          }
        })
        .catch(() => {});
    }, 280);
    return () => clearTimeout(t);
  }, [customerName, aiReady, customerId]);

  useEffect(() => {
    if (userType !== "commercial" || customerId || customerName.trim().length < 2) {
      setSuggests([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/customers?autocomplete=1&q=${encodeURIComponent(customerName.trim())}`)
        .then((r) => r.json())
        .then((d) => setSuggests(d.customers || []))
        .catch(() => setSuggests([]));
    }, 220);
    return () => clearTimeout(t);
  }, [customerName, userType, customerId]);

  const totals = useMemo(
    () => (spec ? computeTotals(spec, items, values) : null),
    [spec, items, values]
  );
  const liveItems = useMemo(() => items.filter((it) => !isItemEmpty(it)), [items]);
  const curPct = spec ? billGstPercent(spec, values) : 18;
  const curTaxMode = billTaxMode(values);
  function setTax(pct: number, mode: TaxMode) {
    setValues((v) => {
      const next = { ...v };
      if (spec && pct === spec.totals.gstPercent) delete next[GST_OVERRIDE_KEY];
      else next[GST_OVERRIDE_KEY] = String(pct);
      if (mode === "auto") delete next[TAX_MODE_KEY];
      else next[TAX_MODE_KEY] = mode;
      return next;
    });
  }

  function onValuesChange(next: Record<string, string>) {
    if (next.customer_name !== values.customer_name) setCustomerId(null);
    setValues(next);
  }

  async function applyTemplate(t: Template) {
    setTemplate(t);
    let layoutJson = t.layout_json;
    if (!layoutJson) {
      const res = await fetch(`/api/templates?id=${encodeURIComponent(t.id)}`, { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => null);
      layoutJson = data?.template?.layout_json;
      if (layoutJson) setTemplates((list) => list.map((x) => (x.id === t.id ? { ...x, layout_json: layoutJson } : x)));
    }
    const layout = parseDocumentLayout(layoutJson);
    if (layout) {
      setSpec(layout.spec);
      setValues((v) => ({
        ...v,
        invoice_date: v.invoice_date || todayDDMMYYYY(),
        buyer_state: v.buyer_state || layout.spec.seller.state || "",
        buyer_code: v.buyer_code || layout.spec.seller.stateCode || "",
      }));
    }
  }

  function pickSuggest(c: Suggest & { default_template_id?: string | null }) {
    setCustomerId(c.id);
    setCustomerEmail(c.email || "");
    setCustomerPhone(c.phone || "");
    setValues((v) => ({
      ...v,
      customer_name: c.name,
      gstin: c.gstin || v.gstin || "",
      address: c.address || v.address || (c.city ? c.city : ""),
      buyer_state: (c.state || v.buyer_state || "").toUpperCase(),
      buyer_code: c.gstin ? c.gstin.slice(0, 2) : v.buyer_code || "",
    }));
    setSuggests([]);
    const tid = c.default_template_id;
    if (tid && templates.length) {
      const match = templates.find((t) => t.id === tid);
      if (match) applyTemplate(match);
    }
  }

  async function submit(status: "draft" | "sent") {
    if (saving || !spec) return;
    const name = (values.customer_name || "").trim();
    if (!name) {
      setError("Type the customer name on the bill first.");
      return;
    }
    if (liveItems.length === 0) {
      setError("Add at least one item line (description, qty, rate).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const billPct = billGstPercent(spec, values);
      const noTax = billTaxMode(values) === "none";
      const lines = liveItems.flatMap((it) => {
        const qty = num(it.qty);
        if (qty <= 0) return [];
        const amount = itemAmount(it, spec);
        return [
          {
            description: it.description || "Item",
            hsn: it.hsn || "9997",
            qty,
            // effective rate after a visible discount, so the saved bill matches the page
            rate: +(amount / qty).toFixed(4),
            gst_percent: noTax ? 0 : itemGstPercent(spec, it, billPct),
          },
        ];
      });
      if (lines.length === 0) {
        setError("Enter a quantity and a rate. Amount is quantity × rate.");
        setSaving(false);
        return;
      }
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          customerName: name,
          customerGstin: values.gstin || undefined,
          customerPhone: customerPhone || undefined,
          customerEmail: customerEmail || undefined,
          state: values.buyer_state || undefined,
          lines,
          notes: values.remark || "",
          source: "quick_bill",
          status,
          moneyReceived,
          amountReceived: moneyReceived ? totals?.grand ?? 0 : 0,
          templateId: template?.id,
          fieldValues: {
            ...values,
            // A discount that has no column must not be stored, or it comes back on the next bill
            __items: spec.columns.some((c) => c.enabled && c.key === "disc")
              ? liveItems
              : liveItems.map((it) => ({ ...it, disc: "" })),
          },
          createRazorpay: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Save failed");
        return;
      }
      const invId = data.invoice?.id || data.invoice?.invoice_id;
      if (!invId) {
        setError("Invoice created but id missing — open it from Invoices");
        return;
      }
      router.push(`/invoices/${invId}/print`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Quick bill"
      subtitle={
        spec
          ? `Fill directly on your “${template?.name}” bill. Print is exactly what you see.`
          : "Create your bill design under Smart invoice first."
      }
    >
      {!loaded ? (
        <div className="mx-auto h-[60vh] max-w-4xl animate-pulse rounded-2xl bg-white/60" />
      ) : spec ? (
        <div className="mx-auto max-w-[900px] space-y-3">
          {aiHint && (
            <p className="rounded-xl border border-[var(--brand)]/20 bg-[var(--brand-soft)] px-3 py-2 text-xs text-[var(--brand-deep)]">
              <span className="font-semibold">AI · </span>
              {aiHint}
              {aiGhost && (
                <button
                  type="button"
                  className="ml-2 font-semibold underline"
                  onClick={() => {
                    setCustomerId(aiGhost.customerId || null);
                    setValues((v) => ({ ...v, ...aiGhost.values }));
                    if (aiGhost.items.length) setItems(aiGhost.items);
                    setAiGhost(null);
                    setAiHint(`Filled: ${aiGhost.label}`);
                  }}
                >
                  Accept (Tab)
                </button>
              )}
            </p>
          )}
          {/* Sticky command bar */}
          <div className="sticky top-2 z-40 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[var(--line)] bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
            {templates.length > 1 && (
              <label className="flex items-center gap-2 text-xs font-semibold">
                Template
                <select
                  value={template?.id || ""}
                  onChange={(e) => {
                    const t = templates.find((x) => x.id === e.target.value);
                    if (t) void applyTemplate(t);
                  }}
                  className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-normal"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mr-auto text-sm">
              <span className="text-[var(--muted)]">
                {liveItems.length} item{liveItems.length === 1 ? "" : "s"}
                {" · "}Taxable {inrExact(totals?.basic || 0)}
                {" · "}GST {inrExact((totals?.cgst || 0) + (totals?.sgst || 0) + (totals?.igst || 0))}
              </span>
              <span className="ml-3 text-base font-semibold text-[var(--ink)]">
                {inrExact(totals?.grand || 0)}
              </span>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={moneyReceived}
                onChange={(e) => setMoneyReceived(e.target.checked)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Money received
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => submit("draft")}
              className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold hover:bg-[var(--bg)] disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => submit("sent")}
              className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Create invoice →"}
            </button>
            {error && <p className="w-full text-sm font-medium text-red-600">{error}</p>}

            {/* Tax for THIS bill — slab chips, custom %, no-tax, and CGST+SGST / IGST override */}
            <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--line)] pt-2 text-xs">
              <span className="font-semibold text-[var(--ink)]">GST on this bill</span>
              <div className="flex flex-wrap items-center gap-1">
                {SLAB_CHIPS.map((s) => {
                  const active = curTaxMode !== "none" && curPct === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTax(s, curTaxMode === "none" ? "auto" : curTaxMode)}
                      className={`rounded-full border px-2.5 py-1 font-semibold tabular-nums ${
                        active
                          ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                          : "border-[var(--line)] bg-white text-[var(--ink)] hover:bg-[var(--bg)]"
                      }`}
                      title={s === 0 ? "Zero-rated / exempt goods" : `${s}% GST slab`}
                    >
                      {s}%
                    </button>
                  );
                })}
                <label className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-white px-2 py-0.5">
                  <span className="text-[var(--muted)]">Custom</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={SLAB_CHIPS.includes(curPct) ? "" : curPct}
                    placeholder="7.5"
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (e.target.value === "") return;
                      if (Number.isFinite(n) && n >= 0 && n <= 100) setTax(n, curTaxMode === "none" ? "auto" : curTaxMode);
                    }}
                    className="w-12 bg-transparent text-right font-semibold outline-none"
                  />
                  <span>%</span>
                </label>
              </div>
              <select
                value={curTaxMode}
                onChange={(e) => setTax(curPct, e.target.value as TaxMode)}
                className="rounded-full border border-[var(--line)] bg-white px-2.5 py-1 font-semibold"
                title="How the tax is split"
              >
                <option value="auto">
                  Auto · {totals?.interstate ? "IGST (other state)" : "CGST + SGST (same state)"}
                </option>
                <option value="intra">CGST + SGST</option>
                <option value="inter">IGST</option>
                <option value="none">No tax (Bill of Supply / unregistered)</option>
              </select>
              {curPct !== spec.totals.gstPercent || curTaxMode !== "auto" ? (
                <button
                  type="button"
                  onClick={() => setTax(spec.totals.gstPercent, "auto")}
                  className="text-[var(--brand)] underline"
                >
                  Reset to default {spec.totals.gstPercent}%
                </button>
              ) : (
                <span className="text-[var(--muted)]">
                  Default {spec.totals.gstPercent}% — change it for all bills in Smart invoice → Business details.
                </span>
              )}
              {hasGstColumn(spec) && (
                <span className="w-full text-[var(--muted)]">
                  Your bill has a <b>GST %</b> column: type a rate on any line to override the bill rate for that
                  item; totals split per rate automatically.
                </span>
              )}
            </div>
          </div>

          <p className="px-1 text-xs text-[var(--muted)]">
            Click any blank on the bill and type — it behaves like a document. Items: type in the
            last row and a new row appears automatically; hover a row and press <b>×</b> to remove
            it. Amount, tax, total and words are calculated for you.
            {userType === "commercial" && (
              <>
                {" "}
                Start typing a <b>customer name</b> to autofill their GSTIN, address and state from
                your saved customers.
              </>
            )}
          </p>

          <div className="overflow-x-auto rounded-md bg-[#cfd3d8] p-3 sm:p-6">
            <div className="mx-auto w-[210mm] shadow-[0_2px_18px_rgba(0,0,0,0.25)]">
              <BillDocument
                spec={spec}
                values={values}
                items={items}
                mode="fill"
                onValuesChange={onValuesChange}
                onItemsChange={setItems}
                suggestions={suggests}
                onPickSuggestion={pickSuggest}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">No bill design yet</p>
          <p className="mt-2">
            Go to <a className="underline" href="/smart-invoice">Smart invoice</a>, upload your
            empty + filled bill (or start from the standard GST design), review it, and Save. Then
            come back here.
          </p>
        </div>
      )}
    </AppShell>
  );
}
