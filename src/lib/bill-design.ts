/**
 * Design-editor helpers: friendly names, which parts a field has, and text accessors used by
 * the Smart Invoice inspector. Pure functions over BillSpec — no React.
 */
import {
  GST_COLUMN_KEY,
  removeDesignField,
  type BillSpec,
  type DesignAnchor,
  type DesignZone,
  type FieldPart,
} from "./bill-spec";

export const ZONE_NAMES: Record<DesignZone, string> = {
  header: "Header",
  meta: "Reference details",
  receiver: "Customer block",
  footer: "Footer",
  column: "Item table",
  freeBox: "Text box",
  totals: "Totals",
  bank: "Bank details",
  terms: "Terms & conditions",
  signature: "Signature",
};

const BUILTIN_TITLES: Record<string, string> = {
  "header.title": "Invoice title",
  "header.copy": "Copy label",
  "header.seller_gstin": "Your GSTIN",
  "header.seller_name": "Business name",
  "header.seller_address": "Business address",
  "header.seller_state": "Your state & code",
  "header.logo": "Logo",
  "receiver.heading": "Receiver heading",
  "receiver.customer_name": "Customer name",
  "receiver.address": "Customer address",
  "receiver.state_row": "Customer state & code",
  "receiver.gstin": "Customer GSTIN",
  "bank.bank_name": "Bank name",
  "bank.bank_acNo": "Account number",
  "bank.bank_ifsc": "IFSC",
  "bank.bank_branch": "Branch",
  "totals.basic": "Basic amount",
  "totals.round_off": "Round off",
  "totals.grand": "Grand total",
  "totals.rupees": "Amount in words",
  "totals.total_row": "Table total",
  "terms.terms": "Terms & conditions",
  "signature.eoe": "E. & O.E.",
  "signature.signatory": "Signatory",
};

const PAIR: FieldPart[] = ["label", "value"];
const QUAD: FieldPart[] = ["label", "value", "dateLabel", "dateValue"];

const BUILTIN_PARTS: Record<string, FieldPart[]> = {
  "header.seller_gstin": PAIR,
  "header.seller_state": QUAD,
  "receiver.state_row": QUAD,
  "receiver.gstin": PAIR,
  "receiver.customer_name": ["value"],
  "receiver.address": ["value"],
  "bank.bank_name": PAIR,
  "bank.bank_acNo": PAIR,
  "bank.bank_ifsc": PAIR,
  "bank.bank_branch": PAIR,
};

const STATE_PART_NAMES: Record<FieldPart, string> = {
  label: "State label",
  value: "State",
  dateLabel: "Code label",
  dateValue: "Code",
};

const DEFAULT_PART_NAMES: Record<FieldPart, string> = {
  label: "Label",
  value: "Answer",
  dateLabel: "Date label",
  dateValue: "Date",
};

const key = (a: Pick<DesignAnchor, "zone" | "id">) => `${a.zone}.${a.id}`;

export function fieldTitle(spec: BillSpec, a: DesignAnchor): string {
  if (a.zone === "meta") return spec.metaRows.find((r) => r.id === a.id)?.label || "Reference field";
  if (a.zone === "footer") {
    const f = spec.footerFields.find((x) => x.id === a.id);
    if (f) return f.label;
  }
  if (a.zone === "receiver") {
    const f = (spec.receiver.extraFields || []).find((x) => x.id === a.id);
    if (f) return f.label;
  }
  if (a.zone === "column") return spec.columns.find((c) => c.key === a.id)?.label || "Column";
  if (a.zone === "freeBox") return "Text box";
  return BUILTIN_TITLES[key(a)] || a.label || ZONE_NAMES[a.zone];
}

/** The individually sizable slices a field is made of. */
export function fieldParts(spec: BillSpec, a: DesignAnchor): FieldPart[] {
  if (a.zone === "meta") {
    const r = spec.metaRows.find((m) => m.id === a.id);
    if (!r) return [];
    if (r.labelOnly) return ["label"];
    return r.withDate ? QUAD : PAIR;
  }
  if (a.zone === "footer" || a.zone === "receiver") {
    const f =
      a.zone === "footer"
        ? spec.footerFields.find((x) => x.id === a.id)
        : (spec.receiver.extraFields || []).find((x) => x.id === a.id);
    if (f) return f.labelOnly ? ["label"] : PAIR;
  }
  if (a.zone === "column" || a.zone === "freeBox" || a.part === "logo") return [];
  return BUILTIN_PARTS[key(a)] || ["label"];
}

export function partName(a: DesignAnchor, part: FieldPart, parts: FieldPart[]): string {
  if (parts.length <= 1) return "Text";
  if (a.id === "state_row" || a.id === "seller_state") return STATE_PART_NAMES[part];
  return DEFAULT_PART_NAMES[part];
}

/** Values in the customer / reference / footer blocks are preview data from the upload, not design. */
export function isSampleValue(a: DesignAnchor, part: FieldPart): boolean {
  if (part === "label" || part === "dateLabel") return a.id === "customer_name" || a.id === "address";
  if (a.zone === "meta" || a.zone === "footer") return true;
  if (a.zone === "receiver") return true;
  return false;
}

type TextSlot = { get: (s: BillSpec) => string; set: (s: BillSpec, t: string) => BillSpec };

function slot<K extends keyof BillSpec>(section: K, field: string, transform?: (t: string) => string): TextSlot {
  return {
    get: (s) => String((s[section] as Record<string, unknown>)[field] ?? ""),
    set: (s, t) => ({ ...s, [section]: { ...(s[section] as object), [field]: transform ? transform(t) : t } }),
  };
}

const upper = (t: string) => t.toUpperCase();
const digits2 = (t: string) => t.replace(/\D/g, "").slice(0, 2);

const BUILTIN_TEXT: Record<string, TextSlot> = {
  "header.title.label": slot("header", "title"),
  "header.copy.label": slot("header", "copyLabel"),
  "header.seller_gstin.label": slot("header", "sellerGstinLabel"),
  "header.seller_gstin.value": slot("seller", "gstin", upper),
  "header.seller_name.label": slot("seller", "name"),
  "header.seller_address.label": slot("seller", "address"),
  "header.seller_state.label": slot("seller", "stateLabel"),
  "header.seller_state.value": slot("seller", "state", upper),
  "header.seller_state.dateLabel": slot("seller", "codeLabel"),
  "header.seller_state.dateValue": slot("seller", "stateCode", digits2),
  "receiver.heading.label": slot("receiver", "heading"),
  "receiver.gstin.label": slot("receiver", "gstinLabel"),
  "receiver.state_row.label": slot("receiver", "stateLabel"),
  "receiver.state_row.dateLabel": slot("receiver", "codeLabel"),
  "bank.bank_name.label": slot("bank", "nameLabel"),
  "bank.bank_name.value": slot("bank", "name"),
  "bank.bank_acNo.label": slot("bank", "acLabel"),
  "bank.bank_acNo.value": slot("bank", "acNo"),
  "bank.bank_ifsc.label": slot("bank", "ifscLabel"),
  "bank.bank_ifsc.value": slot("bank", "ifsc", upper),
  "bank.bank_branch.label": slot("bank", "branchLabel"),
  "bank.bank_branch.value": slot("bank", "branch"),
  "totals.basic.label": slot("totals", "basicLabel"),
  "totals.round_off.label": slot("totals", "roundOffLabel"),
  "totals.grand.label": slot("totals", "grandLabel"),
  "totals.rupees.label": slot("rupees", "label"),
  "totals.total_row.label": slot("table", "totalLabel"),
  "terms.terms.label": slot("terms", "heading"),
  "signature.eoe.label": slot("signature", "eoe"),
  "signature.signatory.label": slot("signature", "signatoryLabel"),
};

/** Editable printed text for the selection, or null when the part is sample data / not text. */
export function partTextSlot(spec: BillSpec, a: DesignAnchor, part: FieldPart | undefined): TextSlot | null {
  if (a.zone === "freeBox") {
    return {
      get: (s) => (s.freeBoxes || []).find((b) => b.id === a.id)?.text ?? "",
      set: (s, t) => ({ ...s, freeBoxes: (s.freeBoxes || []).map((b) => (b.id === a.id ? { ...b, text: t } : b)) }),
    };
  }
  if (a.zone === "column") {
    return {
      get: (s) => s.columns.find((c) => c.key === a.id)?.label ?? "",
      set: (s, t) => ({ ...s, columns: s.columns.map((c) => (c.key === a.id ? { ...c, label: t } : c)) }),
    };
  }
  if (!part) return null;
  if (a.zone === "meta" && (part === "label" || part === "dateLabel")) {
    const k = part === "label" ? "label" : "dateLabel";
    return {
      get: (s) => String(s.metaRows.find((r) => r.id === a.id)?.[k] ?? ""),
      set: (s, t) => ({ ...s, metaRows: s.metaRows.map((r) => (r.id === a.id ? { ...r, [k]: t } : r)) }),
    };
  }
  if (a.zone === "footer" && part === "label" && spec.footerFields.some((f) => f.id === a.id)) {
    return {
      get: (s) => s.footerFields.find((f) => f.id === a.id)?.label ?? "",
      set: (s, t) => ({ ...s, footerFields: s.footerFields.map((f) => (f.id === a.id ? { ...f, label: t } : f)) }),
    };
  }
  if (a.zone === "receiver" && part === "label" && (spec.receiver.extraFields || []).some((f) => f.id === a.id)) {
    return {
      get: (s) => (s.receiver.extraFields || []).find((f) => f.id === a.id)?.label ?? "",
      set: (s, t) => ({
        ...s,
        receiver: { ...s.receiver, extraFields: (s.receiver.extraFields || []).map((f) => (f.id === a.id ? { ...f, label: t } : f)) },
      }),
    };
  }
  return BUILTIN_TEXT[`${key(a)}.${part}`] || null;
}

export function canRemove(spec: BillSpec, a: DesignAnchor): boolean {
  return removeDesignField(spec, a) !== spec;
}

export function addTableColumn(spec: BillSpec): BillSpec {
  const k = `col_${Date.now().toString(36)}`;
  const amtIdx = spec.columns.findIndex((c) => c.key === "amount");
  const next = [...spec.columns];
  next.splice(amtIdx < 0 ? next.length : amtIdx, 0, { key: k, label: "New column", width: 8, align: "center", type: "text", enabled: true });
  return { ...spec, columns: next };
}

/** Per-line GST % column (for bills that mix 5 / 12 / 18 % goods). */
export function addGstRateColumn(spec: BillSpec): BillSpec {
  if (spec.columns.some((c) => c.key === GST_COLUMN_KEY)) {
    return { ...spec, columns: spec.columns.map((c) => (c.key === GST_COLUMN_KEY ? { ...c, enabled: true } : c)) };
  }
  const amtIdx = spec.columns.findIndex((c) => c.key === "amount");
  const next = [...spec.columns];
  next.splice(amtIdx < 0 ? next.length : amtIdx, 0, { key: GST_COLUMN_KEY, label: "GST %", width: 6, align: "center", type: "number", enabled: true });
  return { ...spec, columns: next };
}

/** Swap a column with its visible neighbour. */
export function moveColumn(spec: BillSpec, colKey: string, delta: -1 | 1): BillSpec {
  const visible = spec.columns.filter((c) => c.enabled);
  const i = visible.findIndex((c) => c.key === colKey);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= visible.length) return spec;
  const a = spec.columns.findIndex((c) => c.key === visible[i].key);
  const b = spec.columns.findIndex((c) => c.key === visible[j].key);
  const next = [...spec.columns];
  [next[a], next[b]] = [next[b], next[a]];
  return { ...spec, columns: next };
}

/** Where a dragged field is dropped: beside another field (same row) or on a row of its own. */
export type FieldDrop =
  | { kind: "beside"; targetId: string; side: "before" | "after" }
  | { kind: "line"; beforeLine: number | null };

type Lined = { id: string; line?: number; enabled: boolean };

/** Re-order rows for a drop and renumber lines 0..n. Rows must already have explicit lines. */
function arrange<T extends Lined>(rows: T[], movingId: string, drop: FieldDrop): T[] | null {
  const moving = rows.find((r) => r.id === movingId);
  if (!moving) return null;
  const rest = rows.filter((r) => r.id !== movingId);
  let placed: T;
  let at: number;
  if (drop.kind === "beside") {
    const ti = rest.findIndex((r) => r.id === drop.targetId);
    if (ti < 0) return null;
    placed = { ...moving, line: rest[ti].line };
    at = drop.side === "before" ? ti : ti + 1;
  } else {
    const max = Math.max(-1, ...rest.map((r) => r.line ?? 0));
    placed = { ...moving, line: drop.beforeLine == null ? max + 1 : drop.beforeLine - 0.5 };
    at = rest.length;
  }
  const out = [...rest];
  out.splice(at, 0, placed);
  const lines = [...new Set(out.map((r) => r.line ?? 0))].sort((a, b) => a - b);
  return out.map((r) => ({ ...r, line: lines.indexOf(r.line ?? 0) }));
}

/** Give every enabled field on the given lines an equal share of the row. */
function shareLines<T extends Lined & { widthPct?: number }>(rows: T[], lines: Set<number>): T[] {
  return rows.map((r) => {
    if (!r.enabled || !lines.has(r.line ?? 0)) return r;
    const n = rows.filter((x) => x.enabled && (x.line ?? 0) === (r.line ?? 0)).length;
    return { ...r, widthPct: Math.floor(100 / n) };
  });
}

export function moveFieldTo(spec: BillSpec, zone: "meta" | "footer" | "receiver", movingId: string, drop: FieldDrop): BillSpec {
  if (zone === "meta") {
    const rows = spec.metaRows.map((r, i) => ({ ...r, line: r.line ?? i }));
    const oldLine = rows.find((r) => r.id === movingId)?.line;
    const oldSibling = rows.find((r) => r.id !== movingId && r.enabled && r.line === oldLine)?.id;
    const out = arrange(rows, movingId, drop);
    if (!out) return spec;
    const fix = new Set<number>();
    const newLine = out.find((r) => r.id === movingId)?.line;
    if (newLine != null) fix.add(newLine);
    const sibLine = out.find((r) => r.id === oldSibling)?.line;
    if (sibLine != null) fix.add(sibLine);
    return { ...spec, metaRows: shareLines(out, fix) };
  }
  if (zone === "footer") {
    const rows = spec.footerFields.map((f, i) => ({ ...f, line: f.line ?? (f.multiline ? 1000 + i : 0) }));
    const out = arrange(rows, movingId, drop);
    return out ? { ...spec, footerFields: out } : spec;
  }
  if (drop.kind !== "beside") return spec;
  const extras = [...(spec.receiver.extraFields || [])];
  const mi = extras.findIndex((f) => f.id === movingId);
  if (mi < 0) return spec;
  const [moving] = extras.splice(mi, 1);
  const ti = drop.targetId === "gstin" ? -1 : extras.findIndex((f) => f.id === drop.targetId);
  extras.splice(drop.targetId === "gstin" ? 0 : drop.side === "before" ? Math.max(0, ti) : ti + 1, 0, moving);
  const targetW = drop.targetId === "gstin" ? spec.receiver.gstinWidthPct ?? 100 : extras.find((f) => f.id === drop.targetId)?.widthPct ?? 40;
  const fits = targetW + (moving.widthPct || 40) <= 100;
  return {
    ...spec,
    receiver: {
      ...spec.receiver,
      gstinWidthPct: !fits && drop.targetId === "gstin" ? 50 : spec.receiver.gstinWidthPct,
      extraFields: extras.map((f) => (!fits && (f.id === movingId || f.id === drop.targetId) ? { ...f, widthPct: 50 } : f)),
    },
  };
}

export function columnWidthPct(spec: BillSpec, colKey: string): number {
  const visible = spec.columns.filter((c) => c.enabled);
  const total = visible.reduce((s, c) => s + c.width, 0) || 1;
  const c = visible.find((x) => x.key === colKey);
  return c ? Math.round((c.width / total) * 100) : 0;
}

/** Set a column's share of the table; the others keep their proportions. */
export function setColumnWidthPct(spec: BillSpec, colKey: string, pct: number): BillSpec {
  const visible = spec.columns.filter((c) => c.enabled);
  const others = visible.filter((c) => c.key !== colKey);
  const othersTotal = others.reduce((s, c) => s + c.width, 0) || 1;
  const p = Math.min(80, Math.max(3, pct)) / 100;
  const w = (p * othersTotal) / (1 - p);
  return { ...spec, columns: spec.columns.map((c) => (c.key === colKey ? { ...c, width: Math.round(w * 10) / 10 } : c)) };
}
