"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BillDocument } from "@/components/BillDocument";
import { FitToWidth } from "@/components/FitToWidth";
import {
  addFreeTextBox,
  duplicateDesignField,
  getDesignPartLayout,
  GST_COLUMN_KEY,
  insertDesignField,
  listHiddenDesign,
  patchDesignField,
  patchDesignPart,
  removeDesignField,
  restoreHiddenDesign,
  shiftDesignFieldLine,
  type Align,
  type BillItem,
  type BillSpec,
  type DesignAnchor,
  type FieldPart,
  type LogoPlacement,
} from "@/lib/bill-spec";
import {
  ZONE_NAMES,
  addGstRateColumn,
  addTableColumn,
  canRemove,
  columnWidthPct,
  fieldParts,
  fieldTitle,
  isSampleValue,
  moveColumn,
  partName,
  partTextSlot,
  setColumnWidthPct,
} from "@/lib/bill-design";
import type { DetectedField } from "@/lib/bill-analyze";
import type { BusinessProfile } from "@/lib/business-profile";

type View = "edit" | "compare" | "overlay";

type Props = {
  name: string;
  onRename: (name: string) => void;
  onBack: () => void;
  spec: BillSpec;
  onSpecChange: (next: BillSpec) => void;
  referenceImageUrl?: string | null;
  previewValues: Record<string, string>;
  previewItems: BillItem[];
  dirty: boolean;
  busy: boolean;
  isDefault: boolean;
  onSave: () => void;
  notice?: { kind: "ok" | "error"; text: string } | null;
  /** Rendered above the canvas (e.g. "this bill belongs to another business") */
  banner?: ReactNode;
  detected: DetectedField[];
  onProfile?: (p: BusinessProfile) => void;
};

/* --------------------------------- icons --------------------------------- */

const ICONS = {
  back: "M15 18l-6-6 6-6",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3",
  redo: "M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M5 12l7 7 7-7",
  left: "M19 12H5M12 5l-7 7 7 7",
  right: "M5 12h14M12 5l7 7-7 7",
  close: "M6 6l12 12M18 6L6 18",
  alignL: "M4 6h16M4 10h10M4 14h16M4 18h10",
  alignC: "M4 6h16M7 10h10M4 14h16M7 18h10",
  alignR: "M4 6h16M10 10h10M4 14h16M10 18h10",
  field: "M3 8h7M3 16h7M13 6h8v4h-8zM13 14h8v4h-8z",
  label: "M4 7h16M4 12h10",
  column: "M4 4h16v16H4zM10 4v16M16 4v16",
  percent: "M19 5L5 19M7 7h.01M17 17h.01",
  text: "M5 6h14M12 6v13M9 19h6",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4",
  restore: "M3 12a9 9 0 109-9M3 4v5h5",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  footer: "M4 4h16v16H4zM4 15h16",
  cursor: "M5 3l6 16 2.5-6.5L20 10z",
} as const;

function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

/* ------------------------------ panel parts ------------------------------ */

function PanelSection({
  title,
  children,
  collapsible,
  defaultOpen = true,
  aside,
}: {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  aside?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-[var(--line)] px-4 py-3 first:border-t-0">
      <div className="mb-2 flex items-center gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
            aria-expanded={open}
          >
            <span className={`inline-block text-[9px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
            {title}
          </button>
        ) : (
          <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{title}</h3>
        )}
        {aside}
      </div>
      {(!collapsible || open) && <div className="space-y-2.5">{children}</div>}
    </section>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
  full,
}: {
  value: T | undefined;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  full?: boolean;
}) {
  return (
    <div className={`${full ? "flex w-full" : "inline-flex"} rounded-lg border border-[var(--line)] bg-[var(--bg)] p-0.5`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold transition ${
            value === o.value ? "bg-white text-[var(--ink)] shadow-sm ring-1 ring-black/5" : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40 ${checked ? "bg-[var(--brand)]" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function ToggleRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${disabled ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <p className="text-[13px] leading-tight text-[var(--ink)]">{label}</p>
        {hint && <p className="text-[11px] leading-tight text-[var(--muted)]">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

function FieldLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium text-[var(--muted)]">{children}</span>
      {aside}
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const cls = "w-full rounded-lg border border-[var(--line)] bg-white px-2.5 py-1.5 text-[13px] text-[var(--ink)] focus:border-[var(--brand)] focus:outline-none";
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} className={`${cls} resize-y`} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </label>
  );
}

function NumberBox({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  placeholder,
  start,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  /** Where the −/+ buttons count from while the value is automatic */
  start?: number;
}) {
  const base = value ?? start ?? min;
  return (
    <div className="flex h-7 items-center rounded-lg border border-[var(--line)] bg-white">
      <button type="button" className="h-full px-1.5 text-[var(--muted)] hover:text-[var(--ink)]" onClick={() => onChange(Math.max(min, +(base - step).toFixed(2)))} aria-label="Decrease">
        −
      </button>
      <input
        type="number"
        value={value ?? ""}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="h-full w-11 border-0 bg-transparent p-0 text-center text-[12px] tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {unit && <span className="pr-1 text-[10px] text-[var(--muted)]">{unit}</span>}
      <button type="button" className="h-full px-1.5 text-[var(--muted)] hover:text-[var(--ink)]" onClick={() => onChange(Math.min(max, +(base + step).toFixed(2)))} aria-label="Increase">
        +
      </button>
    </div>
  );
}

function SliderRow({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-[var(--brand)]" />
        <NumberBox value={value} onChange={onChange} min={min} max={max} step={step} unit={unit} />
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  children,
  onClick,
  disabled,
  tone = "default",
  title,
}: {
  icon?: keyof typeof ICONS;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === "danger"
          ? "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
          : "border-[var(--line)] bg-white text-[var(--ink)] hover:border-slate-300 hover:bg-[var(--bg)]"
      }`}
    >
      {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-[var(--bg)] px-2.5 py-2 text-[11px] leading-snug text-[var(--muted)]">{children}</p>;
}

const ALIGN_OPTIONS: { value: Align; label: ReactNode; title: string }[] = [
  { value: "left", label: <Icon name="alignL" className="h-3.5 w-3.5" />, title: "Align left" },
  { value: "center", label: <Icon name="alignC" className="h-3.5 w-3.5" />, title: "Align centre" },
  { value: "right", label: <Icon name="alignR" className="h-3.5 w-3.5" />, title: "Align right" },
];

/* -------------------------------- helpers -------------------------------- */

/** After an insert, select the element that was added. */
function findInserted(prev: BillSpec, next: BillSpec): DesignAnchor | null {
  const had = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
  const m = next.metaRows.find((r) => !had(prev.metaRows).has(r.id));
  if (m) return { zone: "meta", id: m.id, part: "label" };
  const r = (next.receiver.extraFields || []).find((f) => !had(prev.receiver.extraFields || []).has(f.id));
  if (r) return { zone: "receiver", id: r.id, part: "label" };
  const f = next.footerFields.find((x) => !had(prev.footerFields).has(x.id));
  if (f) return { zone: "footer", id: f.id, part: "label" };
  const b = (next.freeBoxes || []).find((x) => !had(prev.freeBoxes || []).has(x.id));
  if (b) return { zone: "freeBox", id: b.id };
  const prevCols = new Set(prev.columns.filter((c) => c.enabled).map((c) => c.key));
  const c = next.columns.find((x) => x.enabled && !prevCols.has(x.key));
  if (c) return { zone: "column", id: c.key };
  return null;
}

function removeLabel(a: DesignAnchor): string {
  if (a.zone === "bank") return "Hide bank details";
  if (a.zone === "terms") return "Hide terms & conditions";
  if (a.zone === "column") return "Hide column";
  if (a.zone === "freeBox") return "Delete text box";
  const map: Record<string, string> = {
    "header.logo": "Hide logo",
    "header.seller_name": "Hide business name & address",
    "header.seller_address": "Hide business name & address",
    "header.seller_gstin": "Hide your GSTIN",
    "receiver.gstin": "Hide customer GSTIN",
    "receiver.state_row": "Hide customer state & code",
    "totals.rupees": "Hide amount in words",
    "totals.round_off": "Hide round off",
    "totals.total_row": "Hide table total row",
  };
  return map[`${a.zone}.${a.id}`] || "Remove field";
}

/** Width of the selected part on the canvas, in character units. */
function measureSelectedCh(): number | null {
  const el = document.querySelector<HTMLElement>("[data-selected-part]");
  if (!el) return null;
  const probe = document.createElement("span");
  probe.textContent = "0000000000";
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;";
  el.appendChild(probe);
  const ch = probe.getBoundingClientRect().width / 10;
  probe.remove();
  return ch ? Math.max(2, Math.round((el.getBoundingClientRect().width / ch) * 2) / 2) : null;
}

/** Every click lands on a concrete part, so the inspector always has something specific to edit. */
function normalizeAnchor(spec: BillSpec, a: DesignAnchor | null): DesignAnchor | null {
  if (!a) return null;
  if (a.zone === "bank" && a.id === "bank") a = { zone: "bank", id: "bank_name" };
  if (a.part || a.zone === "column" || a.zone === "freeBox") return a;
  const parts = fieldParts(spec, a);
  return parts.length ? { ...a, part: parts[0] } : a;
}

type SectionToggle = { label: string; hint?: string; get: (s: BillSpec) => boolean; set: (s: BillSpec, on: boolean) => BillSpec; disabled?: (s: BillSpec) => boolean };

const SECTION_TOGGLES: SectionToggle[] = [
  { label: "Business name & address", get: (s) => s.header.showSellerName, set: (s, on) => ({ ...s, header: { ...s.header, showSellerName: on } }) },
  {
    label: "Logo",
    hint: "Upload it in the logo settings",
    get: (s) => !!s.header.logoUrl && s.header.showLogo !== false,
    set: (s, on) => ({ ...s, header: { ...s.header, showLogo: on } }),
    disabled: (s) => !s.header.logoUrl,
  },
  { label: "Your GSTIN", get: (s) => s.header.showSellerGstin, set: (s, on) => ({ ...s, header: { ...s.header, showSellerGstin: on } }) },
  { label: "Customer state & code", get: (s) => s.receiver.showState, set: (s, on) => ({ ...s, receiver: { ...s.receiver, showState: on } }) },
  { label: "Customer GSTIN", get: (s) => s.receiver.showGstin, set: (s, on) => ({ ...s, receiver: { ...s.receiver, showGstin: on } }) },
  { label: "Table total row", get: (s) => s.table.showTotalRow, set: (s, on) => ({ ...s, table: { ...s.table, showTotalRow: on } }) },
  { label: "Round off", get: (s) => s.totals.showRoundOff, set: (s, on) => ({ ...s, totals: { ...s.totals, showRoundOff: on } }) },
  { label: "Amount in words", get: (s) => s.rupees.enabled, set: (s, on) => ({ ...s, rupees: { ...s.rupees, enabled: on } }) },
  { label: "Bank details", get: (s) => s.bank.enabled, set: (s, on) => ({ ...s, bank: { ...s.bank, enabled: on } }) },
  { label: "Terms & conditions", get: (s) => s.terms.enabled, set: (s, on) => ({ ...s, terms: { ...s.terms, enabled: on } }) },
];

type AddKind = "meta" | "receiver" | "footer" | "label" | "column" | "gst" | "text" | "anyField";
type Placing = "text" | "field" | null;

const TOOLS: { value: Placing; icon: keyof typeof ICONS; label: string; title: string }[] = [
  { value: null, icon: "cursor", label: "Select", title: "Select and edit (Esc)" },
  { value: "text", icon: "text", label: "Text", title: "Click on the bill to drop a text box there" },
  { value: "field", icon: "field", label: "Label + answer", title: "Click on the bill to drop a label with an answer box" },
];

const ADD_ITEMS: { kind: AddKind; icon: keyof typeof ICONS; label: string; hint: string }[] = [
  { kind: "text", icon: "text", label: "Text box", hint: "Click to place anywhere" },
  { kind: "anyField", icon: "field", label: "Label + answer", hint: "Click to place anywhere" },
  { kind: "meta", icon: "field", label: "Reference field", hint: "Beside invoice no. / date" },
  { kind: "receiver", icon: "user", label: "Customer field", hint: "In the customer block" },
  { kind: "footer", icon: "footer", label: "Footer field", hint: "Above bank details" },
  { kind: "label", icon: "label", label: "Label only", hint: "Text with no answer box" },
  { kind: "column", icon: "column", label: "Table column", hint: "Before Amount" },
  { kind: "gst", icon: "percent", label: "GST % column", hint: "Mixed-rate items" },
];

const DETECTED_ZONE_TITLES: Record<string, string> = {
  header: "Header",
  receiver: "Customer block",
  reference: "Reference fields",
  table: "Item columns",
  footer: "Footer",
  totals: "Totals",
};

/* -------------------------------- editor -------------------------------- */

export function DesignEditor(props: Props) {
  const { spec, onSpecChange } = props;
  const [anchor, setAnchorRaw] = useState<DesignAnchor | null>(null);
  const [view, setView] = useState<View>("edit");
  const [overlay, setOverlay] = useState(55);
  const [nameDraft, setNameDraft] = useState(props.name);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const [placing, setPlacing] = useState<Placing>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const placingRef = useRef<Placing>(null);
  useLayoutEffect(() => {
    placingRef.current = placing;
  }, [placing]);

  const past = useRef<BillSpec[]>([]);
  const future = useRef<BillSpec[]>([]);
  const lastPush = useRef(0);
  const specRef = useRef(spec);
  useLayoutEffect(() => {
    specRef.current = spec;
  }, [spec]);

  const setAnchor = useCallback((a: DesignAnchor | null) => setAnchorRaw(normalizeAnchor(specRef.current, a)), []);

  /** Rapid successive edits (typing, dragging) collapse into one undo step. */
  const commit = useCallback(
    (next: BillSpec) => {
      const now = Date.now();
      if (now - lastPush.current > 600) {
        past.current.push(specRef.current);
        if (past.current.length > 100) past.current.shift();
      }
      lastPush.current = now;
      future.current = [];
      specRef.current = next;
      onSpecChange(next);
      setHist({ undo: past.current.length, redo: 0 });
    },
    [onSpecChange]
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(specRef.current);
    specRef.current = prev;
    lastPush.current = 0;
    onSpecChange(prev);
    setHist({ undo: past.current.length, redo: future.current.length });
  }, [onSpecChange]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(specRef.current);
    specRef.current = next;
    lastPush.current = 0;
    onSpecChange(next);
    setHist({ undo: past.current.length, redo: future.current.length });
  }, [onSpecChange]);

  const insert = useCallback(
    (next: BillSpec) => {
      const prev = specRef.current;
      commit(next);
      const a = findInserted(prev, next);
      if (a) setAnchorRaw(a);
    },
    [commit]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === "Escape" && placingRef.current) {
        setPlacing(null);
        return;
      }
      if (typing) return;
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Escape") {
        setAnchorRaw(null);
        return;
      }
      if (!anchor) return;
      const cur = specRef.current;
      if ((e.key === "Delete" || e.key === "Backspace") && canRemove(cur, anchor)) {
        e.preventDefault();
        commit(removeDesignField(cur, anchor));
        setAnchorRaw(null);
      } else if (mod && k === "d") {
        e.preventDefault();
        insert(duplicateDesignField(cur, anchor));
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && (anchor.zone === "meta" || anchor.zone === "footer")) {
        e.preventDefault();
        commit(shiftDesignFieldLine(cur, anchor, e.key === "ArrowUp" ? -1 : 1));
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && anchor.zone === "column" && anchor.id) {
        e.preventDefault();
        commit(moveColumn(cur, anchor.id, e.key === "ArrowLeft" ? -1 : 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, commit, insert, undo, redo]);

  // Drop the selection if the selected element disappeared (undo, hide, label-only…)
  const liveAnchor = useMemo(() => {
    if (!anchor) return null;
    if (anchor.zone === "column") return spec.columns.some((c) => c.key === anchor.id && c.enabled) ? anchor : null;
    if (anchor.zone === "freeBox") return (spec.freeBoxes || []).some((b) => b.id === anchor.id && b.enabled) ? anchor : null;
    if (anchor.zone === "meta") return spec.metaRows.some((r) => r.id === anchor.id && r.enabled) ? anchor : null;
    if (anchor.zone === "footer") {
      const f = spec.footerFields.find((x) => x.id === anchor.id);
      return f && !f.enabled ? null : anchor;
    }
    if (anchor.zone === "receiver") {
      const f = (spec.receiver.extraFields || []).find((x) => x.id === anchor.id);
      if (f && !f.enabled) return null;
      if (anchor.id === "gstin" && !spec.receiver.showGstin) return null;
      if (anchor.id === "state_row" && !spec.receiver.showState) return null;
      return anchor;
    }
    if (anchor.zone === "bank" && !spec.bank.enabled) return null;
    if (anchor.zone === "terms" && !spec.terms.enabled) return null;
    if (anchor.zone === "header" && anchor.id === "logo" && (!spec.header.logoUrl || spec.header.showLogo === false)) return null;
    return anchor;
  }, [anchor, spec]);

  const hidden = useMemo(() => listHiddenDesign(spec), [spec]);
  const nameChanged = nameDraft.trim() && nameDraft.trim() !== props.name;

  const insertTarget = (zones: DesignAnchor["zone"][], fallback: DesignAnchor): DesignAnchor =>
    liveAnchor && zones.includes(liveAnchor.zone) ? liveAnchor : fallback;

  function addItem(kind: AddKind) {
    const cur = specRef.current;
    if (kind === "meta") insert(insertDesignField(cur, insertTarget(["meta"], { zone: "meta" })));
    else if (kind === "receiver") insert(insertDesignField(cur, { zone: "receiver" }));
    else if (kind === "footer") insert(insertDesignField(cur, insertTarget(["footer"], { zone: "footer" })));
    else if (kind === "label") insert(insertDesignField(cur, insertTarget(["meta", "receiver", "footer"], { zone: "meta" }), { labelOnly: true }));
    else if (kind === "column") insert(addTableColumn(cur));
    else if (kind === "gst") insert(addGstRateColumn(cur));
    else {
      setView("edit");
      setPlacing(kind === "anyField" ? "field" : "text");
    }
  }

  function placeAt(xPct: number, yPct: number) {
    const cur = specRef.current;
    const next = addFreeTextBox(cur, { xPct, yPct: Math.max(0, yPct - 0.6), withValue: placing === "field" });
    const box = (next.freeBoxes || [])[(next.freeBoxes || []).length - 1];
    insert(next);
    setFocusId(box?.id ?? null);
    setPlacing(null);
  }

  const canvas = (
    <BillDocument
      spec={spec}
      values={props.previewValues}
      items={props.previewItems}
      mode="design"
      onSpecChange={commit}
      designAnchor={liveAnchor}
      onDesignAnchor={setAnchor}
      placing={view === "edit" ? placing : null}
      onPlace={placeAt}
      focusId={focusId}
    />
  );

  return (
    <div className="space-y-3">
      {/* ------------------------------ top bar ------------------------------ */}
      <div className="sticky top-0 z-40 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--line)] bg-white/95 px-2.5 py-2 shadow-sm backdrop-blur">
        <button type="button" onClick={props.onBack} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-medium text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]">
          <Icon name="back" /> Designs
        </button>
        <span className="h-5 w-px bg-[var(--line)]" />
        <input
          value={nameDraft}
          aria-label="Design name"
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => nameChanged && props.onRename(nameDraft.trim())}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          className="w-full min-w-0 max-w-[16rem] flex-1 rounded-lg border border-transparent px-2 py-1 text-[14px] font-semibold text-[var(--ink)] hover:border-[var(--line)] focus:border-[var(--brand)] focus:outline-none sm:w-64 sm:flex-none"
        />
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${props.dirty ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${props.dirty ? "bg-amber-500" : "bg-emerald-500"}`} />
          {props.dirty ? "Unsaved changes" : props.isDefault ? "Saved · used for billing" : "Saved"}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Seg<View>
            value={view}
            onChange={(v) => (v === "edit" || props.referenceImageUrl) && setView(v)}
            options={[
              { value: "edit", label: "Design", title: "Edit the bill" },
              { value: "compare", label: "Compare", title: props.referenceImageUrl ? "Original and rebuilt side by side" : "No original uploaded" },
              { value: "overlay", label: "Overlay", title: props.referenceImageUrl ? "Original laid over the rebuilt bill" : "No original uploaded" },
            ]}
          />
          <div className="flex rounded-lg border border-[var(--line)]">
            <button type="button" title="Undo (Ctrl+Z)" disabled={!hist.undo} onClick={undo} className="rounded-l-lg px-2 py-1.5 text-[var(--ink)] hover:bg-[var(--bg)] disabled:opacity-30">
              <Icon name="undo" />
            </button>
            <button type="button" title="Redo (Ctrl+Shift+Z)" disabled={!hist.redo} onClick={redo} className="rounded-r-lg border-l border-[var(--line)] px-2 py-1.5 text-[var(--ink)] hover:bg-[var(--bg)] disabled:opacity-30">
              <Icon name="redo" />
            </button>
          </div>
          <button
            type="button"
            disabled={props.busy || (!props.dirty && props.isDefault)}
            onClick={props.onSave}
            className="rounded-lg bg-[var(--brand)] px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {props.busy ? "Saving…" : props.dirty ? "Save & use for billing" : props.isDefault ? "In use" : "Use for billing"}
          </button>
        </div>
      </div>

      {props.notice && (
        <p className={`rounded-xl px-3 py-2 text-[13px] ${props.notice.kind === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}>{props.notice.text}</p>
      )}
      {props.banner}

      <div className="grid items-start gap-3 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        {/* ----------------------------- left: build ----------------------------- */}
        <aside className="order-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-white xl:sticky xl:top-[68px] xl:order-1 xl:max-h-[calc(100vh-80px)] xl:overflow-y-auto">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">Build</h2>
            <p className="text-[11px] text-[var(--muted)]">Add, show or hide parts of the bill.</p>
          </div>

          <PanelSection title="Add to bill">
            <div className="grid grid-cols-2 gap-1.5">
              {ADD_ITEMS.map(({ kind, icon, label, hint }) => (
                <button
                  key={kind}
                  type="button"
                  disabled={kind === "gst" && spec.columns.some((c) => c.key === GST_COLUMN_KEY && c.enabled)}
                  title={hint}
                  onClick={() => addItem(kind)}
                  className="flex flex-col items-start gap-1 rounded-xl border border-[var(--line)] bg-white px-2.5 py-2 text-left transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name={icon} className="h-4 w-4 text-[var(--brand)]" />
                  <span className="text-[12px] font-semibold leading-tight text-[var(--ink)]">{label}</span>
                  <span className="text-[10px] leading-tight text-[var(--muted)]">{hint}</span>
                </button>
              ))}
            </div>
            <Note>New reference and footer fields go next to the field you selected.</Note>
          </PanelSection>

          <PanelSection title="Sections" collapsible>
            {SECTION_TOGGLES.map((t) => (
              <ToggleRow
                key={t.label}
                label={t.label}
                hint={t.disabled?.(spec) ? t.hint : undefined}
                checked={t.get(spec)}
                disabled={t.disabled?.(spec)}
                onChange={(on) => commit(t.set(spec, on))}
              />
            ))}
          </PanelSection>

          <PanelSection
            title="Hidden items"
            collapsible
            aside={hidden.length ? <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">{hidden.length}</span> : undefined}
          >
            {hidden.length === 0 ? (
              <Note>Nothing hidden. Fields and columns you remove appear here so you can bring them back.</Note>
            ) : (
              <ul className="space-y-1">
                {hidden.map((h) => (
                  <li key={`${h.zone}-${h.id}`} className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-[var(--bg)]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-[var(--ink)]">{h.label || "Untitled"}</span>
                      <span className="block text-[10px] text-[var(--muted)]">{ZONE_NAMES[h.zone]}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        commit(restoreHiddenDesign(spec, h));
                        setAnchor({ zone: h.zone, id: h.id });
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]"
                    >
                      <Icon name="restore" className="h-3 w-3" /> Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PanelSection>

          <PanelSection title="Page layout" collapsible>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-[var(--ink)]">Base text size</span>
              <NumberBox value={spec.page.baseFontSize} min={8} max={14} step={0.5} unit="px" onChange={(n) => commit({ ...spec, page: { ...spec.page, baseFontSize: n } })} />
            </div>
            <SliderRow
              label="Customer block width"
              value={Math.round(spec.layout?.receiverWidth ?? 56)}
              min={30}
              max={75}
              unit="%"
              onChange={(n) => commit({ ...spec, layout: { ...spec.layout, receiverWidth: n } })}
            />
            <SliderRow
              label="Footer left width"
              value={Math.round(spec.layout?.footerLeftWidth ?? 56)}
              min={35}
              max={75}
              unit="%"
              onChange={(n) => commit({ ...spec, layout: { ...spec.layout, footerLeftWidth: n } })}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-[var(--ink)]">Minimum item rows</span>
              <NumberBox value={spec.table.minRows} min={0} max={30} onChange={(n) => commit({ ...spec, table: { ...spec.table, minRows: n } })} />
            </div>
          </PanelSection>

          {props.detected.length > 0 && <DetectedSection detected={props.detected} />}

          <PanelSection title="Shortcuts" collapsible defaultOpen={false}>
            <ul className="space-y-1 text-[11px] text-[var(--muted)]">
              {(
                [
                  ["Click", "Select a label or value"],
                  ["Drag edge", "Resize the selection"],
                  ["Del", "Remove selection"],
                  ["Ctrl+D", "Duplicate field"],
                  ["↑ ↓", "Move field to another row"],
                  ["← →", "Move column"],
                  ["Ctrl+Z", "Undo"],
                  ["Ctrl+Shift+Z", "Redo"],
                  ["Esc", "Clear selection"],
                ] as const
              ).map(([k, d]) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span>{d}</span>
                  <kbd className="rounded border border-[var(--line)] bg-[var(--bg)] px-1.5 py-[1px] font-mono text-[10px] text-[var(--ink)]">{k}</kbd>
                </li>
              ))}
            </ul>
          </PanelSection>
        </aside>

        {/* ------------------------------- canvas ------------------------------- */}
        <section className="order-1 min-w-0 xl:order-2">
          {view === "edit" && (
            <div className="relative z-30 mb-2 flex xl:sticky xl:top-[68px] flex-wrap items-center gap-1 rounded-xl border border-[var(--line)] bg-white/95 p-1 shadow-sm backdrop-blur">
              {TOOLS.map((t) => {
                const on = placing === t.value;
                return (
                  <button
                    key={t.label}
                    type="button"
                    title={t.title}
                    onClick={() => setPlacing(t.value)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
                      on ? "bg-[var(--brand)] text-white shadow-sm" : "text-[var(--ink)] hover:bg-[var(--bg)]"
                    }`}
                  >
                    <Icon name={t.icon} className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
              <span className="ml-auto hidden px-2 text-[11px] text-[var(--muted)] sm:block">
                {placing ? "Click on the bill where it should go · Esc to cancel" : "Pick a tool, then click anywhere on the bill"}
              </span>
            </div>
          )}
          <div className="rounded-2xl bg-[#dfe3e8] p-3 sm:p-6" onClick={() => setAnchorRaw(null)}>
            {view === "compare" && props.referenceImageUrl ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-600">Your original</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={props.referenceImageUrl} alt="Original bill" className="w-full bg-white shadow-[0_2px_18px_rgba(0,0,0,0.18)]" />
                </div>
                <div>
                  <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-600">Rebuilt · editable</p>
                  <FitToWidth>
                    <div className="shadow-[0_2px_18px_rgba(0,0,0,0.18)]">{canvas}</div>
                  </FitToWidth>
                </div>
              </div>
            ) : view === "overlay" && props.referenceImageUrl ? (
              <div className="mx-auto max-w-[210mm]">
                <div className="mb-3 flex items-center gap-3 text-[11px] font-semibold text-slate-600" onClick={(e) => e.stopPropagation()}>
                  <span>Rebuilt</span>
                  <input type="range" min={0} max={100} value={overlay} onChange={(e) => setOverlay(Number(e.target.value))} className="flex-1 accent-[var(--brand)]" />
                  <span>Original</span>
                </div>
                <FitToWidth>
                  <div className="relative shadow-[0_2px_18px_rgba(0,0,0,0.18)]">
                    {canvas}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={props.referenceImageUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full mix-blend-multiply" style={{ opacity: overlay / 100 }} />
                  </div>
                </FitToWidth>
              </div>
            ) : (
              <div className="mx-auto max-w-[210mm]">
                <FitToWidth>
                  <div className="shadow-[0_2px_18px_rgba(0,0,0,0.18)]">{canvas}</div>
                </FitToWidth>
              </div>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
            Click any text to select it · type to edit · drag the ⠿ grip onto another field to place them side by side · blue handles on either side resize
          </p>
        </section>

        {/* --------------------------- right: inspector --------------------------- */}
        <aside className="order-2 overflow-hidden rounded-2xl border border-[var(--line)] bg-white xl:sticky xl:top-[68px] xl:order-3 xl:max-h-[calc(100vh-80px)] xl:overflow-y-auto">
          <Inspector
            spec={spec}
            anchor={liveAnchor}
            commit={commit}
            insert={insert}
            select={setAnchor}
            clear={() => setAnchorRaw(null)}
            onProfile={props.onProfile}
          />
        </aside>
      </div>
    </div>
  );
}

function DetectedSection({ detected }: { detected: DetectedField[] }) {
  const grouped = useMemo(() => {
    const g = new Map<string, DetectedField[]>();
    for (const d of detected) g.set(d.zone, [...(g.get(d.zone) || []), d]);
    return [...g.entries()];
  }, [detected]);
  return (
    <PanelSection title={`Read from your upload · ${detected.length}`} collapsible defaultOpen={false}>
      {grouped.map(([zone, list]) => (
        <div key={zone}>
          <p className="mb-1 text-[11px] font-semibold text-[var(--ink)]">{DETECTED_ZONE_TITLES[zone] || zone}</p>
          <ul className="space-y-0.5">
            {list.map((d, i) => (
              <li key={i} className="flex items-baseline gap-1.5 text-[11px]">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${d.confidence === "high" ? "bg-emerald-500" : d.confidence === "medium" ? "bg-amber-400" : "bg-rose-400"}`}
                  title={`${d.confidence} confidence`}
                />
                <span className="min-w-0 flex-1 break-words">
                  <span className="font-medium text-[var(--ink)]">{d.label}</span>
                  {d.value && <span className="text-[var(--muted)]"> → {d.value}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </PanelSection>
  );
}

/* ------------------------------- inspector ------------------------------- */

type InspectorProps = {
  spec: BillSpec;
  anchor: DesignAnchor | null;
  commit: (next: BillSpec) => void;
  insert: (next: BillSpec) => void;
  select: (a: DesignAnchor | null) => void;
  clear: () => void;
  onProfile?: (p: BusinessProfile) => void;
};

function Inspector({ spec, anchor, commit, insert, select, clear, onProfile }: InspectorProps) {
  if (!anchor) return <DocumentInspector spec={spec} commit={commit} onProfile={onProfile} />;

  const isLogo = anchor.zone === "header" && anchor.id === "logo";
  const title = fieldTitle(spec, anchor);
  const parts = fieldParts(spec, anchor);
  const piece =
    anchor.part && anchor.part !== "logo" && parts.includes(anchor.part) ? partName(anchor, anchor.part, parts) : "";
  const removable = canRemove(spec, anchor);
  const duplicable =
    (anchor.zone === "meta" && spec.metaRows.some((r) => r.id === anchor.id)) ||
    (anchor.zone === "footer" && spec.footerFields.some((f) => f.id === anchor.id)) ||
    (anchor.zone === "receiver" && (spec.receiver.extraFields || []).some((f) => f.id === anchor.id)) ||
    anchor.zone === "freeBox";
  const remove = () => {
    commit(removeDesignField(spec, anchor));
    clear();
  };

  return (
    <div>
      <div className="flex items-start gap-2 border-b border-[var(--line)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand)]">
            {ZONE_NAMES[anchor.zone]}
            {piece ? ` · ${piece}` : ""}
          </p>
          <h2 className="truncate text-[15px] font-semibold text-[var(--ink)]" title={title}>
            {piece ? piece : title || "Untitled"}
          </h2>
          {piece && <p className="truncate text-[11px] text-[var(--muted)]">{title}</p>}
        </div>
        <button type="button" onClick={clear} title="Clear selection (Esc)" className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]">
          <Icon name="close" />
        </button>
      </div>

      {isLogo ? (
        <PanelSection title="Logo">
          <LogoControls spec={spec} commit={commit} onProfile={onProfile} />
        </PanelSection>
      ) : anchor.zone === "column" ? (
        <ColumnInspector spec={spec} anchor={anchor} commit={commit} />
      ) : anchor.zone === "freeBox" ? (
        <FreeBoxInspector spec={spec} anchor={anchor} commit={commit} />
      ) : (
        <PartInspector spec={spec} anchor={anchor} commit={commit} select={select} />
      )}

      {(removable || duplicable) && (
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--line)] px-4 py-3">
          {duplicable && (
            <ActionButton icon="copy" title="Duplicate (Ctrl+D)" onClick={() => insert(duplicateDesignField(spec, anchor))}>
              Duplicate
            </ActionButton>
          )}
          {removable && (
            <ActionButton icon="trash" tone="danger" title="Delete key" onClick={remove}>
              {removeLabel(anchor)}
            </ActionButton>
          )}
        </div>
      )}
      {removable && <p className="px-4 pb-3 text-[10px] text-[var(--muted)]">Hidden items can be restored from the Build panel.</p>}
    </div>
  );
}

function PartInspector({
  spec,
  anchor,
  commit,
  select,
}: {
  spec: BillSpec;
  anchor: DesignAnchor;
  commit: (next: BillSpec) => void;
  select: (a: DesignAnchor | null) => void;
}) {
  const parts = fieldParts(spec, anchor);
  const part: FieldPart | undefined = anchor.part && anchor.part !== "logo" && parts.includes(anchor.part) ? anchor.part : parts[0];
  const slot = partTextSlot(spec, anchor, part);
  const sample = part ? isSampleValue(anchor, part) : false;

  const meta = anchor.zone === "meta" ? spec.metaRows.find((r) => r.id === anchor.id) : undefined;
  const extra = anchor.zone === "receiver" ? (spec.receiver.extraFields || []).find((f) => f.id === anchor.id) : undefined;
  const foot = anchor.zone === "footer" ? spec.footerFields.find((f) => f.id === anchor.id) : undefined;
  const isRecvGstin = anchor.zone === "receiver" && anchor.id === "gstin";
  const custom = meta || extra || foot;
  const isSellerBlock = anchor.zone === "header" && (anchor.id === "seller_name" || anchor.id === "seller_address");

  return (
    <>
      {parts.length > 1 && part && (
        <PanelSection title="Which piece">
          <Seg<FieldPart>
            full
            value={part}
            onChange={(p) => select({ ...anchor, part: p })}
            options={parts.map((p) => ({ value: p, label: partName(anchor, p, parts) }))}
          />
          <Note>The label and the answer are separate. Click either one on the bill — width, alignment and text apply only to that piece.</Note>
        </PanelSection>
      )}

      <PanelSection title="Content">
        {slot ? (
          <TextInput
            label={part ? `${partName(anchor, part, parts)} text` : "Text"}
            value={slot.get(spec)}
            multiline={anchor.id === "seller_address"}
            onChange={(t) => commit(slot.set(spec, t))}
          />
        ) : sample ? (
          <Note>
            This is <b>sample data</b> from your upload. The real value is typed each time you make a bill; here you only design its size and position.
          </Note>
        ) : (
          <Note>Type directly on the bill to change this text. Tax percentages update automatically.</Note>
        )}
      </PanelSection>

      {part && <PartAppearance spec={spec} anchor={anchor} part={part} commit={commit} />}

      {(part === "value" || part === "dateValue") && (
        <PanelSection title="Answer box">
          <TextInput
            label="Placeholder"
            placeholder="Shown in grey when the bill is blank"
            value={getDesignPartLayout(spec, anchor).partStyle?.[part]?.placeholder ?? ""}
            onChange={(t) => commit(patchDesignPart(spec, anchor, part, { placeholder: t }))}
          />
          <TextInput
            label="Default value"
            placeholder="Filled in on every new bill"
            value={getDesignPartLayout(spec, anchor).partStyle?.[part]?.defaultValue ?? ""}
            onChange={(t) => commit(patchDesignPart(spec, anchor, part, { defaultValue: t }))}
          />
          <Note>Works on every bill that uses this design. The client can still change the default while making a bill.</Note>
        </PanelSection>
      )}

      {(custom || isRecvGstin) && (
        <PanelSection title="Field layout">
          {(meta || extra || isRecvGstin) && (
            <SliderRow
              label="Field width (share of the row)"
              value={Math.round((meta ? meta.widthPct : extra ? extra.widthPct : spec.receiver.gstinWidthPct) ?? 100)}
              min={15}
              max={100}
              unit="%"
              onChange={(n) =>
                commit(isRecvGstin ? { ...spec, receiver: { ...spec.receiver, gstinWidthPct: n } } : patchDesignField(spec, anchor, { widthPct: n }))
              }
            />
          )}
          {(meta || extra) && (
            <Note>To line up the label or the answer, select that piece and use Align the box / Align the text. Drag the ⠿ grip to place this field beside another.</Note>
          )}
          {foot?.multiline && !foot.labelOnly && (
            <ToggleRow
              label="Answer beside the label"
              hint="Or drag the ⠿ on the answer up / down"
              checked={!!foot.valueBeside}
              onChange={(on) => commit(patchDesignField(spec, anchor, { valueBeside: on }))}
            />
          )}
          {(meta || (foot && !foot.multiline)) && (
            <div>
              <FieldLabel>Row</FieldLabel>
              <div className="flex gap-1.5">
                <ActionButton icon="up" title="Move to the row above (↑)" onClick={() => commit(shiftDesignFieldLine(spec, anchor, -1))}>
                  Up
                </ActionButton>
                <ActionButton icon="down" title="Move to the row below (↓)" onClick={() => commit(shiftDesignFieldLine(spec, anchor, 1))}>
                  Down
                </ActionButton>
              </div>
              <p className="mt-1 text-[10px] text-[var(--muted)]">Tip: drag the ⠿ grip onto another field to sit side by side.</p>
            </div>
          )}
          {custom && (
            <ToggleRow
              label="Label only"
              hint="No answer box beside the label"
              checked={!!custom.labelOnly}
              onChange={(on) => commit(patchDesignField(spec, anchor, { labelOnly: on }))}
            />
          )}
          {meta && !meta.labelOnly && (
            <ToggleRow label="Date beside value" hint="e.g. Challan no. + Date" checked={meta.withDate} onChange={(on) => commit(patchDesignField(spec, anchor, { withDate: on }))} />
          )}
        </PanelSection>
      )}

      {isSellerBlock && (
        <PanelSection title="Business banner">
          <BannerControls spec={spec} commit={commit} />
          <Note>The name and address come from your business details and print on every bill.</Note>
        </PanelSection>
      )}

      {anchor.zone === "terms" && (
        <PanelSection title="Conditions">
          <ul className="space-y-1.5">
            {spec.terms.lines.map((line, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="w-4 shrink-0 text-right text-[11px] text-[var(--muted)]">{i + 1}.</span>
                <input
                  value={line}
                  onChange={(e) => commit({ ...spec, terms: { ...spec.terms, lines: spec.terms.lines.map((l, j) => (j === i ? e.target.value : l)) } })}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--line)] px-2 py-1 text-[12px] focus:border-[var(--brand)] focus:outline-none"
                />
                <button
                  type="button"
                  title="Remove line"
                  onClick={() => commit({ ...spec, terms: { ...spec.terms, lines: spec.terms.lines.filter((_, j) => j !== i) } })}
                  className="rounded-md p-1 text-[var(--muted)] hover:bg-rose-50 hover:text-rose-600"
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <ActionButton onClick={() => commit({ ...spec, terms: { ...spec.terms, lines: [...spec.terms.lines, "New condition"] } })}>+ Add condition</ActionButton>
        </PanelSection>
      )}

      {anchor.zone === "totals" && (anchor.id === "cgst" || anchor.id === "sgst" || anchor.id === "igst" || anchor.id === "basic" || anchor.id === "grand") && (
        <PanelSection title="Tax">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-[var(--ink)]">Default GST rate</span>
            <NumberBox value={spec.totals.gstPercent} min={0} max={40} step={0.5} unit="%" onChange={(n) => commit({ ...spec, totals: { ...spec.totals, gstPercent: n } })} />
          </div>
          <Note>CGST + SGST or IGST is chosen automatically from the customer&apos;s state on each bill.</Note>
        </PanelSection>
      )}
    </>
  );
}

function PartAppearance({ spec, anchor, part, commit }: { spec: BillSpec; anchor: DesignAnchor; part: FieldPart; commit: (next: BillSpec) => void }) {
  const layout = getDesignPartLayout(spec, anchor);
  const w = layout.partSizes?.[part];
  const al = layout.partAlign?.[part];
  const st = layout.partStyle?.[part];
  const custom =
    w != null || al != null || st?.boxAlign != null || !!st?.placeholder || !!st?.defaultValue || st?.bold != null || st?.fontSize != null;
  const patch = (p: Parameters<typeof patchDesignPart>[3]) => commit(patchDesignPart(spec, anchor, part, p));
  const piece = part === "label" || part === "dateLabel" ? "label" : "answer";

  return (
    <PanelSection
      title="Appearance"
      aside={
        custom ? (
          <button type="button" onClick={() => patch({ reset: true })} className="text-[11px] font-semibold text-[var(--brand)] hover:underline">
            Reset
          </button>
        ) : undefined
      }
    >
      <div>
        <FieldLabel>Align the box</FieldLabel>
        <Seg<Align | "auto">
          full
          value={st?.boxAlign ?? "auto"}
          onChange={(a) => patch({ boxAlign: a === "auto" ? null : a })}
          options={[{ value: "auto", label: "Auto", title: "Stay in the normal flow" }, ...ALIGN_OPTIONS]}
        />
        <p className="mt-1 text-[10px] text-[var(--muted)]">Moves this {piece} left, centre or right in the row.</p>
      </div>
      <div>
        <FieldLabel>Align the text</FieldLabel>
        <Seg<Align | "auto">
          full
          value={al ?? "auto"}
          onChange={(a) => patch({ align: a === "auto" ? null : a })}
          options={[{ value: "auto", label: "Auto", title: "Default text alignment" }, ...ALIGN_OPTIONS]}
        />
        <p className="mt-1 text-[10px] text-[var(--muted)]">Lines up the writing inside this {piece}. Give it a width to see left, centre and right.</p>
      </div>
      <div>
        <FieldLabel
          aside={
            <Seg<"auto" | "fixed">
              value={w != null ? "fixed" : "auto"}
              onChange={(m) => patch({ widthCh: m === "auto" ? null : measureSelectedCh() ?? 12 })}
              options={[
                { value: "auto", label: "Auto", title: "Fit the text" },
                { value: "fixed", label: "Fixed", title: "Set an exact width" },
              ]}
            />
          }
        >
          Width of this {piece}
        </FieldLabel>
        {w != null ? (
          <div className="flex items-center gap-2">
            <input type="range" min={2} max={80} step={0.5} value={w} onChange={(e) => patch({ widthCh: Number(e.target.value) })} className="min-w-0 flex-1 accent-[var(--brand)]" />
            <NumberBox value={w} min={2} max={100} step={0.5} unit="ch" onChange={(n) => patch({ widthCh: n })} />
          </div>
        ) : (
          <p className="text-[11px] text-[var(--muted)]">Grows with the text — nothing is ever cut off. Drag the blue handle on the bill to set a width.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>Text size</FieldLabel>
          <div className="flex items-center gap-1">
            <NumberBox value={st?.fontSize} placeholder="Auto" start={spec.page.baseFontSize || 11} min={6} max={40} step={0.5} unit="px" onChange={(n) => patch({ fontSize: n })} />
            {st?.fontSize != null && (
              <button type="button" title="Back to default size" onClick={() => patch({ fontSize: null })} className="rounded p-0.5 text-[var(--muted)] hover:text-[var(--ink)]">
                <Icon name="close" className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <div>
          <FieldLabel>Weight</FieldLabel>
          <Seg<"auto" | "regular" | "bold">
            full
            value={st?.bold == null ? "auto" : st.bold ? "bold" : "regular"}
            onChange={(m) => patch({ bold: m === "auto" ? null : m === "bold" })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "regular", label: <span className="font-normal">Aa</span>, title: "Regular" },
              { value: "bold", label: <span className="font-extrabold">Aa</span>, title: "Bold" },
            ]}
          />
        </div>
      </div>
    </PanelSection>
  );
}

function ColumnInspector({ spec, anchor, commit }: { spec: BillSpec; anchor: DesignAnchor; commit: (next: BillSpec) => void }) {
  const col = spec.columns.find((c) => c.key === anchor.id);
  if (!col || !anchor.id) return null;
  const visible = spec.columns.filter((c) => c.enabled);
  const idx = visible.findIndex((c) => c.key === col.key);
  const slot = partTextSlot(spec, anchor, undefined);
  const locked = col.key === "description" || col.key === "amount";
  return (
    <>
      <PanelSection title="Column">
        {slot && <TextInput label="Heading" value={slot.get(spec)} onChange={(t) => commit(slot.set(spec, t))} />}
        <div>
          <FieldLabel>Alignment of heading and values</FieldLabel>
          <Seg<Align> full value={col.align} options={ALIGN_OPTIONS} onChange={(a) => commit(patchDesignField(spec, anchor, { align: a }))} />
        </div>
        <SliderRow label="Width (share of the table)" value={columnWidthPct(spec, col.key)} min={3} max={70} unit="%" onChange={(n) => commit(setColumnWidthPct(spec, col.key, n))} />
        <div>
          <FieldLabel>Order</FieldLabel>
          <div className="flex gap-1.5">
            <ActionButton icon="left" title="Move left (←)" disabled={idx <= 0} onClick={() => commit(moveColumn(spec, col.key, -1))}>
              Left
            </ActionButton>
            <ActionButton icon="right" title="Move right (→)" disabled={idx >= visible.length - 1} onClick={() => commit(moveColumn(spec, col.key, 1))}>
              Right
            </ActionButton>
          </div>
        </div>
        {locked && <Note>Description and Amount are required on a GST invoice, so they can&apos;t be hidden.</Note>}
        {col.type === "computed" && <Note>Amount is calculated automatically: Qty × Rate − Discount.</Note>}
      </PanelSection>
    </>
  );
}

function FreeBoxInspector({ spec, anchor, commit }: { spec: BillSpec; anchor: DesignAnchor; commit: (next: BillSpec) => void }) {
  const box = (spec.freeBoxes || []).find((b) => b.id === anchor.id);
  if (!box) return null;
  const patch = (p: Record<string, unknown>) => commit(patchDesignField(spec, anchor, p));
  return (
    <>
      <PanelSection title="Content">
        <TextInput label={box.valueKey ? "Label" : "Text"} value={box.text} multiline={!box.valueKey} onChange={(t) => patch({ text: t })} />
        <ToggleRow
          label="Answer box beside it"
          hint="Adds a blank you fill on every bill (e.g. Vehicle no.)"
          checked={!!box.valueKey}
          onChange={(on) => patch({ valueKey: on ? `${box.id}_value` : undefined, bold: on ? true : box.bold })}
        />
        {box.valueKey && (
          <>
            <TextInput label="Placeholder" placeholder="Grey hint on a blank bill" value={box.placeholder ?? ""} onChange={(t) => patch({ placeholder: t || undefined })} />
            <TextInput label="Default value" placeholder="Filled in on every new bill" value={box.defaultValue ?? ""} onChange={(t) => patch({ defaultValue: t || undefined })} />
          </>
        )}
      </PanelSection>
      <PanelSection title="Appearance">
        <div>
          <FieldLabel>Align the text</FieldLabel>
          <Seg<Align> full value={box.align} options={ALIGN_OPTIONS} onChange={(a) => patch({ align: a })} />
          <p className="mt-1 text-[10px] text-[var(--muted)]">Lines up the writing inside this box. Drag the box to move it.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>Text size</FieldLabel>
            <NumberBox value={box.fontSize ?? 11} min={6} max={40} step={0.5} unit="px" onChange={(n) => patch({ fontSize: n })} />
          </div>
          <div>
            <FieldLabel>Weight</FieldLabel>
            <Seg<"regular" | "bold">
              full
              value={box.bold ? "bold" : "regular"}
              onChange={(m) => patch({ bold: m === "bold" })}
              options={[
                { value: "regular", label: <span className="font-normal">Aa</span>, title: "Regular" },
                { value: "bold", label: <span className="font-extrabold">Aa</span>, title: "Bold" },
              ]}
            />
          </div>
        </div>
      </PanelSection>
      <PanelSection title="Position & size">
        <SliderRow label="Width" value={box.wPct} min={8} max={100} step={0.5} unit="%" onChange={(n) => patch({ wPct: n })} />
        <SliderRow label="From left" value={box.xPct} min={0} max={95} step={0.5} unit="%" onChange={(n) => patch({ xPct: n })} />
        <SliderRow label="From top" value={box.yPct} min={0} max={97} step={0.5} unit="%" onChange={(n) => patch({ yPct: n })} />
        <Note>Or drag the grip beside the box on the bill.</Note>
      </PanelSection>
    </>
  );
}

function BannerControls({ spec, commit }: { spec: BillSpec; commit: (next: BillSpec) => void }) {
  const h = spec.header;
  return (
    <div>
      <FieldLabel>Banner alignment</FieldLabel>
      <Seg<Align> full value={h.bannerAlign ?? "center"} options={ALIGN_OPTIONS} onChange={(a) => commit({ ...spec, header: { ...h, bannerAlign: a } })} />
    </div>
  );
}

function LogoControls({ spec, commit, onProfile }: { spec: BillSpec; commit: (next: BillSpec) => void; onProfile?: (p: BusinessProfile) => void }) {
  const h = spec.header;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placement = h.logoPlacement ?? "top";

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("logo", file);
      const res = await fetch("/api/business/logo", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({ ok: false, error: "Upload failed" }));
      if (!res.ok || !data.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      commit({ ...spec, header: { ...h, logoUrl: data.logoUrl, showLogo: true } });
      if (data.profile) onProfile?.(data.profile);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/business/logo", { method: "DELETE" });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not remove the logo");
        return;
      }
      commit({ ...spec, header: { ...h, logoUrl: undefined } });
      if (data.profile) onProfile?.(data.profile);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  const patch = (p: Partial<BillSpec["header"]>) => commit({ ...spec, header: { ...h, ...p } });

  return (
    <div className="space-y-2.5">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      {h.logoUrl ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-2">
          <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-[var(--bg)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={h.logoUrl} alt="Logo" className="max-h-10 max-w-14 object-contain" />
          </div>
          <div className="flex flex-1 flex-wrap gap-1.5">
            <ActionButton icon="image" disabled={busy} onClick={() => input.current?.click()}>
              Replace
            </ActionButton>
            <ActionButton icon="trash" tone="danger" disabled={busy} onClick={removeLogo}>
              Remove
            </ActionButton>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-[var(--line)] px-3 py-4 text-center hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-50"
        >
          <Icon name="image" className="h-5 w-5 text-[var(--brand)]" />
          <span className="text-[12px] font-semibold text-[var(--ink)]">{busy ? "Uploading…" : "Upload logo"}</span>
          <span className="text-[10px] text-[var(--muted)]">PNG, JPG or WebP · under 2 MB</span>
        </button>
      )}
      {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}

      {h.logoUrl && (
        <>
          <ToggleRow label="Show logo on bill" checked={h.showLogo !== false} onChange={(on) => patch({ showLogo: on })} />
          <div>
            <FieldLabel>Placement</FieldLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ["top", "Above name"],
                  ["left", "Left of name"],
                  ["right", "Right of name"],
                  ["free", "Anywhere (drag)"],
                ] as [LogoPlacement, string][]
              ).map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={placement === p}
                  onClick={() => patch({ logoPlacement: p, showLogo: true })}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition ${
                    placement === p ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  <PlacementGlyph placement={p} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          {placement !== "free" && <BannerControls spec={spec} commit={commit} />}
          <div>
            <FieldLabel
              aside={
                h.logoWidthMm != null ? (
                  <button type="button" onClick={() => patch({ logoWidthMm: undefined })} className="text-[11px] font-semibold text-[var(--brand)] hover:underline">
                    Auto
                  </button>
                ) : undefined
              }
            >
              Size (width)
            </FieldLabel>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={8}
                max={120}
                value={h.logoWidthMm ?? 30}
                onChange={(e) => patch({ logoWidthMm: Number(e.target.value) })}
                className="min-w-0 flex-1 accent-[var(--brand)]"
              />
              <NumberBox value={h.logoWidthMm} placeholder="Auto" start={30} min={8} max={150} unit="mm" onChange={(n) => patch({ logoWidthMm: n })} />
            </div>
            <p className="mt-1 text-[10px] text-[var(--muted)]">Height follows automatically, so the logo never stretches.</p>
          </div>
          {placement === "free" && (
            <>
              <SliderRow label="From left" value={h.logoXPct ?? 4} min={0} max={95} step={0.5} unit="%" onChange={(n) => patch({ logoXPct: n })} />
              <SliderRow label="From top" value={h.logoYPct ?? 2} min={0} max={97} step={0.5} unit="%" onChange={(n) => patch({ logoYPct: n })} />
              <Note>Drag the logo on the bill to place it anywhere.</Note>
            </>
          )}
        </>
      )}
    </div>
  );
}

function PlacementGlyph({ placement }: { placement: LogoPlacement }) {
  const logo = <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[var(--brand)]" />;
  const text = (
    <span className="flex flex-col gap-[2px]">
      <span className="h-[3px] w-4 rounded bg-slate-400" />
      <span className="h-[3px] w-3 rounded bg-slate-300" />
    </span>
  );
  if (placement === "top")
    return (
      <span className="flex w-6 flex-col items-center gap-[2px]">
        {logo}
        {text}
      </span>
    );
  if (placement === "free")
    return (
      <span className="relative h-5 w-6 rounded-sm border border-dashed border-slate-300">
        <span className="absolute left-0.5 top-0.5 h-2 w-2 rounded-sm bg-[var(--brand)]" />
      </span>
    );
  return (
    <span className={`flex w-6 items-center gap-[2px] ${placement === "right" ? "flex-row-reverse" : ""}`}>
      {logo}
      {text}
    </span>
  );
}

function DocumentInspector({ spec, commit, onProfile }: { spec: BillSpec; commit: (next: BillSpec) => void; onProfile?: (p: BusinessProfile) => void }) {
  const seller = spec.seller;
  const setSeller = (p: Partial<BillSpec["seller"]>) => commit({ ...spec, seller: { ...seller, ...p } });
  return (
    <div>
      <div className="border-b border-[var(--line)] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand)]">Nothing selected</p>
        <h2 className="text-[15px] font-semibold text-[var(--ink)]">Document settings</h2>
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">Click any label, value, column or the logo on the bill to edit just that piece here.</p>
      </div>
      <PanelSection title="Your business">
        <TextInput label="Business name" value={seller.name} onChange={(v) => setSeller({ name: v })} />
        <TextInput label="Your GSTIN" value={seller.gstin} onChange={(v) => setSeller({ gstin: v.toUpperCase() })} />
        <div className="grid grid-cols-[1fr_72px] gap-2">
          <TextInput label="State" value={seller.state} onChange={(v) => setSeller({ state: v.toUpperCase() })} />
          <TextInput label="Code" value={seller.stateCode} onChange={(v) => setSeller({ stateCode: v.replace(/\D/g, "").slice(0, 2) })} />
        </div>
        <TextInput label="Address" value={seller.address || ""} multiline onChange={(v) => setSeller({ address: v })} />
        <Note>Saved to your business profile and printed on every bill, whichever design you use.</Note>
      </PanelSection>
      <PanelSection title="Logo & banner">
        <LogoControls spec={spec} commit={commit} onProfile={onProfile} />
        {!spec.header.logoUrl && <BannerControls spec={spec} commit={commit} />}
      </PanelSection>
      <PanelSection title="Tax">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-[var(--ink)]">Default GST rate</span>
          <NumberBox value={spec.totals.gstPercent} min={0} max={40} step={0.5} unit="%" onChange={(n) => commit({ ...spec, totals: { ...spec.totals, gstPercent: n } })} />
        </div>
        <div className="flex flex-wrap gap-1">
          {[0, 5, 12, 18, 28].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => commit({ ...spec, totals: { ...spec.totals, gstPercent: p } })}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${spec.totals.gstPercent === p ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)] bg-white text-[var(--ink)]"}`}
            >
              {p}%
            </button>
          ))}
        </div>
        <Note>Pre-selected on every new bill; you can switch any single bill to another slab, IGST or no tax. For mixed rates, add a GST % column.</Note>
      </PanelSection>
    </div>
  );
}
