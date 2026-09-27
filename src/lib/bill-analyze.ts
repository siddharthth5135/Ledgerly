/**
 * Geometric bill analysis (server only).
 *
 * Reads the uploaded PDFs with pdf.js:
 *  - text items with positions (labels in the EMPTY bill, values in the FILLED bill)
 *  - painted thin rectangles / strokes = the ruling grid (column rules, row bands)
 * and reconstructs a BillSpec whose column widths, block splits and fields match
 * the original bill exactly. Values = FILLED − EMPTY (by text + position).
 */
import {
  defaultBillSpec,
  inferBillSpecFromText,
  type BillColumn,
  type BillItem,
  type BillSpec,
  type FooterField,
  type MetaRow,
} from "./bill-spec";
import { sanitizeForDbText } from "./bill-ocr";

export type TItem = { s: string; x: number; y: number; w: number; h: number; fs: number };
export type HLine = { y: number; x0: number; x1: number };
export type VLine = { x: number; y0: number; y1: number };
export type PageAnalysis = {
  width: number;
  height: number;
  texts: TItem[];
  h: HLine[];
  v: VLine[];
  text: string;
};

export type DetectedField = {
  zone: "header" | "receiver" | "reference" | "table" | "footer" | "totals";
  label: string;
  key: string;
  value: string;
  confidence: "high" | "medium" | "low";
};

export type AnalysisResult = {
  spec: BillSpec;
  detected: DetectedField[];
  method: "geometry" | "text";
};

/* ------------------------------------------------------------------ */
/* pdf.js extraction                                                     */
/* ------------------------------------------------------------------ */

export async function analyzePdfPage(buf: Buffer): Promise<PageAnalysis> {
  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const pdfjs = await getResolvedPDFJS();
  const OPS = pdfjs.OPS as Record<string, number>;
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const page = await pdf.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const W = vp.width;
  const H = vp.height;

  const tc = await page.getTextContent();
  const texts: TItem[] = [];
  for (const raw of tc.items as Array<Record<string, unknown>>) {
    const s = String(raw.str ?? "");
    if (!s.trim()) continue;
    const tr = raw.transform as number[];
    const fs = Math.hypot(tr[0], tr[1]);
    texts.push({
      s: sanitizeForDbText(s).replace(/\s+/g, " "),
      x: (tr[4] / W) * 100,
      y: ((H - tr[5]) / H) * 100,
      w: ((raw.width as number) / W) * 100,
      h: ((raw.height as number) / H) * 100,
      fs,
    });
  }

  const h: HLine[] = [];
  const v: VLine[] = [];
  try {
    const ol = await page.getOperatorList();
    for (let i = 0; i < ol.fnArray.length; i++) {
      if (ol.fnArray[i] !== OPS.constructPath) continue;
      const args = ol.argsArray[i] as unknown[];
      const op = args[0] as number;
      if (op === OPS.endPath || op === OPS.clip || op === OPS.eoClip) continue;
      const mm = args[2] as ArrayLike<number> | undefined;
      if (!mm) continue;
      const box = Array.from(mm as ArrayLike<number>);
      if (box.length < 4) continue;
      const [x0, y0, x1, y1] = box;
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bh <= 3 && bw > 8) {
        h.push({ y: ((H - (y0 + y1) / 2) / H) * 100, x0: (x0 / W) * 100, x1: (x1 / W) * 100 });
      } else if (bw <= 3 && bh > 8) {
        v.push({ x: ((x0 + x1) / 2 / W) * 100, y0: ((H - y1) / H) * 100, y1: ((H - y0) / H) * 100 });
      }
    }
  } catch {
    /* no vector info */
  }

  const text = texts
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .reduce((acc, t, i, arr) => {
      const prev = arr[i - 1];
      const sep = prev && Math.abs(prev.y - t.y) < 0.6 ? " " : "\n";
      return acc + (i ? sep : "") + t.s;
    }, "");

  return { width: W, height: H, texts, h: mergeH(h), v: mergeV(v), text };
}

function mergeH(lines: HLine[]): HLine[] {
  const sorted = lines.slice().sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const out: HLine[] = [];
  for (const l of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - l.y) < 0.2 && l.x0 <= last.x1 + 0.4) {
      last.x1 = Math.max(last.x1, l.x1);
      last.x0 = Math.min(last.x0, l.x0);
    } else out.push({ ...l });
  }
  return out;
}
function mergeV(lines: VLine[]): VLine[] {
  const sorted = lines.slice().sort((a, b) => a.x - b.x || a.y0 - b.y0);
  const out: VLine[] = [];
  for (const l of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - l.x) < 0.25 && l.y0 <= last.y1 + 0.4) {
      last.y1 = Math.max(last.y1, l.y1);
      last.y0 = Math.min(last.y0, l.y0);
    } else out.push({ ...l });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* helpers                                                               */
/* ------------------------------------------------------------------ */

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const cx = (t: TItem) => t.x + t.w / 2;

function groupLines(items: TItem[], tol = 0.7): TItem[][] {
  const sorted = items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: TItem[][] = [];
  for (const t of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - t.y) <= tol) row.push(t);
    else rows.push([t]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

/** Items in FILLED that do not exist (same text near same place) in EMPTY. */
function diffValues(empty: TItem[], filled: TItem[]): TItem[] {
  const out: TItem[] = [];
  for (const f of filled) {
    const same = empty.find(
      (e) => norm(e.s) === norm(f.s) && Math.abs(e.y - f.y) < 2.0 && Math.abs(e.x - f.x) < 3
    );
    if (same) continue;
    // label merged with value: "GSTIN No. 24AAACC..." vs "GSTIN No."
    const prefix = empty.find(
      (e) =>
        Math.abs(e.y - f.y) < 2.0 &&
        Math.abs(e.x - f.x) < 3 &&
        norm(f.s).startsWith(norm(e.s)) &&
        norm(f.s).length > norm(e.s).length + 1
    );
    if (prefix) {
      const rest = f.s.slice(prefix.s.length).trim();
      if (rest) out.push({ ...f, s: rest, x: f.x + prefix.w, w: Math.max(0.5, f.w - prefix.w) });
      continue;
    }
    out.push(f);
  }
  return out;
}

function slug(s: string): string {
  return (
    norm(s)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field"
  );
}

const COLUMN_KEY: Array<[RegExp, string, BillColumn["type"], BillColumn["align"]]> = [
  [/^(s[.\s\-]*[il1rn][.\s\-]*n[o0]?\.?|s[rli1]\.?(\s*no\.?)?|s\.?\s*no\.?|no\.?|#|serial(\s*no\.?)?)$/i, "sr", "index", "center"],
  [/desc|particular|item|product|goods|service/i, "description", "text", "left"],
  [/hsn|sac/i, "hsn", "text", "center"],
  [/qty|quantity|nos\b/i, "qty", "number", "right"],
  [/unit|uom|\bper\b/i, "unit", "text", "center"],
  [/rate|price/i, "rate", "number", "right"],
  [/disc/i, "disc", "number", "right"],
  [/amount|total|value/i, "amount", "computed", "right"],
];

function columnFromLabel(label: string): Pick<BillColumn, "key" | "type" | "align"> {
  for (const [re, key, type, align] of COLUMN_KEY) {
    if (re.test(label.replace(/\s+/g, " "))) return { key, type, align };
  }
  return { key: slug(label), type: "text", align: "left" };
}

const META_KEY: Array<[RegExp, string]> = [
  [/invoice|bill\s*no|inv\.?\s*no/i, "invoice_no"],
  [/challan|dc\s*no|delivery/i, "challan_no"],
  [/p\.?\s*o\.?\s*no|purchase\s*order|order\s*no/i, "po_no"],
  [/veh[ia]cal|vehicle|lorry|truck/i, "vehicle_no"],
  [/e-?\s*way/i, "eway_no"],
  [/transport/i, "transport"],
  [/lr\s*no|l\.r\./i, "lr_no"],
  [/due/i, "due_date"],
];
function metaKey(label: string): string {
  for (const [re, key] of META_KEY) if (re.test(label)) return key;
  return slug(label);
}

const LABEL_LIKE = /^[A-Za-z][A-Za-z .&/()'-]*:?-?$/;
const IS_DATE_LABEL = /^dt\.?$|^date$|^dated$/i;

/** "Name ........", "Date :-", "No.____" → the printed label without its leader */
const stripLeader = (s: string) => s.replace(/(?:\s*[.·…_\-–:]){2,}\s*$/, "").replace(/\s*:\s*$/, "").trim();
/** Handwritten / typed answer without the dots or colon it was written on */
const cleanValue = (s: string) => s.replace(/^[\s.·…_\-–:]+|[\s.·…_\-–:]+$/g, "").trim();

const FIELD_START =
  /^(no|bill|memo|cash\s*memo|invoice|inv|serial|s[lr]\.?\s*no|date|dated|dt|name|m\/s|mr|mrs|shri|customer|party|buyer|client|address|addr|mob|mobile|phone|ph|contact|gstin|gst|state|city|place|vehicle|challan|order|p\.?\s*o|ref)\b/i;
const TITLE_WORD = /cash\W{0,2}\w{0,3}emo|tax\s*invoice|retail\s*invoice|bill\s*of\s*supply|proforma|quotation|estimate|invoice|challan|receipt|\bbill\b/i;
const CONTACT_WORD = /\b(mob|mobile|ph|phone|tel|contact|whats\s*app|e-?mail)\b|@|\+91|\b\d{10}\b/i;

function parseRowsHeader(o: {
  lines: TItem[][];
  zoneVals: TItem[];
  spec: BillSpec;
  sample: Record<string, string>;
  detected: DetectedField[];
  left0: number;
  right0: number;
  sellerFromFor: boolean;
}) {
  const { lines, zoneVals, spec, sample, detected, left0, right0 } = o;
  const isFieldLine = (l: TItem[]) => {
    const first = l[0];
    if (!first || first.x > left0 + 10) return false;
    const lbl = stripLeader(first.s);
    return FIELD_START.test(lbl) || (LABEL_LIKE.test(lbl) && /[:.·…_]{1,}\s*$/.test(first.s));
  };
  let firstField = lines.findIndex(isFieldLine);
  if (firstField < 0) firstField = lines.length;

  /* ---- letterhead: title, business name, address, contact numbers ---- */
  const head = lines.slice(0, firstField).flat();
  const titleItem = head.find((t) => TITLE_WORD.test(t.s) && !CONTACT_WORD.test(t.s));
  const contact = head.filter((t) => t !== titleItem && CONTACT_WORD.test(t.s));
  const rest = head.filter((t) => t !== titleItem && !contact.includes(t));
  const fsSorted = rest.map((t) => t.fs).sort((a, b) => a - b);
  const medianFs = fsSorted[Math.floor(fsSorted.length / 2)] || 1;
  const big = rest.filter((t) => t.fs >= medianFs * 1.6);
  // pieces of decorative lettering that sit inside the big name's height belong to the name
  const nameItems = rest.filter((t) => big.includes(t) || big.some((b) => t.y > b.y - b.h - 0.3 && t.y < b.y + 0.5));
  const addrItems = rest.filter((t) => !nameItems.includes(t) && t.s.replace(/[^A-Za-z0-9]/g, "").length > 2);

  spec.header.showSellerName = true;
  spec.header.titlePlacement = "banner";
  spec.header.showSellerState = false;
  if (titleItem) {
    const raw = titleItem.s.replace(/[|[\]{}]/g, " ").replace(/\s+/g, " ").trim();
    spec.header.title = /cash\W{0,2}\w{0,3}emo/i.test(raw) ? "Cash Memo" : raw;
  } else spec.header.title = "";
  if (!o.sellerFromFor && nameItems.length) {
    spec.seller.name = nameItems
      .sort((a, b) => a.x - b.x)
      .map((t) => t.s)
      .join(" ")
      .trim();
  }
  const addrLines = groupLines(addrItems).map((l) => l.map((t) => t.s).join(" ").trim());
  if (addrLines.length) spec.seller.address = addrLines.join("\n");
  const centre = (left0 + right0) / 2;
  const addrMid = addrItems.length ? addrItems.reduce((s, t) => s + cx(t), 0) / addrItems.length : centre;
  spec.header.bannerAlign = Math.abs(addrMid - centre) < 10 ? "center" : addrMid < centre ? "left" : "right";

  if (contact.length) {
    const cl = groupLines(contact);
    const x0 = Math.min(...contact.map((t) => t.x));
    const x1 = Math.max(...contact.map((t) => t.x + t.w));
    const top = Math.min(...contact.map((t) => t.y - t.h));
    const right = x0 > centre;
    spec.freeBoxes = [
      ...(spec.freeBoxes || []),
      {
        id: "contact",
        text: cl.map((l) => l.map((t) => t.s).join(" ")).join("\n"),
        xPct: Math.round(x0 * 10) / 10,
        yPct: Math.round(Math.max(0, top) * 10) / 10,
        wPct: Math.round(Math.max(12, x1 - x0 + 2) * 10) / 10,
        align: right ? "right" : "left",
        enabled: true,
      },
    ];
    detected.push({ zone: "header", label: "Contact", key: "contact", value: cl.map((l) => l.map((t) => t.s).join(" ")).join(" / "), confidence: "medium" });
  }

  /* ---- one labelled field per printed line ---- */
  spec.layout.partyStyle = "rows";
  spec.receiver.heading = "";
  spec.receiver.showGstin = false;
  spec.receiver.showState = false;
  spec.receiver.extraFields = [];
  const metaRows: MetaRow[] = [];
  const used = new Set<TItem>();
  const valueFor = (label: TItem, next: TItem | undefined) =>
    cleanValue(
      zoneVals
        .filter((v) => !used.has(v) && Math.abs(v.y - label.y) < 1.8 && v.x >= label.x + label.w * 0.6 - 0.5 && (!next || v.x < next.x - 0.3))
        .sort((a, b) => a.x - b.x)
        .map((v) => (used.add(v), v.s))
        .join(" ")
    );

  // Only the filled bill was uploaded: labels and answers come mixed ("No. 0145", "Name  Shree Ram")
  const mixed = zoneVals.length === 0;
  lines.slice(firstField).forEach((row, ln) => {
    const line = mixed
      ? row.flatMap((t) => {
          const m = t.s.match(/^([A-Za-z][A-Za-z .&/()'-]*?)[\s.·…_:\-–]+(\S.*)$/);
          if (!m || !FIELD_START.test(m[1].trim())) return [t];
          const lw = (t.w * m[1].length) / t.s.length;
          return [{ ...t, s: m[1].trim(), w: lw }, { ...t, s: m[2], x: t.x + lw, w: t.w - lw }];
        })
      : row;
    const isLabel = (t: TItem, i: number) =>
      LABEL_LIKE.test(stripLeader(t.s)) && (!mixed || i === 0 || FIELD_START.test(stripLeader(t.s)) || /[.·…_:]{2,}\s*$|:\s*$/.test(t.s));
    const labels = line.filter(isLabel);
    const lineVal = (l: TItem, next: TItem | undefined) =>
      cleanValue(
        line
          .filter((t) => t.x > l.x && (!next || t.x < next.x) && !labels.includes(t))
          .map((t) => t.s)
          .join(" ")
      );
    let lastMeta: MetaRow | null = null;
    labels.forEach((l, i) => {
      const label = stripLeader(l.s);
      if (!label) return;
      const val = mixed ? lineVal(l, labels[i + 1]) : valueFor(l, labels[i + 1]);
      const k = label.toLowerCase().replace(/[^a-z/ ]/g, "").trim();
      if (/^(name|m\/?s|mr|mrs|shri|customer|party|buyer|client|sold to|to)\b/.test(k)) {
        spec.receiver.nameLabel = label;
        if (val) sample.customer_name = val;
        detected.push({ zone: "receiver", label, key: "customer_name", value: val, confidence: "high" });
      } else if (/^(address|addr)/.test(k)) {
        spec.receiver.addressLabel = label;
        // answers often run onto the next line under the label
        const more = zoneVals.filter((v) => !used.has(v) && v.y > l.y + 0.6 && v.y < l.y + 3.5);
        more.forEach((v) => used.add(v));
        const full = [val, ...more.map((v) => cleanValue(v.s))].filter(Boolean).join(" ");
        if (full) sample.address = full;
        detected.push({ zone: "receiver", label, key: "address", value: full, confidence: "high" });
      } else if (/^(gstin|gst)/.test(k)) {
        spec.receiver.showGstin = true;
        spec.receiver.gstinLabel = label;
        if (val) sample.gstin = val;
      } else if (/^state/.test(k)) {
        spec.receiver.showState = true;
        spec.receiver.stateLabel = label;
        if (val) sample.buyer_state = val;
      } else if (/^(mob|mobile|ph|phone|contact)/.test(k)) {
        spec.receiver.extraFields!.push({ id: "phone", label, key: "phone", enabled: true, widthPct: 100 });
        if (val) sample.phone = val;
      } else if (/^(date|dated|dt)$/.test(k) && lastMeta) {
        lastMeta.withDate = true;
        lastMeta.dateLabel = label;
        if (val) sample[lastMeta.dateKey] = val;
        detected.push({ zone: "reference", label, key: lastMeta.dateKey, value: val, confidence: "high" });
      } else {
        const isNo = /^(no|bill no|memo no|cash memo no|invoice|inv no|serial no|s[lr] no)\b/.test(k);
        const isDate = /^(date|dated|dt)$/.test(k);
        const key = isNo ? "invoice_no" : isDate ? "bill_date" : metaKey(label);
        if (metaRows.some((m) => m.key === key)) return;
        const row: MetaRow = {
          id: key,
          label,
          key,
          withDate: false,
          dateLabel: "Date",
          dateKey: key === "invoice_no" ? "invoice_date" : `${key}_date`,
          enabled: true,
          line: ln,
        };
        metaRows.push(row);
        lastMeta = row;
        if (val) sample[key] = val;
        detected.push({ zone: "reference", label, key, value: val, confidence: val ? "high" : "medium" });
      }
    });
  });
  spec.metaRows = metaRows;
}

/* ------------------------------------------------------------------ */
/* main                                                                  */
/* ------------------------------------------------------------------ */

export function buildSpecFromAnalysis(
  empty: PageAnalysis | null,
  filled: PageAnalysis,
  businessName?: string
): AnalysisResult {
  const base = empty ?? filled;
  // Labels/structure from the empty bill; fall back to regex-only inference.
  const spec = inferBillSpecFromText(filled.text + "\n" + base.text, businessName);
  spec.layout = { ...defaultBillSpec().layout };
  const detected: DetectedField[] = [];
  const values = empty ? diffValues(empty.texts, filled.texts) : [];

  const contentX0 = Math.min(...base.v.map((l) => l.x), ...base.h.map((l) => l.x0), 100);
  const contentX1 = Math.max(...base.v.map((l) => l.x), ...base.h.map((l) => l.x1), 0);
  const contentW = contentX1 - contentX0;
  const hasGrid = base.h.length >= 4 && base.v.length >= 4 && contentW > 40;
  const pct = (x: number) => Math.round(((x - contentX0) / contentW) * 1000) / 10;

  // Letterhead / margins: where the printed grid starts and ends on the page
  if (hasGrid) {
    const gridTop = Math.min(...base.h.map((l) => l.y), ...base.v.map((l) => l.y0));
    const gridBottom = Math.max(...base.h.map((l) => l.y), ...base.v.map((l) => l.y1));
    spec.layout.topMarginPct = Math.max(0, Math.round(gridTop * 10) / 10);
    spec.layout.bottomMarginPct = Math.max(0, Math.round((100 - gridBottom) * 10) / 10);
    spec.layout.sideMarginPct = Math.max(0, Math.round(contentX0 * 10) / 10);
  }

  /* ------------------------------ table ------------------------------ */
  let tableTop = -1;
  let tableBottom = -1;
  let headerTop = -1;
  let colX: number[] = [];

  if (hasGrid) {
    const wide = base.h.filter((l) => l.x1 - l.x0 > contentW * 0.6).sort((a, b) => a.y - b.y);
    let best = { gap: 0, top: -1, bottom: -1 };
    for (let i = 0; i + 1 < wide.length; i++) {
      const gap = wide[i + 1].y - wide[i].y;
      if (gap <= best.gap) continue;
      const spanning = base.v.filter((v) => v.y0 <= wide[i].y + 0.6 && v.y1 >= wide[i + 1].y - 0.6);
      if (spanning.length >= 3) best = { gap, top: wide[i].y, bottom: wide[i + 1].y };
    }
    if (best.top >= 0) {
      tableTop = best.top;
      tableBottom = best.bottom;
      colX = base.v
        .filter((v) => v.y0 <= tableTop + 0.6 && v.y1 >= tableBottom - 0.6)
        .map((v) => v.x)
        .sort((a, b) => a - b);
      const above = wide.filter((l) => l.y < tableTop - 0.8).sort((a, b) => b.y - a.y)[0];
      headerTop = above ? above.y : tableTop - 3;
    }
  }

  if (colX.length >= 3 && tableTop > 0) {
    // Header labels sit between headerTop and tableTop
    const headerTexts = base.texts.filter((t) => t.y > headerTop && t.y < tableTop + 0.3);
    const cols: BillColumn[] = [];
    for (let i = 0; i + 1 < colX.length; i++) {
      const x0 = colX[i];
      const x1 = colX[i + 1];
      const labels = headerTexts
        .filter((t) => cx(t) >= x0 && cx(t) <= x1)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((t) => t.s.trim());
      const meta = columnFromLabel(labels.join(" ").replace(/\s+/g, " ").trim());
      // OCR reads a lowercase "l" as "I" in "Sl No."
      const label = (labels.join(" ").replace(/\s+/g, " ").trim() || `Col ${i + 1}`).replace(/^S[I1](?=\.?\s*No)/, "Sl");
      cols.push({
        key: cols.some((c) => c.key === meta.key) ? `${meta.key}_${i}` : meta.key,
        label,
        width: Math.max(2, Math.round(((x1 - x0) / (colX[colX.length - 1] - colX[0])) * 1000) / 10),
        align: meta.align,
        type: meta.type,
        enabled: true,
      });
    }
    if (cols.some((c) => c.key === "description") && cols.some((c) => c.key === "amount")) {
      // Chiripal-like: exactly one description + one amount → adopt real geometry
      spec.columns = cols;
    }
    spec.layout.tableHeightPct = Math.round((tableBottom - tableTop) * 10) / 10;

    // Sample item rows from FILLED values inside the table band
    const rowsVals = values.filter((t) => t.y > tableTop && t.y < tableBottom && !/^total$/i.test(t.s.trim()));
    const rows = groupLines(rowsVals, 2.0);
    const sampleItems: BillItem[] = [];
    for (const row of rows) {
      const it: BillItem = { description: "", hsn: "", qty: "", unit: "", rate: "", disc: "" };
      let filledAny = false;
      for (const t of row) {
        const idx = colX.findIndex((x, i) => i + 1 < colX.length && cx(t) >= x && cx(t) <= colX[i + 1]);
        const col = spec.columns[idx];
        if (!col || col.type === "index" || col.type === "computed") continue;
        it[col.key] = (it[col.key] ? it[col.key] + " " : "") + t.s.trim();
        filledAny = true;
      }
      if (filledAny) sampleItems.push(it);
    }
    // merge continuation rows (description-only rows following a full row)
    const merged: BillItem[] = [];
    for (const it of sampleItems) {
      const onlyDesc = Object.entries(it).every(([k, v]) => k === "description" || !v);
      if (onlyDesc && merged.length) merged[merged.length - 1].description += " " + it.description;
      else merged.push(it);
    }
    spec.sampleItems = merged.slice(0, 12);
    for (const c of spec.columns) {
      detected.push({
        zone: "table",
        label: c.label,
        key: c.key,
        value: merged[0]?.[c.key] ?? "",
        confidence: "high",
      });
    }
  } else {
    for (const c of spec.columns.filter((c) => c.enabled)) {
      detected.push({ zone: "table", label: c.label, key: c.key, value: "", confidence: "medium" });
    }
  }

  /* ------------------------ header / receiver / meta ------------------------ */
  const headerZoneBottom = headerTop > 0 ? headerTop : Math.min(...base.texts.map((t) => t.y)) + 15;
  const zoneTexts = base.texts.filter((t) => t.y < headerZoneBottom);
  const zoneVals = values.filter((t) => t.y < headerZoneBottom);

  // Split between receiver (left) and reference block (right)
  let split = -1;
  if (hasGrid) {
    const zoneTop = Math.min(...zoneTexts.map((t) => t.y), headerZoneBottom);
    const inner = base.v.filter(
      (v) => v.x > contentX0 + 5 && v.x < contentX1 - 5 && v.y0 < headerZoneBottom - 1 && v.y1 - v.y0 > (headerZoneBottom - zoneTop) * 0.4
    );
    if (inner.length) {
      inner.sort((a, b) => Math.abs(a.x - (contentX0 + contentW / 2)) - Math.abs(b.x - (contentX0 + contentW / 2)));
      split = inner[0].x;
      spec.layout.receiverWidth = Math.min(70, Math.max(35, pct(split)));
    }
  }
  const isRight = (t: TItem) => (split > 0 ? t.x >= split - 0.5 : t.x > 50);

  // Title band: first line(s) of the header zone
  const lines = groupLines(zoneTexts);
  const sample: Record<string, string> = {};
  const metaRows: MetaRow[] = [];
  let sawReceiverHeading = false;
  const addressLines: string[] = [];
  const rightLabelYs = zoneTexts.filter((t) => isRight(t) && LABEL_LIKE.test(t.s)).map((t) => t.y);
  const usedVals = new Set<TItem>();

  // Seller name from the "For, XYZ" signature line (same line, to the right)
  const forItem = base.texts.find((t) => /^For\s*[,\-–:]/i.test(t.s));
  if (forItem) {
    const name = base.texts
      .filter((t) => Math.abs(t.y - forItem.y) < 0.8 && t.x >= forItem.x - 0.2 && t.x < forItem.x + 40)
      .sort((a, b) => a.x - b.x)
      .map((t) => t.s)
      .join(" ")
      .replace(/^For\s*[,\-–:]\s*/i, "")
      .trim();
    if (name) spec.seller.name = name;
  }

  // No receiver heading and no left | right split → one field per line (cash memo / simple bill)
  const rowsMode = split < 0 && !lines.some((l) => /receiver|billed\s*to|bill\s*to|buyer|consignee/i.test(l.map((t) => t.s).join(" ")));
  if (rowsMode) {
    const left0 = hasGrid ? contentX0 : Math.min(...zoneTexts.map((t) => t.x));
    parseRowsHeader({ lines, zoneVals, spec, sample, detected, left0, right0: hasGrid ? contentX1 : 100, sellerFromFor: !!forItem });
  }

  for (const line of rowsMode ? [] : lines) {
    const joined = line.map((t) => t.s).join(" ");
    // seller state line: "State GUJARAT Code 24"
    const stateM = joined.match(/^State\s+(.+?)\s+Code\s*(\d{1,2})?$/i);
    if (stateM && isRight(line[0])) {
      spec.seller.state = stateM[1].toUpperCase();
      const codeVal = zoneVals.find((v) => Math.abs(v.y - line[0].y) < 1 && /^\d{1,2}$/.test(v.s));
      spec.seller.stateCode = stateM[2] || codeVal?.s || spec.seller.stateCode;
      detected.push({ zone: "header", label: "Seller state", key: "seller_state", value: `${spec.seller.state} ${spec.seller.stateCode}`, confidence: "high" });
      continue;
    }
    if (/receiver|billed\s*to|bill\s*to|buyer|consignee|m\/s/i.test(joined) && !sawReceiverHeading) {
      sawReceiverHeading = true;
      const heading = line.filter((t) => !isRight(t)).map((t) => t.s).join(" ");
      if (heading) spec.receiver.heading = heading.replace(/\s*:\s*$/, " :");
      continue;
    }
    const rightItems = line.filter(isRight);
    const leftItems = line.filter((t) => !isRight(t));

    // Right block → reference rows
    if (rightItems.length && sawReceiverHeading) {
      const labelItem = rightItems[0];
      if (LABEL_LIKE.test(labelItem.s) && !/^State$/i.test(labelItem.s)) {
        const label = labelItem.s.replace(/\s*:\s*$/, "").trim();
        const dateLabel = rightItems.slice(1).find((t) => IS_DATE_LABEL.test(t.s.replace(/:$/, "")));
        const vals = zoneVals.filter(
          (v) => !usedVals.has(v) && Math.abs(v.y - labelItem.y) < 1.0 && v.x >= labelItem.x + labelItem.w - 0.5
        );
        let mainVal = "";
        let dateVal = "";
        for (const v of vals) {
          usedVals.add(v);
          if (dateLabel && v.x > dateLabel.x) dateVal += (dateVal ? " " : "") + v.s;
          else mainVal += (mainVal ? " " : "") + v.s;
        }
        // continuation line directly below, only if no other label owns that line (e.g. "WOB/00213" + "/27")
        const below = zoneVals.filter(
          (v) =>
            !usedVals.has(v) &&
            v.y > labelItem.y + 0.6 &&
            v.y < labelItem.y + 2.2 &&
            v.x >= labelItem.x + labelItem.w - 0.5 &&
            (!dateLabel || v.x < dateLabel.x) &&
            !rightLabelYs.some((ly) => Math.abs(ly - v.y) < 0.9 && Math.abs(ly - labelItem.y) > 0.6)
        );
        for (const v of below) {
          usedVals.add(v);
          mainVal += " " + v.s;
        }
        const key = metaKey(label);
        const id = key;
        if (!metaRows.some((m) => m.id === id)) {
          metaRows.push({
            id,
            label,
            key,
            withDate: !!dateLabel,
            dateLabel: dateLabel ? dateLabel.s.replace(/:$/, "") : "Date",
            dateKey: key === "invoice_no" ? "invoice_date" : `${key}_date`,
            enabled: true,
          });
          if (mainVal.trim()) sample[key] = mainVal.trim();
          if (dateVal.trim()) sample[key === "invoice_no" ? "invoice_date" : `${key}_date`] = dateVal.trim();
          detected.push({ zone: "reference", label, key, value: [mainVal.trim(), dateVal.trim()].filter(Boolean).join("  ·  "), confidence: mainVal || dateVal ? "high" : "medium" });
        }
      }
    }

    // Left block → receiver fields / pre-printed customer
    if (leftItems.length && sawReceiverHeading) {
      const first = leftItems[0];
      if (/^State$/i.test(first.s)) {
        spec.receiver.showState = true;
        const stateTxt = leftItems.find((t, i) => i > 0 && !/^Code$/i.test(t.s));
        const codeVal = zoneVals.find((v) => Math.abs(v.y - first.y) < 1 && /^\d{1,2}$/.test(v.s) && !isRight(v));
        if (stateTxt && /^[A-Z .]+$/.test(stateTxt.s)) sample.buyer_state = stateTxt.s;
        if (codeVal) sample.buyer_code = codeVal.s;
        detected.push({ zone: "receiver", label: "State / Code", key: "buyer_state", value: [sample.buyer_state, sample.buyer_code].filter(Boolean).join(" / "), confidence: "high" });
        continue;
      }
      if (/gstin|gst\s*no|uin/i.test(first.s)) {
        spec.receiver.showGstin = true;
        spec.receiver.gstinLabel = first.s.replace(/\s+\d{2}[A-Z0-9]{13}.*$/, "").trim();
        const g = zoneVals.find((v) => Math.abs(v.y - first.y) < 1 && /\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]/.test(v.s));
        const g2 = (joined.match(/\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]/) || [])[0];
        const gv = g?.s || g2 || "";
        if (gv) sample.gstin = gv;
        detected.push({ zone: "receiver", label: spec.receiver.gstinLabel, key: "gstin", value: gv, confidence: "high" });
        continue;
      }
      if (/^(phone|mobile|contact|ph)/i.test(first.s)) continue;
      // Pre-printed / sample customer name and address
      const txt = leftItems.map((t) => t.s).join(" ").trim();
      if (!txt) continue;
      if (!sample.customer_name) sample.customer_name = txt;
      else addressLines.push(txt);
    }
  }
  if (addressLines.length) sample.address = addressLines.join("\n");
  if (sample.customer_name) {
    detected.push({ zone: "receiver", label: "Customer name", key: "customer_name", value: sample.customer_name, confidence: "high" });
  }
  if (sample.address) detected.push({ zone: "receiver", label: "Address", key: "address", value: sample.address.replace(/\n/g, ", "), confidence: "high" });

  if (metaRows.length) {
    // Keep at least invoice row
    if (!metaRows.some((m) => m.key === "invoice_no")) {
      metaRows.unshift({ id: "invoice", label: "Invoice No", key: "invoice_no", withDate: true, dateLabel: "Date", dateKey: "invoice_date", enabled: true });
    }
    spec.metaRows = metaRows;
  }

  // Title band details from the top line(s)
  const topLine = rowsMode ? [] : lines[0] || [];
  const titleItems = topLine.filter((t) => /invoice|bill|memo|challan|quotation|estimate/i.test(t.s) || (cx(t) > 35 && cx(t) < 65));
  if (titleItems.length) {
    const title = titleItems.map((t) => t.s).join(" ").replace(/\s+/g, " ").trim();
    if (/invoice|bill|memo|quotation|estimate/i.test(title)) spec.header.title = title.toUpperCase();
  }
  const copyItem = topLine.find((t) => /original|duplicate|triplicate|copy|recipient/i.test(t.s));
  if (copyItem) spec.header.copyLabel = copyItem.s;
  const gstLabel = topLine.find((t) => /gstin|gst\s*no/i.test(t.s));
  if (gstLabel) spec.header.sellerGstinLabel = gstLabel.s.replace(/\s+\d{2}[A-Z0-9]{13}.*$/, "").trim();

  /* ------------------------------ footer ------------------------------ */
  if (tableBottom > 0) {
    const footTexts = base.texts.filter((t) => t.y > tableBottom + 0.3);
    const footVals = values.filter((t) => t.y > tableBottom + 0.3);
    let fsplit = -1;
    if (hasGrid) {
      const below = (v: VLine) => v.y1 - Math.max(v.y0, tableBottom);
      const inner = base.v.filter((v) => v.x > contentX0 + 5 && v.x < contentX1 - 5 && below(v) > 3);
      if (inner.length) {
        inner.sort((a, b) => below(b) - below(a));
        fsplit = inner[0].x;
        spec.layout.footerLeftWidth = Math.min(75, Math.max(40, pct(fsplit)));
      }
    }
    const rightOf = (t: TItem) => (fsplit > 0 ? t.x >= fsplit - 0.5 : t.x > 60);
    const stopRe = /bank|a\/c|ifsc|branch|rupees|in\s*words|terms|e\.?\s*&\s*o\.?\s*e|for\s*[,\-–:]|authori|signat|declaration|total$/i;
    const footerFields: FooterField[] = [];
    let lineNo = 0;
    for (const line of groupLines(footTexts)) {
      const left = line.filter((t) => !rightOf(t));
      if (!left.length) continue;
      const joined = left.map((t) => t.s).join(" ");
      if (stopRe.test(joined)) {
        if (/bank|a\/c|ifsc|rupees|terms/i.test(joined)) break;
        continue;
      }
      const labels = left.filter((t) => LABEL_LIKE.test(t.s) && t.s.length > 2);
      if (!labels.length) continue;
      for (const l of labels) {
        const label = l.s.replace(/\s*:\s*-?$/, "").trim();
        const key = slug(label);
        if (footerFields.some((f) => f.key === key)) continue;
        const next = labels.find((o) => o.x > l.x);
        const val = footVals
          .filter((v) => Math.abs(v.y - l.y) < 1.2 && v.x >= l.x + l.w - 0.5 && (!next || v.x < next.x) && !rightOf(v))
          .map((v) => v.s)
          .join(" ");
        footerFields.push({ id: key, label, key, enabled: true, line: lineNo, multiline: /remark|note|narration/i.test(label) });
        if (val) sample[key] = val;
        detected.push({ zone: "footer", label, key, value: val, confidence: val ? "high" : "medium" });
      }
      lineNo++;
    }
    if (footerFields.length) spec.footerFields = footerFields;

    // Terms & conditions — geometric (the heading often shares a text line with "E.& O.E.")
    const termsHead = footTexts.find((t) => /terms/i.test(t.s) && !rightOf(t));
    if (termsHead) {
      const stop = /bank|a\/c|ifsc|rupees|for\s*,|authori|signat|e\.?\s*&\s*o\.?\s*e/i;
      const tl = groupLines(footTexts.filter((t) => !rightOf(t) && t.y > termsHead.y + 0.4))
        .map((l) => l.map((t) => t.s).join(" ").trim())
        .filter((s) => s && !stop.test(s))
        .map((s) => s.replace(/^\d+\s*[).\-]\s*/, "").trim())
        .filter(Boolean);
      if (tl.length) {
        spec.terms.enabled = true;
        spec.terms.lines = tl.slice(0, 10);
        spec.terms.heading = termsHead.s.trim();
      }
    }

    // totals block
    const totLines = groupLines(footTexts.filter(rightOf));
    let grandLine: TItem[] | null = null;
    for (const line of totLines) {
      const label = line.map((t) => t.s).join(" ").replace(/\s*:-?\s*$/, "").trim();
      const val = footVals.filter((v) => Math.abs(v.y - line[0].y) < 1.2 && rightOf(v)).map((v) => v.s).join(" ");
      if (/basic|taxable|sub\s*total/i.test(label)) {
        spec.totals.basicLabel = line[0].s.trim();
        detected.push({ zone: "totals", label: spec.totals.basicLabel, key: "basic", value: val, confidence: "high" });
      } else if (/cgst/i.test(label)) {
        const m = label.match(/([\d.]+)\s*%/);
        if (m) spec.totals.gstPercent = +(Number(m[1]) * 2).toFixed(2);
        spec.totals.cgstLabel = label.replace(/([\d.]+)\s*%/, "{pct}%");
        detected.push({ zone: "totals", label, key: "cgst", value: val, confidence: "high" });
      } else if (/sgst|utgst/i.test(label)) {
        spec.totals.sgstLabel = label.replace(/([\d.]+)\s*%/, "{pct}%");
        detected.push({ zone: "totals", label, key: "sgst", value: val, confidence: "high" });
      } else if (/igst/i.test(label)) {
        spec.totals.igstLabel = label.replace(/([\d.]+)\s*%/, "{pct}%");
      } else if (/round/i.test(label)) {
        spec.totals.roundOffLabel = label;
        spec.totals.showRoundOff = true;
      } else if (/g\.?\s*total|grand|net\s*amount|total\s*amount|payable/i.test(label) || (/^total\b/i.test(label) && !grandLine)) {
        spec.totals.grandLabel = label;
        grandLine = line;
        detected.push({ zone: "totals", label, key: "grand", value: val, confidence: "high" });
      }
    }

    const rupeesItem = footTexts.find((t) => /rupees|in\s*words/i.test(t.s) && !rightOf(t));
    if (rupeesItem) {
      spec.rupees.enabled = true;
      spec.rupees.label = rupeesItem.s.trim();
      if (grandLine && Math.abs(rupeesItem.y - grandLine[0].y) < 3 && !spec.bank.enabled) spec.rupees.placement = "footer";
    }
    const eoeItem = footTexts.find((t) => /^e\.?\s*&\s*o/i.test(t.s.trim()));
    const forFoot = footTexts.find((t) => /^for\s*[,\-–:]/i.test(t.s.trim()));
    if (eoeItem && forFoot && !spec.terms.enabled && eoeItem.x < contentX0 + contentW * 0.3 && cx(forFoot) < contentX0 + contentW * 0.7) {
      spec.signature.spread = true;
    }
    if (spec.totals.gstPercent === 0) {
      spec.table.showTotalRow = base.texts.some((t) => /^total\b/i.test(t.s.trim()) && t.y > tableTop && t.y < tableBottom + 0.3);
    }
  }

  /* ------------------------------ seller ------------------------------ */
  if (!spec.seller.name && businessName) spec.seller.name = businessName;
  if (spec.seller.gstin) {
    detected.unshift({ zone: "header", label: spec.header.sellerGstinLabel, key: "seller_gstin", value: spec.seller.gstin, confidence: "high" });
  }
  if (spec.seller.name) {
    detected.unshift({ zone: "header", label: "Business name", key: "seller_name", value: spec.seller.name, confidence: /For\s*,/i.test(filled.text) ? "high" : "medium" });
  }
  if (spec.bank.enabled && (spec.bank.name || spec.bank.acNo)) {
    detected.push({ zone: "footer", label: "Bank", key: "bank", value: [spec.bank.name, spec.bank.acNo, spec.bank.ifsc, spec.bank.branch].filter(Boolean).join(" · "), confidence: "high" });
  }
  if (spec.terms.enabled) {
    detected.push({ zone: "footer", label: spec.terms.heading, key: "terms", value: `${spec.terms.lines.length} lines`, confidence: "high" });
  }

  spec.sample = sample;
  return { spec, detected, method: hasGrid ? "geometry" : "text" };
}
