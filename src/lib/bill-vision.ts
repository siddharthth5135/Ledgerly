/**
 * Vision LLM → BillSpec for phone photos / scans.
 * Merges with geometry engine when both are available.
 * Uses OpenAI-compatible Chat Completions (OPENAI_API_KEY / OPENAI_BASE_URL).
 * Falls back to null when no key — geometry/text path still works.
 */
import type { BillSpec } from "./bill-spec";
import { defaultBillSpec, normalizeSpec } from "./bill-spec";

export type VisionResult = {
  spec: BillSpec;
  confidence: number;
  notes: string[];
  provider: string;
};

function apiKey() {
  return process.env.OPENAI_API_KEY || process.env.LEDGERLY_VISION_KEY || "";
}

function baseUrl() {
  return (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
}

function model() {
  return process.env.LEDGERLY_VISION_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
}

function toDataUrl(buf: Buffer, mime: string) {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const SCHEMA_HINT = `{
  "seller": {"name":"","gstin":"","state":"","stateCode":"","address":""},
  "header": {"title":"TAX INVOICE","showSellerName":false},
  "columns": [{"key":"description","label":"Description","width":40,"align":"left","type":"text","enabled":true}],
  "totals": {"gstPercent":18,"showRoundOff":true,"cgstLabel":"CGST @{pct}%","sgstLabel":"SGST @{pct}%","igstLabel":"IGST @{pct}%"},
  "bank": {"enabled":true,"name":"","acNo":"","ifsc":"","branch":""},
  "terms": {"enabled":true,"heading":"Terms & Conditions","lines":[]},
  "metaRows": [{"label":"Invoice No","key":"invoice_no","enabled":true,"withDate":true,"dateLabel":"Date","dateKey":"invoice_date"}],
  "sample": {"invoice_no":"","customer_name":"","gstin":""},
  "sampleItems": [{"description":"","hsn":"","qty":"","unit":"","rate":"","disc":""}]
}`;

export async function analyzeBillWithVision(opts: {
  filledJpeg: Buffer;
  emptyJpeg?: Buffer | null;
  filledMime?: string;
  emptyMime?: string;
  businessName?: string;
}): Promise<VisionResult | null> {
  const key = apiKey();
  if (!key) return null;
  if (opts.filledJpeg.length > 6_000_000) return null;

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `You are Ledgerly's bill layout engineer. Extract a GST tax invoice structure as STRICT JSON matching this shape (fill what you see; invent nothing):\n${SCHEMA_HINT}\n\nRules:
- Prefer labels exactly as printed (including typos).
- gstPercent is the TOTAL GST (CGST+SGST or IGST). If you see CGST @9%, gstPercent=18.
- columns: only visible item columns, widths summing ~100.
- sample + sampleItems: values from the FILLED bill.
- ${opts.businessName ? `Owner business hint: ${opts.businessName} (do not overwrite if the bill shows a different seller — put bill seller in seller.*).` : ""}
Return ONLY JSON.`,
    },
    {
      type: "image_url",
      image_url: { url: toDataUrl(opts.filledJpeg, opts.filledMime || "image/jpeg"), detail: "high" },
    },
  ];
  if (opts.emptyJpeg && opts.emptyJpeg.length < 6_000_000) {
    content.push({
      type: "text",
      text: "EMPTY template (no values) — use to distinguish labels vs fillable fields:",
    });
    content.push({
      type: "image_url",
      image_url: { url: toDataUrl(opts.emptyJpeg, opts.emptyMime || "image/jpeg"), detail: "high" },
    });
  }

  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model(),
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You extract GST invoice BillSpec JSON. No markdown." },
          { role: "user", content },
        ],
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!res.ok) {
      console.warn("vision LLM", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(raw) as Partial<BillSpec>;
    const base = defaultBillSpec();
    const merged = normalizeSpec({ ...base, ...parsed, version: 2 } as Partial<BillSpec>);
    return {
      spec: merged,
      confidence: 0.75,
      notes: ["Vision model reconstructed layout from image"],
      provider: model(),
    };
  } catch (e) {
    console.warn("vision analyze failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Prefer geometry for grids; overlay vision seller/bank/terms/sample when geometry is thin. */
export function mergeGeometryAndVision(geo: BillSpec, vision: BillSpec | null): BillSpec {
  if (!vision) return geo;
  return normalizeSpec({
    ...geo,
    seller: {
      ...geo.seller,
      name: geo.seller.name || vision.seller.name,
      gstin: geo.seller.gstin || vision.seller.gstin,
      state: geo.seller.state || vision.seller.state,
      stateCode: geo.seller.stateCode || vision.seller.stateCode,
      address: geo.seller.address || vision.seller.address,
    },
    bank: {
      ...geo.bank,
      name: geo.bank.name || vision.bank.name,
      acNo: geo.bank.acNo || vision.bank.acNo,
      ifsc: geo.bank.ifsc || vision.bank.ifsc,
      branch: geo.bank.branch || vision.bank.branch,
      enabled: geo.bank.enabled || vision.bank.enabled,
    },
    terms: {
      ...geo.terms,
      lines: geo.terms.lines?.length ? geo.terms.lines : vision.terms.lines,
      enabled: geo.terms.enabled || vision.terms.enabled,
    },
    sample: { ...(vision.sample || {}), ...(geo.sample || {}) },
    sampleItems: geo.sampleItems?.length ? geo.sampleItems : vision.sampleItems,
    totals: {
      ...geo.totals,
      gstPercent: geo.totals.gstPercent || vision.totals.gstPercent,
    },
    columns: geo.columns.length >= 4 ? geo.columns : vision.columns.length ? vision.columns : geo.columns,
  });
}
