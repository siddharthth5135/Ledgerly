/**
 * Bill document model — a real, editable, vector-rendered GST invoice.
 * The uploaded bill is analysed and reconstructed in this structure so it
 * prints crisp, wraps text, and every label is editable (Word-like).
 */

export type Align = "left" | "center" | "right";

export type BillColumn = {
  key: string;
  label: string;
  /** Relative width in % of table */
  width: number;
  align: Align;
  type: "index" | "text" | "number" | "computed";
  enabled: boolean;
};

/** One slice of a label/value row (each can be sized on its own in design mode). */
export type FieldPart = "label" | "value" | "dateLabel" | "dateValue";

export type PartSizes = Partial<Record<FieldPart, number>>;

export type PartStyle = {
  bold?: boolean;
  fontSize?: number;
  /** Where this label or answer sits in its row. Text alignment is `partAlign`. */
  boxAlign?: Align;
  /** Grey hint shown when the answer is blank */
  placeholder?: string;
  /** Filled in on a new bill when the client has not typed this answer yet */
  defaultValue?: string;
};
export type PartStyles = Partial<Record<FieldPart, PartStyle>>;

export type MetaRow = {
  id: string;
  label: string;
  key: string;
  withDate: boolean;
  dateLabel: string;
  dateKey: string;
  enabled: boolean;
  /** Label with no answer box */
  labelOnly?: boolean;
  /** Fields sharing a line sit side by side */
  line?: number;
  /** Width of this field as % of the reference column */
  widthPct?: number;
  /** Dragged height in px */
  minHeight?: number;
  /** Row alignment for label + value group */
  align?: Align;
  /** Per-part width in character units (design) */
  partSizes?: PartSizes;
  partAlign?: Partial<Record<FieldPart, Align>>;
  partStyle?: PartStyles;
};

export type FooterField = {
  id: string;
  label: string;
  key: string;
  enabled: boolean;
  /** Fields sharing a line number are rendered side by side */
  line?: number;
  multiline?: boolean;
  /** Multi-line answer shown beside its label instead of under it */
  valueBeside?: boolean;
  /** Label with no answer box */
  labelOnly?: boolean;
  partSizes?: PartSizes;
  partAlign?: Partial<Record<FieldPart, Align>>;
  partStyle?: PartStyles;
};

export type BillLayout = {
  /** % width of the receiver block (left) vs reference block (right) */
  receiverWidth: number;
  /** % width of the footer-left block vs totals block */
  footerLeftWidth: number;
  /** Height of the items area in % of page (informational) */
  tableHeightPct?: number;
  /** Where the printed grid starts/ends on the original page (% of page). Top space = letterhead. */
  topMarginPct?: number;
  bottomMarginPct?: number;
  sideMarginPct?: number;
  /** "split": receiver left + reference rows right (GST style). "rows": one full-width field per line (cash memo style). */
  partyStyle?: "split" | "rows";
};

export type ReceiverField = {
  id: string;
  label: string;
  key: string;
  enabled: boolean;
  labelOnly?: boolean;
  widthPct: number;
  minHeight?: number;
  align?: Align;
  partSizes?: PartSizes;
  partAlign?: Partial<Record<FieldPart, Align>>;
  partStyle?: PartStyles;
};

/** Free-form text placed anywhere on the page (design layer). */
export type FreeBox = {
  id: string;
  text: string;
  /** Position as % of printable page area */
  xPct: number;
  yPct: number;
  wPct: number;
  align: Align;
  fontSize?: number;
  bold?: boolean;
  enabled: boolean;
  /** When set, the box is a label + answer; the answer is typed on each bill under this key */
  valueKey?: string;
  /** Grey hint for the answer */
  placeholder?: string;
  /** Filled in on a new bill until the client types something */
  defaultValue?: string;
};

export type DesignZone =
  | "meta"
  | "receiver"
  | "footer"
  | "column"
  | "freeBox"
  | "header"
  | "totals"
  | "bank"
  | "terms"
  | "signature";

export type DesignAnchor = {
  zone: DesignZone;
  id?: string;
  label?: string;
  /** When set, toolbar + resize apply to this slice only (not the whole group). */
  part?: FieldPart | "logo";
};

export type LogoPlacement = "top" | "left" | "right" | "free";

export type DesignPartLayout = {
  partSizes?: PartSizes;
  partAlign?: Partial<Record<FieldPart, Align>>;
  partStyle?: PartStyles;
};

function layoutStoreKey(anchor: Pick<DesignAnchor, "zone" | "id">) {
  return `${anchor.zone}.${anchor.id}`;
}

/** Part sizes for any field on the bill (built-in or custom). */
export function getDesignPartLayout(spec: BillSpec, anchor: Pick<DesignAnchor, "zone" | "id">): DesignPartLayout {
  if (!anchor.id) return {};
  if (anchor.zone === "meta") {
    const r = spec.metaRows.find((m) => m.id === anchor.id);
    return { partSizes: r?.partSizes, partAlign: r?.partAlign, partStyle: r?.partStyle };
  }
  if (anchor.zone === "receiver") {
    const f = (spec.receiver.extraFields || []).find((x) => x.id === anchor.id);
    if (f) return { partSizes: f.partSizes, partAlign: f.partAlign, partStyle: f.partStyle };
  }
  if (anchor.zone === "footer") {
    const f = spec.footerFields.find((x) => x.id === anchor.id);
    if (f) return { partSizes: f.partSizes, partAlign: f.partAlign, partStyle: f.partStyle };
  }
  return spec.designLayout?.[layoutStoreKey(anchor)] ?? {};
}

/** Patch the field last clicked on the bill (design mode). */
export function patchDesignField(spec: BillSpec, anchor: DesignAnchor, patch: Record<string, unknown>): BillSpec {
  if (anchor.zone === "meta" && anchor.id) {
    return { ...spec, metaRows: spec.metaRows.map((r) => (r.id === anchor.id ? { ...r, ...patch } : r)) };
  }
  if (anchor.zone === "receiver" && anchor.id) {
    return {
      ...spec,
      receiver: {
        ...spec.receiver,
        extraFields: (spec.receiver.extraFields || []).map((f) => (f.id === anchor.id ? { ...f, ...patch } : f)),
      },
    };
  }
  if (anchor.zone === "footer" && anchor.id) {
    return { ...spec, footerFields: spec.footerFields.map((f) => (f.id === anchor.id ? { ...f, ...patch } : f)) };
  }
  if (anchor.zone === "column" && anchor.id) {
    return { ...spec, columns: spec.columns.map((c) => (c.key === anchor.id ? { ...c, ...patch } : c)) };
  }
  if (anchor.zone === "freeBox" && anchor.id) {
    return { ...spec, freeBoxes: (spec.freeBoxes || []).map((b) => (b.id === anchor.id ? { ...b, ...patch } : b)) };
  }
  if (anchor.zone === "header") {
    return { ...spec, header: { ...spec.header, ...patch } };
  }
  return spec;
}

/** `null` clears a setting back to automatic. */
export type PartPatch = {
  widthCh?: number | null;
  /** Text alignment inside the label or answer */
  align?: Align | null;
  /** Where the label or answer box sits in its row */
  boxAlign?: Align | null;
  placeholder?: string | null;
  defaultValue?: string | null;
  bold?: boolean | null;
  fontSize?: number | null;
  reset?: boolean;
};

function withKey<T>(obj: Partial<Record<FieldPart, T>> | undefined, part: FieldPart, value: T | null | undefined) {
  const next = { ...(obj || {}) };
  if (value === null) delete next[part];
  else if (value !== undefined) next[part] = value;
  return next;
}

function mergePartPatch<T extends DesignPartLayout>(row: T, part: FieldPart, patch: PartPatch): T {
  if (patch.reset) {
    return {
      ...row,
      partSizes: withKey(row.partSizes, part, null),
      partAlign: withKey(row.partAlign, part, null),
      partStyle: withKey(row.partStyle, part, null),
    };
  }
  const next = { ...row };
  if (patch.widthCh !== undefined) next.partSizes = withKey(row.partSizes, part, patch.widthCh);
  if (patch.align !== undefined) next.partAlign = withKey(row.partAlign, part, patch.align);
  if (
    patch.bold !== undefined ||
    patch.fontSize !== undefined ||
    patch.boxAlign !== undefined ||
    patch.placeholder !== undefined ||
    patch.defaultValue !== undefined
  ) {
    const cur: PartStyle = { ...(row.partStyle?.[part] || {}) };
    const set = <K extends keyof PartStyle>(k: K, v: PartStyle[K] | null | undefined) => {
      if (v === null || v === "") delete cur[k];
      else if (v !== undefined) cur[k] = v;
    };
    if (patch.bold !== undefined) set("bold", patch.bold);
    if (patch.fontSize !== undefined) set("fontSize", patch.fontSize);
    if (patch.boxAlign !== undefined) set("boxAlign", patch.boxAlign);
    if (patch.placeholder !== undefined) set("placeholder", patch.placeholder);
    if (patch.defaultValue !== undefined) set("defaultValue", patch.defaultValue);
    next.partStyle = withKey(row.partStyle, part, Object.keys(cur).length ? cur : null);
  }
  return next;
}

/** Resize, align or restyle a single label/value/date slice inside a row. */
export function patchDesignPart(
  spec: BillSpec,
  anchor: Pick<DesignAnchor, "zone" | "id">,
  part: FieldPart,
  patch: PartPatch
): BillSpec {
  if (!anchor.id) return spec;
  if (anchor.zone === "meta") {
    return {
      ...spec,
      metaRows: spec.metaRows.map((r) => (r.id === anchor.id ? mergePartPatch(r, part, patch) : r)),
    };
  }
  if (anchor.zone === "receiver") {
    const hit = (spec.receiver.extraFields || []).find((f) => f.id === anchor.id);
    if (hit) {
      return {
        ...spec,
        receiver: {
          ...spec.receiver,
          extraFields: (spec.receiver.extraFields || []).map((f) => (f.id === anchor.id ? mergePartPatch(f, part, patch) : f)),
        },
      };
    }
  }
  if (anchor.zone === "footer") {
    const hit = spec.footerFields.find((f) => f.id === anchor.id);
    if (hit) {
      return {
        ...spec,
        footerFields: spec.footerFields.map((f) => (f.id === anchor.id ? mergePartPatch(f, part, patch) : f)),
      };
    }
  }
  const key = layoutStoreKey(anchor);
  const cur = spec.designLayout?.[key] ?? {};
  return {
    ...spec,
    designLayout: { ...(spec.designLayout || {}), [key]: mergePartPatch(cur, part, patch) },
  };
}

export function partWidthCh(row: { partSizes?: PartSizes }, part: FieldPart): number | undefined {
  return row.partSizes?.[part];
}

/** Hide or disable the selected design element. */
export function removeDesignField(spec: BillSpec, anchor: DesignAnchor): BillSpec {
  if (anchor.zone === "meta" && anchor.id) {
    return { ...spec, metaRows: spec.metaRows.map((r) => (r.id === anchor.id ? { ...r, enabled: false } : r)) };
  }
  if (anchor.zone === "receiver" && anchor.id && (spec.receiver.extraFields || []).some((f) => f.id === anchor.id)) {
    return {
      ...spec,
      receiver: {
        ...spec.receiver,
        extraFields: (spec.receiver.extraFields || []).map((f) => (f.id === anchor.id ? { ...f, enabled: false } : f)),
      },
    };
  }
  if (anchor.zone === "footer" && anchor.id && spec.footerFields.some((f) => f.id === anchor.id)) {
    return { ...spec, footerFields: spec.footerFields.map((f) => (f.id === anchor.id ? { ...f, enabled: false } : f)) };
  }
  if (anchor.zone === "column" && anchor.id) {
    const locked = anchor.id === "description" || anchor.id === "amount";
    if (locked) return spec;
    return { ...spec, columns: spec.columns.map((c) => (c.key === anchor.id ? { ...c, enabled: false } : c)) };
  }
  if (anchor.zone === "freeBox" && anchor.id) {
    return { ...spec, freeBoxes: (spec.freeBoxes || []).map((b) => (b.id === anchor.id ? { ...b, enabled: false } : b)) };
  }
  if (anchor.zone === "receiver" && anchor.id === "gstin") return { ...spec, receiver: { ...spec.receiver, showGstin: false } };
  if (anchor.zone === "receiver" && anchor.id === "state_row") return { ...spec, receiver: { ...spec.receiver, showState: false } };
  if (anchor.zone === "header" && anchor.id === "seller_gstin") return { ...spec, header: { ...spec.header, showSellerGstin: false } };
  if (anchor.zone === "header" && anchor.id === "logo") return { ...spec, header: { ...spec.header, showLogo: false } };
  if (anchor.zone === "header" && (anchor.id === "seller_name" || anchor.id === "seller_address")) {
    return { ...spec, header: { ...spec.header, showSellerName: false } };
  }
  if (anchor.zone === "bank") return { ...spec, bank: { ...spec.bank, enabled: false } };
  if (anchor.zone === "terms") return { ...spec, terms: { ...spec.terms, enabled: false } };
  if (anchor.zone === "totals" && anchor.id === "rupees") return { ...spec, rupees: { ...spec.rupees, enabled: false } };
  if (anchor.zone === "totals" && anchor.id === "round_off") return { ...spec, totals: { ...spec.totals, showRoundOff: false } };
  if (anchor.zone === "totals" && anchor.id === "total_row") return { ...spec, table: { ...spec.table, showTotalRow: false } };
  return spec;
}

/** Move a meta or footer field to the previous/next row. */
export function shiftDesignFieldLine(spec: BillSpec, anchor: DesignAnchor, delta: -1 | 1): BillSpec {
  if (anchor.zone === "meta" && anchor.id) {
    const rows = spec.metaRows.map((r, i) => ({ ...r, line: r.line ?? i }));
    const hit = rows.find((r) => r.id === anchor.id);
    if (!hit) return spec;
    const nextLine = Math.max(0, (hit.line ?? 0) + delta);
    return { ...spec, metaRows: rows.map((r) => (r.id === anchor.id ? { ...r, line: nextLine } : r)) };
  }
  if (anchor.zone === "footer" && anchor.id) {
    const hit = spec.footerFields.find((f) => f.id === anchor.id);
    if (!hit || hit.multiline) return spec;
    const nextLine = Math.max(0, (hit.line ?? 0) + delta);
    return { ...spec, footerFields: spec.footerFields.map((f) => (f.id === anchor.id ? { ...f, line: nextLine } : f)) };
  }
  return spec;
}

/** Duplicate the selected field (meta, footer, receiver extra, free box). */
export function duplicateDesignField(spec: BillSpec, anchor: DesignAnchor): BillSpec {
  if (anchor.zone === "meta" && anchor.id) {
    const hit = spec.metaRows.find((r) => r.id === anchor.id);
    if (!hit) return spec;
    const id = newFieldId("field");
    const copy: MetaRow = {
      ...hit,
      id,
      key: id,
      label: `${hit.label} (copy)`,
      dateKey: `${id}_date`,
    };
    const i = spec.metaRows.findIndex((r) => r.id === anchor.id);
    const next = [...spec.metaRows];
    next.splice(i + 1, 0, copy);
    return { ...spec, metaRows: next };
  }
  if (anchor.zone === "footer" && anchor.id) {
    const hit = spec.footerFields.find((f) => f.id === anchor.id);
    if (!hit) return spec;
    const id = newFieldId("foot");
    const copy: FooterField = { ...hit, id, key: id, label: `${hit.label} (copy)` };
    const i = spec.footerFields.findIndex((f) => f.id === anchor.id);
    const next = [...spec.footerFields];
    next.splice(i + 1, 0, copy);
    return { ...spec, footerFields: next };
  }
  if (anchor.zone === "receiver" && anchor.id) {
    const hit = (spec.receiver.extraFields || []).find((f) => f.id === anchor.id);
    if (!hit) return spec;
    const id = newFieldId("field");
    const copy: ReceiverField = { ...hit, id, key: id, label: `${hit.label} (copy)` };
    return {
      ...spec,
      receiver: {
        ...spec.receiver,
        extraFields: [...(spec.receiver.extraFields || []), copy],
      },
    };
  }
  if (anchor.zone === "freeBox" && anchor.id) {
    const hit = (spec.freeBoxes || []).find((b) => b.id === anchor.id);
    if (!hit) return spec;
    const id = newFieldId("box");
    const copy: FreeBox = {
      ...hit,
      id,
      text: `${hit.text} (copy)`,
      xPct: Math.min(92, hit.xPct + 3),
      yPct: Math.min(92, hit.yPct + 2),
      valueKey: hit.valueKey ? `${id}_value` : undefined,
    };
    return { ...spec, freeBoxes: [...(spec.freeBoxes || []), copy] };
  }
  return spec;
}

export function addFreeTextBox(spec: BillSpec, opts?: { xPct?: number; yPct?: number; withValue?: boolean }): BillSpec {
  const id = newFieldId("box");
  const withValue = !!opts?.withValue;
  const box: FreeBox = {
    id,
    text: withValue ? "Label" : "Text",
    xPct: opts?.xPct ?? 8,
    yPct: opts?.yPct ?? 12,
    wPct: withValue ? 34 : 28,
    align: "left",
    fontSize: spec.page.baseFontSize || 11,
    bold: withValue,
    enabled: true,
    valueKey: withValue ? `${id}_value` : undefined,
  };
  return { ...spec, freeBoxes: [...(spec.freeBoxes || []), box] };
}

export type HiddenDesignItem = { zone: DesignAnchor["zone"]; id: string; label: string };

export function listHiddenDesign(spec: BillSpec): HiddenDesignItem[] {
  const out: HiddenDesignItem[] = [];
  for (const r of spec.metaRows.filter((m) => !m.enabled)) out.push({ zone: "meta", id: r.id, label: r.label });
  for (const c of spec.columns.filter((col) => !col.enabled)) out.push({ zone: "column", id: c.key, label: c.label });
  for (const f of spec.footerFields.filter((x) => !x.enabled)) out.push({ zone: "footer", id: f.id, label: f.label });
  for (const f of (spec.receiver.extraFields || []).filter((x) => !x.enabled)) out.push({ zone: "receiver", id: f.id, label: f.label });
  for (const b of (spec.freeBoxes || []).filter((x) => !x.enabled)) out.push({ zone: "freeBox", id: b.id, label: b.text.slice(0, 24) || "Text box" });
  return out;
}

export function restoreHiddenDesign(spec: BillSpec, item: HiddenDesignItem): BillSpec {
  if (item.zone === "meta") {
    return { ...spec, metaRows: spec.metaRows.map((r) => (r.id === item.id ? { ...r, enabled: true } : r)) };
  }
  if (item.zone === "column") {
    return { ...spec, columns: spec.columns.map((c) => (c.key === item.id ? { ...c, enabled: true } : c)) };
  }
  if (item.zone === "footer") {
    return { ...spec, footerFields: spec.footerFields.map((f) => (f.id === item.id ? { ...f, enabled: true } : f)) };
  }
  if (item.zone === "receiver") {
    return {
      ...spec,
      receiver: {
        ...spec.receiver,
        extraFields: (spec.receiver.extraFields || []).map((f) => (f.id === item.id ? { ...f, enabled: true } : f)),
      },
    };
  }
  if (item.zone === "freeBox") {
    return { ...spec, freeBoxes: (spec.freeBoxes || []).map((b) => (b.id === item.id ? { ...b, enabled: true } : b)) };
  }
  return spec;
}

/** Indian tax-invoice column rules: words left, codes centred, money right. */
export function professionalAlign(c: Pick<BillColumn, "key" | "type" | "label">): Align {
  const key = (c.key || "").toLowerCase();
  const label = (c.label || "").toLowerCase();
  if (c.type === "index" || /^(sr|sl|sno)$/.test(key) || /\bsr\b|s\.?\s*no/.test(label)) return "center";
  if (/hsn|sac|^unit$|uom|gst/.test(key) || /\bhsn\b|\bsac\b|\bunit\b|gst\s*%/.test(label)) return "center";
  if (c.type === "computed" || c.type === "number" || /qty|rate|disc|amount|price|total/.test(key)) return "right";
  return "left";
}

function newFieldId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}`;
}

/** Insert a label+answer pair, or a label only, at the spot the user last clicked. */
export function insertDesignField(
  spec: BillSpec,
  anchor: DesignAnchor | null,
  opts?: { labelOnly?: boolean }
): BillSpec {
  const labelOnly = !!opts?.labelOnly;
  const id = newFieldId("field");
  const label = labelOnly ? "Label" : "New field";

  if (!anchor || anchor.zone === "meta") {
    const rows = spec.metaRows.map((r, i) => ({
      ...r,
      line: r.line ?? i,
      widthPct: r.widthPct ?? 100,
    }));
    if (anchor?.zone === "meta" && anchor.id) {
      const hit = rows.find((r) => r.id === anchor.id);
      if (hit) {
        const line = hit.line ?? 0;
        const siblings = rows.filter((r) => (r.line ?? 0) === line && r.enabled);
        const share = Math.max(28, Math.round(100 / (siblings.length + 1)));
        const next = rows.map((r) => ((r.line ?? 0) === line && r.enabled ? { ...r, widthPct: share } : r));
        const at = next.findIndex((r) => r.id === hit.id) + 1;
        next.splice(at, 0, {
          id,
          label,
          key: id,
          withDate: false,
          dateLabel: "Date",
          dateKey: `${id}_date`,
          enabled: true,
          labelOnly,
          line,
          widthPct: share,
        });
        return { ...spec, metaRows: next };
      }
    }
    const maxLine = rows.reduce((m, r) => Math.max(m, r.line ?? 0), -1);
    return {
      ...spec,
      metaRows: [
        ...rows,
        {
          id,
          label,
          key: id,
          withDate: false,
          dateLabel: "Date",
          dateKey: `${id}_date`,
          enabled: true,
          labelOnly,
          line: maxLine + 1,
          widthPct: 100,
        },
      ],
    };
  }

  if (anchor.zone === "receiver") {
    const extras = [...(spec.receiver.extraFields || [])];
    const enabled = extras.filter((e) => e.enabled).length + (spec.receiver.showGstin ? 1 : 0);
    const share = Math.max(28, Math.round(100 / (enabled + 1)));
    return {
      ...spec,
      receiver: {
        ...spec.receiver,
        gstinWidthPct: spec.receiver.showGstin ? share : spec.receiver.gstinWidthPct,
        extraFields: [
          ...extras.map((e) => (e.enabled ? { ...e, widthPct: share } : e)),
          { id, label, key: id, enabled: true, labelOnly, widthPct: share },
        ],
      },
    };
  }

  const fields = [...spec.footerFields];
  const hit = anchor.id ? fields.find((f) => f.id === anchor.id) : undefined;
  const line = hit ? (hit.line ?? 0) : Math.max(-1, ...fields.map((f) => f.line ?? 0)) + 1;
  fields.push({ id, label, key: id, enabled: true, line, labelOnly });
  return { ...spec, footerFields: fields };
}

export type BillSpec = {
  version: 2;
  page: {
    fontFamily: string;
    baseFontSize: number;
  };
  layout: BillLayout;
  /** Values read from the user's filled bill — used for preview only */
  sample?: Record<string, string>;
  sampleItems?: BillItem[];
  header: {
    title: string;
    copyLabel: string;
    sellerGstinLabel: string;
    showSellerGstin: boolean;
    showSellerName: boolean;
    /** Optional letterhead logo URL */
    logoUrl?: string;
    showLogo?: boolean;
    /** Logo width; height follows the image's aspect ratio */
    logoWidthMm?: number;
    logoPlacement?: LogoPlacement;
    /** Free placement position as % of the page */
    logoXPct?: number;
    logoYPct?: number;
    /** Alignment of the business banner (logo + name + address) */
    bannerAlign?: Align;
    /** "banner": the title prints above the business name instead of in the GSTIN | title | copy band */
    titlePlacement?: "band" | "banner";
    showSellerState?: boolean;
  };
  seller: {
    name: string;
    gstin: string;
    state: string;
    stateCode: string;
    address: string;
    stateLabel: string;
    codeLabel: string;
  };
  receiver: {
    heading: string;
    /** Printed label before the customer name / address (e.g. "Name", "Address"); none when empty */
    nameLabel?: string;
    addressLabel?: string;
    namePlaceholder: string;
    addressPlaceholder: string;
    showState: boolean;
    stateLabel: string;
    codeLabel: string;
    showGstin: boolean;
    gstinLabel: string;
    /** Width of the GSTIN pair as % of the receiver block */
    gstinWidthPct?: number;
    extraFields?: ReceiverField[];
  };
  metaRows: MetaRow[];
  columns: BillColumn[];
  table: {
    minRows: number;
    totalLabel: string;
    showTotalRow: boolean;
  };
  totals: {
    basicLabel: string;
    cgstLabel: string;
    sgstLabel: string;
    igstLabel: string;
    roundOffLabel: string;
    grandLabel: string;
    gstPercent: number;
    showRoundOff: boolean;
    showBasic?: boolean;
  };
  footerFields: FooterField[];
  bank: {
    enabled: boolean;
    nameLabel: string;
    name: string;
    acLabel: string;
    acNo: string;
    ifscLabel: string;
    ifsc: string;
    branchLabel: string;
    branch: string;
  };
  rupees: {
    enabled: boolean;
    label: string;
    /** "footer": inside the footer-left cell beside the totals, instead of its own full-width row */
    placement?: "row" | "footer";
  };
  terms: {
    enabled: boolean;
    heading: string;
    lines: string[];
  };
  signature: {
    eoe: string;
    forLine: string;
    signatoryLabel: string;
    /** One full-width row: E.&O.E. left, "For …" centre, signatory right (no terms cell) */
    spread?: boolean;
  };
  /** Optional free-placement text (notes, stamps, extra labels). */
  freeBoxes?: FreeBox[];
  /** Per-part layout for built-in fields (customer name, header title, bank lines, etc.). */
  designLayout?: Record<string, DesignPartLayout>;
};

export type BillItem = {
  description: string;
  hsn: string;
  qty: string;
  unit: string;
  rate: string;
  disc: string;
  [custom: string]: string;
};

export type DocumentLayout = {
  mode: "document";
  version: 2;
  spec: BillSpec;
  referenceImageUrl?: string | null;
};

export function isDocumentLayout(raw: unknown): raw is DocumentLayout {
  if (!raw || typeof raw !== "object") return false;
  const l = raw as DocumentLayout;
  return l.mode === "document" && !!l.spec && typeof l.spec === "object";
}

export function parseDocumentLayout(raw: unknown): DocumentLayout | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!isDocumentLayout(v)) return null;
  return { ...v, spec: normalizeSpec(v.spec) };
}

/** Fill any missing sections with defaults (older saved specs). */
export function normalizeSpec(raw: Partial<BillSpec>): BillSpec {
  const d = defaultBillSpec();
  const s = raw as BillSpec;
  return {
    ...d,
    ...s,
    page: { ...d.page, ...(s.page || {}) },
    layout: { ...d.layout, ...(s.layout || {}) },
    header: { ...d.header, ...(s.header || {}) },
    seller: { ...d.seller, ...(s.seller || {}) },
    receiver: {
      ...d.receiver,
      ...(s.receiver || {}),
      extraFields: Array.isArray(s.receiver?.extraFields) ? s.receiver.extraFields : [],
      gstinWidthPct: s.receiver?.gstinWidthPct ?? 100,
    },
    metaRows: Array.isArray(s.metaRows) ? s.metaRows : d.metaRows,
    columns: (Array.isArray(s.columns) ? s.columns : d.columns).map((c) => {
      const serial = /^(s\s*[.\-]?\s*[il1rn]\s*[.\-]?\s*n[o0]?\.?|sl\.?\s*no\.?|sr\.?\s*no\.?|s\.?\s*no\.?|serial(\s*no\.?)?|#|no\.?)$/i.test(
        String(c.label || "").replace(/\s+/g, " ").trim()
      );
      return {
        ...c,
        type: serial ? "index" : c.type,
        align: serial ? "center" : (c.align ?? professionalAlign(c)),
      };
    }),
    freeBoxes: Array.isArray(s.freeBoxes) ? s.freeBoxes : [],
    designLayout: s.designLayout && typeof s.designLayout === "object" ? s.designLayout : {},
    table: { ...d.table, ...(s.table || {}) },
    totals: { ...d.totals, ...(s.totals || {}) },
    footerFields: Array.isArray(s.footerFields)
      ? s.footerFields.map((f, i) => ({ line: f.id === "remark" ? 1 : 0, multiline: f.id === "remark", ...f, id: f.id || `f${i}` }))
      : d.footerFields,
    bank: { ...d.bank, ...(s.bank || {}) },
    rupees: { ...d.rupees, ...(s.rupees || {}) },
    terms: { ...d.terms, ...(s.terms || {}) },
    signature: { ...d.signature, ...(s.signature || {}) },
  };
}

export const BILL_FONT_STACK =
  'Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif';

export const EMPTY_ITEM: BillItem = {
  description: "",
  hsn: "",
  qty: "",
  unit: "",
  rate: "",
  disc: "",
};

export function isItemEmpty(it: BillItem): boolean {
  return !Object.values(it).some((v) => String(v || "").trim() !== "");
}

/** Standard Indian GST tax-invoice layout (matches the Chiripal / Tally-style bill). */
export function defaultBillSpec(): BillSpec {
  return {
    version: 2,
    page: { fontFamily: BILL_FONT_STACK, baseFontSize: 11 },
    layout: { receiverWidth: 56, footerLeftWidth: 56 },
    header: {
      title: "TAX INVOICE",
      copyLabel: "Original for Recipient",
      sellerGstinLabel: "GSTIN No.",
      showSellerGstin: true,
      showSellerName: false,
    },
    seller: {
      name: "",
      gstin: "",
      state: "",
      stateCode: "",
      address: "",
      stateLabel: "State",
      codeLabel: "Code",
    },
    receiver: {
      heading: "Details of Receiver | Billed to :",
      namePlaceholder: "Customer / company name",
      addressPlaceholder: "Address",
      showState: true,
      stateLabel: "State",
      codeLabel: "Code",
      showGstin: true,
      gstinLabel: "GSTIN No.",
    },
    metaRows: [
      { id: "invoice", label: "Invoice No", key: "invoice_no", withDate: true, dateLabel: "Date", dateKey: "invoice_date", enabled: true },
      { id: "challan", label: "Challan No", key: "challan_no", withDate: true, dateLabel: "Date", dateKey: "challan_date", enabled: true },
      { id: "po", label: "Your P.O.No", key: "po_no", withDate: true, dateLabel: "Date", dateKey: "po_date", enabled: true },
      { id: "vehicle", label: "Vehicle No", key: "vehicle_no", withDate: false, dateLabel: "Date", dateKey: "vehicle_date", enabled: true },
    ],
    columns: [
      { key: "sr", label: "Sr No", width: 5, align: "center", type: "index", enabled: true },
      { key: "description", label: "Description", width: 39, align: "left", type: "text", enabled: true },
      { key: "hsn", label: "HSN Code", width: 10, align: "center", type: "text", enabled: true },
      { key: "qty", label: "Qty", width: 7, align: "right", type: "number", enabled: true },
      { key: "unit", label: "Unit", width: 7, align: "center", type: "text", enabled: true },
      { key: "rate", label: "Rate", width: 10, align: "right", type: "number", enabled: true },
      { key: "disc", label: "Disc", width: 8, align: "right", type: "number", enabled: true },
      { key: "amount", label: "Amount", width: 14, align: "right", type: "computed", enabled: true },
    ],
    table: { minRows: 10, totalLabel: "Total", showTotalRow: true },
    totals: {
      basicLabel: "Basic Amount:-",
      cgstLabel: "CGST @{pct}%",
      sgstLabel: "SGST @{pct}%",
      igstLabel: "IGST @{pct}%",
      roundOffLabel: "Round Off",
      grandLabel: "G.Total Amount",
      gstPercent: 18,
      showRoundOff: true,
    },
    footerFields: [
      { id: "payment_days", label: "Payment Days", key: "payment_days", enabled: true, line: 0 },
      { id: "total_pkg", label: "Total Pkg.", key: "total_pkg", enabled: true, line: 0 },
      { id: "remark", label: "Remark", key: "remark", enabled: true, line: 1, multiline: true },
    ],
    bank: {
      enabled: true,
      nameLabel: "Bank Name",
      name: "",
      acLabel: "A/c. No.",
      acNo: "",
      ifscLabel: "IFSC Code",
      ifsc: "",
      branchLabel: "Branch",
      branch: "",
    },
    rupees: { enabled: true, label: "RUPEES :" },
    terms: {
      enabled: true,
      heading: "Terms & Conditions:-",
      lines: [
        "Goods once sold will not be taken back.",
        "Our risk & responsibility ceases as soon as goods are delivered.",
        "Interest will be charged if payment is not made within due days.",
        "Subject to local jurisdiction.",
      ],
    },
    signature: {
      eoe: "E. & O.E.",
      forLine: "For, {seller}",
      signatoryLabel: "(Authorised Signatory)",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Inference from uploaded bill text                                    */
/* ------------------------------------------------------------------ */

const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g;

function clean(s: string | undefined | null): string {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/\u0000/g, "")
    .trim();
}

/** Build a BillSpec by reading the text of the uploaded (filled) bill. */
export function inferBillSpecFromText(rawText: string, businessName?: string): BillSpec {
  const spec = defaultBillSpec();
  const text = String(rawText || "").replace(/\u0000/g, "");
  const flat = text.replace(/\s+/g, " ");

  // Seller GSTIN = first GSTIN in the header area
  const gstins = flat.match(GSTIN_RE) || [];
  if (gstins[0]) spec.seller.gstin = gstins[0];

  // Title & copy label
  const title = flat.match(/\b(TAX INVOICE|PROFORMA INVOICE|BILL OF SUPPLY|INVOICE|CASH MEMO|RETAIL INVOICE)\b/i);
  if (title) spec.header.title = title[1].toUpperCase();
  else if (/\bcash\W{0,2}\w{0,3}emo\b/i.test(flat)) spec.header.title = "CASH MEMO";
  const copy = flat.match(/\b(Original for Recipient|Duplicate for Transporter|Triplicate for Supplier|Original Copy|Customer Copy)\b/i);
  if (copy) spec.header.copyLabel = copy[1];

  // Seller state + code (first occurrence)
  const st = flat.match(/State\s+([A-Za-z .]+?)\s+Code\s+(\d{1,2})\b/);
  if (st) {
    spec.seller.state = clean(st[1]).toUpperCase();
    spec.seller.stateCode = st[2];
  }

  // Seller name from "For, XYZ" signature line
  const forLine = text.match(/\bFor\s*([,\-–:])\s*([^\n(]+?)\s*(?:\n|\(Authorised|Signature|$)/i);
  if (forLine) {
    spec.seller.name = clean(forLine[2]);
    spec.signature.forLine = forLine[1] === "," ? "For, {seller}" : `For${forLine[1]} {seller}`;
  } else if (businessName) {
    spec.seller.name = businessName;
  }

  // Receiver heading
  const recv = flat.match(/(Details of Receiver[^A-Z]{0,3}\|?\s*Billed to\s*:?|Bill To\s*:?|Buyer\s*:?|Consignee\s*:?)/i);
  if (recv) spec.receiver.heading = clean(recv[1]).replace(/\s*:\s*$/, " :");

  // Meta rows presence
  const hasChallan = /Challan\s*No/i.test(flat);
  const hasPo = /P\.?\s*O\.?\s*No|Purchase\s*Order/i.test(flat);
  const hasVehicle = /Veh[ia]cal\s*No|Vehicle\s*No/i.test(flat);
  spec.metaRows = spec.metaRows.map((r) => {
    if (r.id === "challan") return { ...r, enabled: hasChallan };
    if (r.id === "po") return { ...r, enabled: hasPo, label: flat.match(/Your\s*P\.?O\.?\s*No/i) ? "Your P.O.No" : r.label };
    if (r.id === "vehicle") {
      const lbl = flat.match(/(Veh[ia]cal\s*No|Vehicle\s*No)/i);
      return { ...r, enabled: hasVehicle, label: lbl ? clean(lbl[1]) : r.label };
    }
    return r;
  });

  // Columns presence
  const colFlags: Record<string, boolean> = {
    hsn: /\bHSN\b|\bSAC\b/i.test(flat),
    unit: /\bUnit\b|\bUOM\b|\bPer\b/i.test(flat),
    disc: /\bDisc\b|\bDiscount\b/i.test(flat),
  };
  spec.columns = spec.columns.map((c) => {
    if (c.key in colFlags) return { ...c, enabled: colFlags[c.key] };
    return c;
  });
  // Redistribute width when columns disabled
  const enabled = spec.columns.filter((c) => c.enabled);
  const sum = enabled.reduce((s, c) => s + c.width, 0);
  if (sum > 0 && sum !== 100) {
    spec.columns = spec.columns.map((c) =>
      c.enabled ? { ...c, width: Math.round((c.width / sum) * 1000) / 10 } : c
    );
  }

  // GST percent
  const pct = flat.match(/CGST\s*@?\s*([\d.]+)\s*%/i) || flat.match(/IGST\s*@?\s*([\d.]+)\s*%/i);
  if (pct) {
    const p = Number(pct[1]);
    if (p > 0) spec.totals.gstPercent = /CGST/i.test(pct[0]) ? p * 2 : p;
  }
  const basicLbl = flat.match(/(Basic\s*Amount\s*:?-?|Taxable\s*(?:Value|Amount)\s*:?-?|Sub\s*Total\s*:?)/i);
  if (basicLbl) spec.totals.basicLabel = clean(basicLbl[1]);
  const grandLbl = flat.match(/(G\.?\s*Total\s*Amount|Grand\s*Total|Net\s*Amount|Total\s*Amount)/i);
  if (grandLbl) spec.totals.grandLabel = clean(grandLbl[1]);

  // Footer fields presence
  spec.footerFields = spec.footerFields.map((f) => {
    if (f.id === "payment_days") return { ...f, enabled: /Payment\s*Days/i.test(flat) };
    if (f.id === "total_pkg") return { ...f, enabled: /Total\s*Pkg/i.test(flat) };
    if (f.id === "remark") return { ...f, enabled: /Remark/i.test(flat) };
    return f;
  });

  // Bank
  const bankName = flat.match(/Bank\s*Nam\s*e?\s*:?\s*(.+?)\s+A\/c/i) || flat.match(/Bank\s*Name\s*:?\s*([^,]+?)(?:\s{2,}|A\/c|$)/i);
  const ac = flat.match(/A\/c\.?\s*No\.?\s*:?\s*([\d ]{8,20})/i);
  const ifsc = flat.match(/IFSC\s*(?:Code)?\s*:?\s*([A-Z]{4}0[A-Z0-9]{6})/i);
  const branch = flat.match(/Branch\s*:?\s*([A-Za-z .]+?)(?:\s+RUPEES|\s+IFSC|\s+A\/c|\s{2,}|$)/i);
  if (bankName || ac || ifsc) {
    spec.bank.enabled = true;
    if (bankName) spec.bank.name = clean(bankName[1]);
    if (ac) spec.bank.acNo = clean(ac[1]).replace(/\s/g, "");
    if (ifsc) spec.bank.ifsc = ifsc[1].toUpperCase();
    if (branch) spec.bank.branch = clean(branch[1]);
  } else {
    spec.bank.enabled = false;
  }

  // Rupees in words label
  spec.rupees.enabled = /RUPEES|Amount\s*in\s*Words|Rs\.\s*in\s*words/i.test(flat);
  const rupLbl = flat.match(/(Rupees\s*in\s*words\s*:?|RUPEES\s*:|Amount\s*in\s*Words\s*:?|Rs\.\s*in\s*words\s*:?)/i);
  if (rupLbl) spec.rupees.label = clean(rupLbl[1]);

  // Terms
  const termsBlock = text.match(/Terms\s*&\s*Conditions\s*:?-?\s*([\s\S]*?)(?:E\.?\s*&\s*O\.?\s*E|For\s*,|\(Authorised|$)/i);
  if (termsBlock) {
    const lines = termsBlock[1]
      .split(/\n|(?=\s\d\)\s)|(?=\s\d\.\s)/)
      .map((l) => clean(l).replace(/^\d+[).]\s*/, ""))
      .filter((l) => l.length > 3);
    if (lines.length) {
      spec.terms.enabled = true;
      spec.terms.lines = lines.slice(0, 8);
    }
    const heading = flat.match(/(Terms\s*&\s*Conditions\s*:?-?)/i);
    if (heading) spec.terms.heading = clean(heading[1]);
  } else {
    spec.terms.enabled = /Terms/i.test(flat);
  }

  const eoe = flat.match(/(E\.?\s*&\s*O\.?\s*E\.?)/i);
  if (eoe) spec.signature.eoe = clean(eoe[1]);
  const signatory = flat.match(/\((Authori[sz]ed\s*Signatory)\)?/i);
  if (signatory) spec.signature.signatoryLabel = `(${clean(signatory[1])})`;
  else {
    const sig = flat.match(/\b(Receiver'?s?\s*Sign(?:ature)?|Authori[sz]ed\s*Sign(?:ature)?|Signature)\b/i);
    if (sig) spec.signature.signatoryLabel = clean(sig[1]);
  }

  // Bills without GST (cash memo, estimate, kachha bill): no tax rows, no GSTIN / state blocks
  const hasGst = gstins.length > 0 || /\b(GST|CGST|SGST|IGST|UTGST|HSN|SAC)\b|tax\s*invoice/i.test(flat);
  if (!hasGst) {
    spec.header.showSellerGstin = false;
    spec.header.showSellerState = false;
    spec.receiver.showGstin = false;
    spec.receiver.showState = /\bState\b/i.test(flat);
    if (!copy) spec.header.copyLabel = "";
    spec.totals.gstPercent = 0;
    spec.totals.showRoundOff = /round\s*off/i.test(flat);
    spec.totals.showBasic = !!basicLbl;
    if (!grandLbl && /\bTotal\b/i.test(flat)) spec.totals.grandLabel = "Total";
  }

  return spec;
}

/* ------------------------------------------------------------------ */
/* Money math                                                            */
/* ------------------------------------------------------------------ */

/**
 * First number in a cell. Keeps Indian grouping ("1,50,000", "1,500.00") and
 * ignores a unit written after it ("20 Bag", "10 Pes"). Never glues two
 * numbers together: "20&21" is 20, not 2021.
 */
export function num(v: unknown): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const m = s.match(/-?(?:\d[\d,]*\d|\d)(?:\.\d+)?|\.\d+/);
  if (!m) return 0;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A discount changes the amount only when the bill actually has a Disc column. */
function discountApplies(spec: Pick<BillSpec, "columns"> | null | undefined): boolean {
  if (spec == null) return true;
  return spec.columns.some((c) => c.enabled && (c.key === "disc" || /^disc(ount)?\b/i.test(c.label || "")));
}

/** Line amount = quantity × rate, minus a rupee discount when that column is on the bill. */
export function itemAmount(it: BillItem, spec?: Pick<BillSpec, "columns"> | null): number {
  const q = num(it.qty);
  const r = num(it.rate);
  const d = discountApplies(spec) ? num(it.disc) : 0;
  return Math.max(0, money2(q * r - d));
}

export type BillTotals = {
  basic: number;
  cgst: number;
  sgst: number;
  igst: number;
  interstate: boolean;
  roundOff: number;
  grand: number;
  qtyTotal: number;
  /** effective bill-level rate (or the single rate when every line shares one) */
  gstPercent: number;
  /** true when line items carry different GST rates */
  mixedRates: boolean;
  /** true when no tax is charged (rate 0 or tax mode "none") */
  noTax: boolean;
  taxMode: TaxMode;
  /** per-rate breakup, e.g. [{pct: 5, taxable: 1000, tax: 50}] */
  breakup: { pct: number; taxable: number; tax: number }[];
};

/** How the tax is split. "auto" decides from seller vs buyer state code. */
export type TaxMode = "auto" | "intra" | "inter" | "none";

/** Special keys stored inside field_values that drive tax on a specific bill. */
export const GST_OVERRIDE_KEY = "__gst";
export const TAX_MODE_KEY = "__tax";
/** Column key for an optional per-line GST % column. */
export const GST_COLUMN_KEY = "gst";
/** Rates currently in force in India (%). */
export const GST_SLABS = [0, 0.25, 3, 5, 12, 18, 28] as const;

export function billGstPercent(spec: BillSpec, values: Record<string, string>): number {
  const raw = values[GST_OVERRIDE_KEY];
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
  }
  return spec.totals.gstPercent || 0;
}

export function billTaxMode(values: Record<string, string>): TaxMode {
  const m = values[TAX_MODE_KEY];
  return m === "intra" || m === "inter" || m === "none" ? m : "auto";
}

export function hasGstColumn(spec: BillSpec): boolean {
  return spec.columns.some((c) => c.key === GST_COLUMN_KEY && c.enabled);
}

/** GST % applying to one line: the line's own rate (if the column is on) else the bill rate. */
export function itemGstPercent(spec: BillSpec, it: BillItem, billPct: number): number {
  if (hasGstColumn(spec)) {
    const raw = (it[GST_COLUMN_KEY] ?? "").toString().trim();
    if (raw !== "") {
      const n = Number(raw.replace("%", ""));
      if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
    }
  }
  return billPct;
}

export function computeTotals(
  spec: BillSpec,
  items: BillItem[],
  values: Record<string, string>
): BillTotals {
  const live = items.filter((it) => !isItemEmpty(it));
  const basic = money2(live.reduce((s, it) => s + itemAmount(it, spec), 0));
  const qtyTotal = +live.reduce((s, it) => s + num(it.qty), 0).toFixed(3);
  const billPct = billGstPercent(spec, values);
  const taxMode = billTaxMode(values);

  const sellerCode = (spec.seller.stateCode || "").trim();
  const buyerCode = (values.buyer_code || "").trim();
  const sellerState = (spec.seller.state || "").trim().toLowerCase();
  const buyerState = (values.buyer_state || "").trim().toLowerCase();
  let interstate = false;
  if (taxMode === "inter") interstate = true;
  else if (taxMode === "intra") interstate = false;
  else if (sellerCode && buyerCode) interstate = sellerCode !== buyerCode;
  else if (sellerState && buyerState) interstate = sellerState !== buyerState;

  // per-rate breakup (supports a GST % column with different slabs per line)
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const it of live) {
    const p = taxMode === "none" ? 0 : itemGstPercent(spec, it, billPct);
    const amt = itemAmount(it, spec);
    const cur = byRate.get(p) || { taxable: 0, tax: 0 };
    cur.taxable += amt;
    byRate.set(p, cur);
  }
  const breakup = [...byRate.entries()]
    .map(([pct, v]) => ({ pct, taxable: +v.taxable.toFixed(2), tax: +((v.taxable * pct) / 100).toFixed(2) }))
    .sort((a, b) => a.pct - b.pct);
  const gstTotal = +breakup.reduce((s, b) => s + b.tax, 0).toFixed(2);
  const rates = breakup.map((b) => b.pct).filter((p) => p > 0);
  const mixedRates = new Set(rates).size > 1;
  const effectivePct = taxMode === "none" ? 0 : mixedRates ? billPct : rates[0] ?? billPct;

  // Split in paise so CGST + SGST is exactly the tax (half + half can be 0.01 off)
  const taxPaise = Math.round(gstTotal * 100);
  const cgstPaise = interstate ? 0 : Math.round(taxPaise / 2);
  const sgstPaise = interstate ? 0 : taxPaise - cgstPaise;
  const cgst = cgstPaise / 100;
  const sgst = sgstPaise / 100;
  const igst = interstate ? gstTotal : 0;
  const raw = basic + cgst + sgst + igst;
  const grand = spec.totals.showRoundOff ? Math.round(raw) : +raw.toFixed(2);
  const roundOff = +(grand - raw).toFixed(2);
  const noTax = taxMode === "none" || gstTotal === 0 && effectivePct === 0;

  return {
    basic,
    cgst,
    sgst,
    igst,
    interstate,
    roundOff,
    grand,
    qtyTotal,
    gstPercent: effectivePct,
    mixedRates,
    noTax,
    taxMode,
    breakup,
  };
}

/** Label for a tax row: "CGST @{pct}%" → "CGST @9%" or, when rates differ per line, plain "CGST". */
export function taxRowLabel(template: string, totals: BillTotals, half: boolean): string {
  if (totals.mixedRates) {
    return template.replace(/\s*@?\s*\{pct\}\s*%?/g, "").trim() || template;
  }
  const p = half ? totals.gstPercent / 2 : totals.gstPercent;
  return template.replace("{pct}", trimPct(p));
}

function trimPct(p: number): string {
  return Number.isInteger(p) ? String(p) : String(+p.toFixed(2));
}

export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : String(+n.toFixed(3));
}

/* ------------------------------------------------------------------ */
/* Amount in words (Indian numbering)                                    */
/* ------------------------------------------------------------------ */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? " " + ONES[o] : "");
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ONES[h] + " Hundred");
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

export function numberToWordsIndian(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const hundreds = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(numberToWordsIndian(crore) + " Crore");
  if (lakh) parts.push(twoDigits(lakh) + " Lakh");
  if (thousand) parts.push(twoDigits(thousand) + " Thousand");
  if (hundreds) parts.push(threeDigits(hundreds));
  return parts.join(" ");
}

export function amountInWordsINR(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const paiseTotal = Math.max(0, Math.round(amount * 100));
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const parts: string[] = [];
  if (rupees) parts.push(numberToWordsIndian(rupees) + " Rupees");
  if (paise) parts.push(twoDigits(paise) + " Paise");
  return (parts.join(" and ") || "Zero Rupees") + " Only";
}

/* ------------------------------------------------------------------ */
/* Helpers used by API                                                   */
/* ------------------------------------------------------------------ */

export function specToFieldSchema(spec: BillSpec) {
  const fields: Array<{ key: string; label: string; type: string; required: boolean }> = [
    { key: "customer_name", label: "Customer Name", type: "text", required: true },
    { key: "address", label: "Address", type: "text", required: false },
  ];
  if (spec.receiver.showState) {
    fields.push({ key: "buyer_state", label: spec.receiver.stateLabel, type: "text", required: false });
    fields.push({ key: "buyer_code", label: spec.receiver.codeLabel, type: "text", required: false });
  }
  if (spec.receiver.showGstin) {
    fields.push({ key: "gstin", label: spec.receiver.gstinLabel, type: "text", required: false });
  }
  for (const r of spec.metaRows.filter((m) => m.enabled)) {
    fields.push({ key: r.key, label: r.label, type: "text", required: false });
    if (r.withDate) fields.push({ key: r.dateKey, label: `${r.label} ${r.dateLabel}`, type: "text", required: false });
  }
  for (const f of spec.footerFields.filter((x) => x.enabled)) {
    fields.push({ key: f.key, label: f.label, type: "text", required: false });
  }
  return fields;
}

export function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export function fillTemplate(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
