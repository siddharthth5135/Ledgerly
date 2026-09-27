"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { AppShell } from "@/components/SiteChrome";
import { fileToBillJpeg } from "@/lib/bill-preview-client";
import { parseDocumentLayout, type BillItem, type BillSpec, type DocumentLayout } from "@/lib/bill-spec";
import type { DetectedField } from "@/lib/bill-analyze";
import { applyProfileToSpec, type BusinessProfile } from "@/lib/business-profile";
import { DesignEditor } from "./DesignEditor";

type DetectedSeller = {
  name: string;
  gstin: string;
  state: string;
  stateCode: string;
  address: string;
  bank: BillSpec["bank"];
  gstPercent: number;
};

type Template = {
  id: string;
  name: string;
  is_default: boolean;
  is_active?: boolean;
  layout_json: unknown;
  ocr_raw?: { detected?: DetectedField[]; method?: string } | null;
  updated_at: string;
};

const GENERIC_ITEMS: BillItem[] = [
  { description: "Sample product — long names wrap neatly onto the next line", hsn: "3208", qty: "2", unit: "Pcs", rate: "450", disc: "0" },
  { description: "Second item", hsn: "8302", qty: "10", unit: "Nos", rate: "42.50", disc: "25" },
];

function previewFor(spec: BillSpec): { values: Record<string, string>; items: BillItem[] } {
  const s = spec.sample || {};
  const values: Record<string, string> = {
    customer_name: s.customer_name || "Sample Customer Pvt. Ltd.",
    address: s.address || "12, Market Road, Near Station\nAhmedabad – 380001",
    buyer_state: s.buyer_state || spec.seller.state || "",
    buyer_code: s.buyer_code || spec.seller.stateCode || "",
    gstin: s.gstin || "",
    invoice_no: s.invoice_no || "001",
    invoice_date: s.invoice_date || "01-04-2026",
  };
  for (const [k, v] of Object.entries(s)) if (!(k in values)) values[k] = v;
  const items = spec.sampleItems && spec.sampleItems.length ? spec.sampleItems : GENERIC_ITEMS;
  return { values, items };
}

/* ------------------------------ small UI ------------------------------ */

function DropZone({
  label,
  hint,
  file,
  onFile,
  required,
}: {
  label: string;
  hint: string;
  file: File | null;
  onFile: (f: File | null) => void;
  required?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`flex min-h-[150px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-5 text-center transition ${
        over ? "border-[var(--brand)] bg-[var(--brand)]/5" : file ? "border-emerald-400 bg-emerald-50/60" : "border-[var(--line)] bg-[var(--bg)] hover:border-[var(--brand)]/60"
      }`}
    >
      <input ref={input} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
      <span className="text-sm font-semibold">
        {label} {required ? <span className="text-rose-600">*</span> : <span className="text-xs font-normal text-[var(--muted)]">(optional)</span>}
      </span>
      {file ? (
        <>
          <span className="mt-1 max-w-full truncate text-xs font-medium text-emerald-800">{file.name}</span>
          <span className="mt-0.5 text-[11px] text-emerald-700">{(file.size / 1024).toFixed(0)} KB · click to change</span>
        </>
      ) : (
        <span className="mt-1 text-xs text-[var(--muted)]">{hint}</span>
      )}
    </button>
  );
}

/* --------------------------------- page --------------------------------- */

export default function SmartInvoicePage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("My GST bill");
  const [filledBill, setFilledBill] = useState<File | null>(null);
  const [emptyBill, setEmptyBill] = useState<File | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [layout, setLayout] = useState<DocumentLayout | null>(null);
  const [spec, setSpec] = useState<BillSpec | null>(null);
  const [detected, setDetected] = useState<DetectedField[]>([]);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [previewItems, setPreviewItems] = useState<BillItem[]>(GENERIC_ITEMS);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [detectedSeller, setDetectedSeller] = useState<DetectedSeller | null>(null);

  async function load() {
    const res = await fetch("/api/templates", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setTemplates((data.templates || []).filter((t: Template) => t.is_active !== false));
  }
  async function loadProfile(): Promise<BusinessProfile | null> {
    try {
      const res = await fetch("/api/business", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setProfile(data.profile);
        return data.profile as BusinessProfile;
      }
    } catch {
      /* ignore */
    }
    return null;
  }
  useEffect(() => {
    load();
    loadProfile();
  }, []);

  async function openTemplate(t: Template, det?: DetectedField[], prof?: BusinessProfile | null) {
    let source = t;
    if (!t.layout_json) {
      const res = await fetch(`/api/templates?id=${encodeURIComponent(t.id)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (data?.template) source = data.template as Template;
    }
    const parsed = parseDocumentLayout(source.layout_json);
    // Seller / bank / default GST always come from YOUR business profile, not from the sample bill.
    const l = parsed ? { ...parsed, spec: applyProfileToSpec(parsed.spec, prof ?? profile) } : null;
    setEditing(source);
    setLayout(l);
    setSpec(l ? l.spec : null);
    setDetected(det ?? source.ocr_raw?.detected ?? []);
    setDirty(false);
    setMsg(null);
    setError(null);
    if (l) {
      const p = previewFor(l.spec);
      setPreviewValues(p.values);
      setPreviewItems(p.items);
    }
  }

  function updateSpec(next: BillSpec) {
    setSpec(next);
    setDirty(true);
  }

  async function createTemplate(blank = false) {
    if (!blank && !filledBill) {
      setError("Upload your filled bill — the empty one is optional but improves accuracy.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const fd = new FormData();
      fd.set("name", name.trim() || "My GST bill");
      if (blank) {
        fd.set("blank", "1");
        setStatus("Preparing the standard GST bill…");
      } else {
        setStatus("Reading labels, columns and values from your bill…");
        fd.set("sampleBill", filledBill!);
        if (emptyBill) fd.set("emptyBill", emptyBill);
        try {
          const preview = await fileToBillJpeg(emptyBill || filledBill!, 2);
          fd.set("emptyPreview", new File([preview.blob], "preview.jpg", { type: "image/jpeg" }));
        } catch {
          /* server renders */
        }
        setStatus("Rebuilding your bill as an editable document…");
      }
      const res = await fetch("/api/templates", { method: "POST", body: fd, signal: controller.signal });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid server response" }));
      if (!res.ok || !data.ok) {
        setError(data.error || `Failed (${res.status})`);
        return;
      }
      if (data.profile) setProfile(data.profile);
      openTemplate(data.template, data.detected || [], data.profile || null);
      setDetectedSeller(data.detectedSeller || null);
      const n = (data.detected || []).length;
      setMsg(
        blank
          ? "Standard design ready — check your business details on the right, then Save."
          : data.method === "geometry" || data.method === "geometry+vision"
            ? `Rebuilt from your bill's own grid — ${n} fields read. Click anything on the bill to adjust it, then Save.${
                data.seededProfile ? " Your business details were filled from this bill." : ""
              }`
            : data.method === "ocr" || data.method === "ocr+vision"
              ? `Rebuilt from the picture of your bill — lines and ${n} fields read. Check the text (scans can misread a letter), then Save.`
              : `Rebuilt from the text of your bill (${n} fields). For pixel-exact columns upload the original PDF instead of a photo.`
      );
      setFilledBill(null);
      setEmptyBill(null);
      load();
    } catch (err) {
      setError(err instanceof Error && err.name === "AbortError" ? "Timed out — try a smaller file." : "Upload failed");
    } finally {
      clearTimeout(timer);
      setBusy(false);
      setStatus(null);
    }
  }

  async function save(extra: { setDefault?: boolean; name?: string; isActive?: boolean } = {}, id?: string) {
    const targetId = id || editing?.id;
    if (!targetId) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { id: targetId, ...extra };
      if (!id && spec && layout) body.layoutJson = { ...layout, spec };
      const res = await fetch("/api/templates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Save failed");
        return;
      }
      if (!id) {
        setDirty(false);
        setMsg(extra.setDefault ? "Saved and set as your default — Quick bill uses it now." : "Saved. Quick bill and Print use this design.");
        if (extra.setDefault && editing) setEditing({ ...editing, is_default: true });
        setDetectedSeller(null);
        loadProfile(); // seller/bank/GST edits on the bill were synced to the business profile
      }
      load();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  const s = spec;
  const editorOpen = !!s && !!editing;

  const sellerBanner =
    detectedSeller && s ? (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
        <p className="mr-auto">
          This bill belongs to <b>{detectedSeller.name || "another business"}</b>
          {detectedSeller.gstin ? <> (GSTIN {detectedSeller.gstin})</> : null}, but your business is <b>{s.seller.name || profile?.name || "not set"}</b>. The
          design keeps <i>your</i> details on every bill.
        </p>
        <button
          type="button"
          onClick={() => {
            updateSpec({
              ...s,
              seller: {
                ...s.seller,
                name: detectedSeller.name,
                gstin: detectedSeller.gstin,
                state: detectedSeller.state,
                stateCode: detectedSeller.stateCode,
                address: detectedSeller.address || s.seller.address,
              },
              bank: { ...s.bank, ...detectedSeller.bank },
              totals: { ...s.totals, gstPercent: detectedSeller.gstPercent },
            });
            setDetectedSeller(null);
          }}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1 font-semibold"
        >
          Actually, this is my business — use these details
        </button>
        <button type="button" onClick={() => setDetectedSeller(null)} className="font-semibold underline">
          Keep mine
        </button>
      </div>
    ) : null;

  /* ------------------------------- render ------------------------------- */

  return (
    <AppShell
      title="Smart invoice"
      subtitle="Upload your bill once. We rebuild it as an editable document that prints exactly like the original."
      wide={editorOpen}
    >
      {editorOpen ? (
        <DesignEditor
          key={editing.id}
          name={editing.name}
          onRename={(n) => {
            setEditing({ ...editing, name: n });
            save({ name: n });
          }}
          onBack={() => {
            if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
            setEditing(null);
            setSpec(null);
          }}
          spec={s}
          onSpecChange={updateSpec}
          referenceImageUrl={layout?.referenceImageUrl}
          previewValues={previewValues}
          previewItems={previewItems}
          dirty={dirty}
          busy={busy}
          isDefault={editing.is_default}
          onSave={() => save({ setDefault: true })}
          notice={error ? { kind: "error", text: error } : msg ? { kind: "ok", text: msg } : null}
          banner={sellerBanner}
          detected={detected}
          onProfile={setProfile}
        />
      ) : (
        /* ============================== STEP 1 ============================== */
        <div className="mx-auto max-w-3xl space-y-5">
          <ol className="flex items-center justify-center gap-3 text-xs font-medium text-[var(--muted)]">
            <li className="rounded-full bg-[var(--ink)] px-3 py-1 text-white">1 · Upload</li>
            <li>→</li>
            <li className="rounded-full border border-[var(--line)] px-3 py-1">2 · Design on the bill</li>
            <li>→</li>
            <li className="rounded-full border border-[var(--line)] px-3 py-1">3 · Use in Quick bill</li>
          </ol>

          <div className="rounded-3xl border border-[var(--line)] bg-white p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <DropZone label="Filled bill" hint="A real invoice with values (PDF or photo). We learn where values go." file={filledBill} onFile={setFilledBill} required />
              <DropZone label="Empty bill" hint="Same bill without values. Lets us separate labels from values with 100% certainty." file={emptyBill} onFile={setEmptyBill} />
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="min-w-[200px] flex-1 text-xs font-medium text-[var(--muted)]">
                Design name
                <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
              </label>
              <button type="button" disabled={busy || !filledBill} onClick={() => createTemplate(false)} className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50">
                {busy ? status || "Working…" : "Rebuild my bill →"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
              <span>PDFs from Tally / Busy / Excel give pixel-exact columns. Photos work too (labels from text).</span>
              <button type="button" disabled={busy} onClick={() => createTemplate(true)} className="font-semibold text-[var(--brand)] disabled:opacity-50">
                Skip upload — start from the standard GST design
              </button>
            </div>
            {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
          </div>

          {templates.length > 0 && (
            <div className="rounded-3xl border border-[var(--line)] bg-white p-5">
              <h2 className="text-sm font-semibold">Your designs</h2>
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {templates.map((t) => {
                  const ok = !!parseDocumentLayout(t.layout_json);
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2.5">
                      <button type="button" onClick={() => openTemplate(t)} className="flex-1 text-left text-sm font-medium hover:text-[var(--brand)]">
                        {t.name}
                        {t.is_default && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Default</span>}
                        {!ok && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Old format</span>}
                      </button>
                      {!t.is_default && ok && (
                        <button type="button" onClick={() => save({ setDefault: true }, t.id)} className="text-xs font-semibold text-[var(--brand)]">
                          Make default
                        </button>
                      )}
                      <button type="button" onClick={() => save({ isActive: false }, t.id)} className="text-xs text-rose-600" title="Remove design">
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
              {editing && !s && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                  “{editing.name}” was made with the old image engine and can&apos;t be edited. Upload the bills again above — it takes a few seconds.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
