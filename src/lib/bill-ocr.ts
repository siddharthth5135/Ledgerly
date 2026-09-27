/** Build editable bill templates from OCR / PDF text (no server tesseract). */

export type BillField = {
  key: string;
  label: string;
  type: "text" | "number";
  required: boolean;
};

const CORE_FIELDS: BillField[] = [
  { key: "customer_name", label: "Customer Name", type: "text", required: true },
  { key: "gstin", label: "GSTIN", type: "text", required: false },
  { key: "phone", label: "Phone", type: "text", required: false },
  { key: "address", label: "Address", type: "text", required: false },
  { key: "invoice_no", label: "Invoice No", type: "text", required: false },
  { key: "invoice_date", label: "Invoice Date", type: "text", required: false },
  { key: "item", label: "Item / Description", type: "text", required: true },
  { key: "hsn", label: "HSN / SAC", type: "text", required: false },
  { key: "qty", label: "Qty", type: "number", required: true },
  { key: "rate", label: "Rate", type: "number", required: true },
  { key: "amount", label: "Amount", type: "number", required: false },
];

const LABEL_HINTS: Array<{ re: RegExp; key: string; label: string; type: "text" | "number" }> = [
  { re: /\b(bill\s*to|buyer|customer\s*name|consignee|party\s*name|name)\b/i, key: "customer_name", label: "Customer Name", type: "text" },
  { re: /\b(gstin|gst\s*no|gst\s*in)\b/i, key: "gstin", label: "GSTIN", type: "text" },
  { re: /\b(phone|mobile|whatsapp|contact)\b/i, key: "phone", label: "Phone", type: "text" },
  { re: /\b(address|place)\b/i, key: "address", label: "Address", type: "text" },
  { re: /\b(invoice\s*no|inv\.?\s*no|bill\s*no)\b/i, key: "invoice_no", label: "Invoice No", type: "text" },
  { re: /\b(invoice\s*date|bill\s*date|date)\b/i, key: "invoice_date", label: "Invoice Date", type: "text" },
  { re: /\b(hsn|sac)\b/i, key: "hsn", label: "HSN / SAC", type: "text" },
  { re: /\b(qty|quantity)\b/i, key: "qty", label: "Qty", type: "number" },
  { re: /\b(rate|price|unit\s*price)\b/i, key: "rate", label: "Rate", type: "number" },
  { re: /\b(amount|taxable|total)\b/i, key: "amount", label: "Amount", type: "number" },
  { re: /\b(description|particulars|item|product)\b/i, key: "item", label: "Item / Description", type: "text" },
];

/** Strip null bytes / control chars — Postgres JSONB rejects \u0000 */
export function sanitizeForDbText(input: string): string {
  return String(input || "")
    .replace(/\u0000/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeJsonValue<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") return sanitizeForDbText(value) as T;
  if (Array.isArray(value)) return value.map((v) => sanitizeJsonValue(v)) as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeJsonValue(v);
    }
    return out as T;
  }
  return value;
}

export function extractFieldsFromText(text: string): {
  fieldSchema: BillField[];
  layoutJson: { html: string; version: number };
  ocrRaw: { text: string; lineCount: number; source: string };
} {
  const normalized = sanitizeForDbText(text)
    .replace(/\s{2,}/g, "\n")
    .slice(0, 12000);

  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const byKey = new Map<string, BillField>();
  for (const f of CORE_FIELDS) byKey.set(f.key, f);

  for (const line of lines.slice(0, 120)) {
    for (const hint of LABEL_HINTS) {
      if (hint.re.test(line) && !byKey.has(hint.key)) {
        byKey.set(hint.key, {
          key: hint.key,
          label: hint.label,
          type: hint.type,
          required: hint.key === "customer_name" || hint.key === "item",
        });
      }
    }
    const m = line.match(/^([A-Za-z][A-Za-z0-9 /.&-]{1,40})\s*[:\-]/);
    if (m) {
      const label = m[1].trim();
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (key && key.length >= 2 && key.length <= 32 && !byKey.has(key)) {
        byKey.set(key, {
          key,
          label,
          type: /qty|rate|price|amount|total/i.test(label) ? "number" : "text",
          required: false,
        });
      }
    }
  }

  const fieldSchema = [...byKey.values()];
  const layoutHtml = buildLayoutHtml(fieldSchema);

  return {
    fieldSchema,
    layoutJson: { html: layoutHtml, version: 1 },
    ocrRaw: {
      text: sanitizeForDbText(normalized).slice(0, 4000),
      lineCount: lines.length,
      source: lines.length ? "extracted" : "fallback",
    },
  };
}

export function buildLayoutHtml(fields: BillField[]): string {
  return `
<div class="bill-template" style="font-family:Georgia,serif;padding:24px;border:1px solid #ddd;max-width:720px">
  <h2 style="margin:0 0 4px">{{business_name}}</h2>
  <p style="color:#666;margin:0 0 20px;letter-spacing:0.08em;font-size:12px">TAX INVOICE</p>
  ${fields
    .map(
      (f) =>
        `<div style="margin:10px 0;display:flex;gap:12px;align-items:baseline;border-bottom:1px dotted #eee;padding-bottom:6px"><strong style="min-width:150px;color:#333">${f.label}</strong><span data-field="${f.key}" style="flex:1">{{${f.key}}}</span></div>`
    )
    .join("\n  ")}
  <p style="margin-top:24px;font-size:12px;color:#888">Edit this template freely — placeholders like {{customer_name}} become inputs on Quick bill.</p>
</div>`.trim();
}

/** Pull readable strings from a PDF buffer (fallback heuristic). */
export function extractTextFromPdfBuffer(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const chunks: string[] = [];

  const reParen = /\((?:\\.|[^\\)]){2,200}\)/g;
  let m: RegExpExecArray | null;
  while ((m = reParen.exec(raw))) {
    const inner = m[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, " ")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    const cleaned = sanitizeForDbText(inner);
    if (/[A-Za-z]{2,}/.test(cleaned)) chunks.push(cleaned);
  }

  const reTj = /\((?:\\.|[^\\)])+\)\s*Tj/g;
  while ((m = reTj.exec(raw))) {
    const inner = m[0].replace(/\)\s*Tj$/, "").slice(1);
    const cleaned = sanitizeForDbText(inner.replace(/\\(.)/g, "$1"));
    if (/[A-Za-z0-9]{2,}/.test(cleaned)) chunks.push(cleaned);
  }

  const labelHits = raw.match(
    /(?:Customer|GSTIN|GST|Invoice|Bill|Phone|Mobile|Qty|Quantity|Rate|Amount|HSN|Description|Particulars)[:\s][^\x00-\x08\x0B\x0C\x0E-\x1F]{0,80}/gi
  );
  if (labelHits) {
    for (const h of labelHits) chunks.push(sanitizeForDbText(h));
  }

  const joined = chunks.join("\n").replace(/\n{2,}/g, "\n").trim();
  return sanitizeForDbText(joined).slice(0, 12000);
}

/** Prefer unpdf (proper PDF text) — falls back to buffer scrape. */
export async function extractTextFromPdf(buf: Buffer): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : String(text || "");
    const cleaned = sanitizeForDbText(joined).slice(0, 12000);
    if (cleaned.length >= 8) return cleaned;
  } catch (e) {
    console.warn("unpdf extract failed, using fallback:", e instanceof Error ? e.message : e);
  }
  return extractTextFromPdfBuffer(buf);
}

export function isPdf(fileName: string, mime?: string | null): boolean {
  return (
    (mime || "").includes("pdf") ||
    fileName.toLowerCase().endsWith(".pdf")
  );
}

export function isImage(fileName: string, mime?: string | null): boolean {
  const m = (mime || "").toLowerCase();
  const n = fileName.toLowerCase();
  return (
    m.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(n)
  );
}
