import type { Invoice, InvoiceLine, RiskLevel } from "./types";
import { findExactByGstin, isValidGstin } from "./suppliers";

/** Demo seller (your company) — used for GST split CGST/SGST vs IGST */
export const SELLER = {
  legalName: "Ledgerly Demo Traders Pvt Ltd",
  tradeName: "Ledgerly Demo",
  gstin: "27AABCL9999A1Z2",
  pan: "AABCL9999A",
  address: "Plot 11, MIDC, Pune, Maharashtra 411019",
  state: "Maharashtra",
  stateCode: "27",
  email: "billing@ledgerly.demo",
  phone: "+91 20 4000 1234",
  bank: "HDFC ****4521 · IFSC HDFC0001234",
};

export type InvoiceTotals = {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  gst: number;
  total: number;
  placeOfSupply: "intra" | "inter";
};

export type ParseResult = {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerGstin?: string;
  lines: Omit<InvoiceLine, "id">[];
  notes: string;
  confidence: number;
  extracted: string[];
  totals: InvoiceTotals;
  trust?: {
    matched: boolean;
    trustScore: number;
    fraudScore: number;
    riskLevel: RiskLevel;
    badge?: string;
    warning?: string;
  };
};

/** Parse WhatsApp / Gmail / OCR free text into structured invoice draft */
export function parseInvoiceSource(
  raw: string,
  source: Invoice["source"]
): ParseResult {
  const text = raw.trim();
  const extracted: string[] = [];
  let confidence = 55;

  const phoneMatch = text.match(/(?:\+91[-\s]?)?[6-9]\d{9}/);
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const gstinMatch = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/i);

  const customerName = extractCustomerName(text, extracted);
  if (customerName !== "Walk-in Customer") confidence += 10;

  if (phoneMatch) {
    extracted.push(`Phone: ${phoneMatch[0]}`);
    confidence += 8;
  }
  if (emailMatch) {
    extracted.push(`Email: ${emailMatch[0]}`);
    confidence += 8;
  }
  if (gstinMatch) {
    extracted.push(`GSTIN: ${gstinMatch[0].toUpperCase()}`);
    confidence += 12;
  }

  const lines = extractLines(text, source, extracted);
  if (lines.length && !extracted.some((e) => e.startsWith("Fallback"))) {
    confidence += Math.min(24, lines.length * 10);
  }

  if (source === "whatsapp") confidence += 5;
  if (source === "gmail") confidence += 3;
  if (source === "ocr") confidence -= 5;

  const customerGstin = gstinMatch?.[0]?.toUpperCase();
  const totals = calcInvoiceTotals(lines, customerGstin);
  if (totals.placeOfSupply === "inter") {
    extracted.push("Interstate supply → IGST");
  } else {
    extracted.push("Intrastate supply → CGST+SGST");
  }

  let trust: ParseResult["trust"];
  if (customerGstin && isValidGstin(customerGstin)) {
    const hit = findExactByGstin(customerGstin);
    if (hit) {
      trust = {
        matched: true,
        trustScore: hit.trustScore,
        fraudScore: hit.fraudScore,
        riskLevel: hit.riskLevel,
        badge: hit.badge,
        warning:
          hit.riskLevel === "critical" || hit.riskLevel === "high"
            ? "High risk party — review before credit terms"
            : undefined,
      };
      extracted.push(`Trust network hit: ${hit.tradeName} (${hit.trustScore})`);
      confidence += 5;
    } else {
      trust = {
        matched: false,
        trustScore: 55,
        fraudScore: 45,
        riskLevel: "medium",
        warning: "GSTIN valid format but not in Ledgerly network — verify before large credit",
      };
      extracted.push("GSTIN not in trust network");
    }
  }

  return {
    customerName,
    customerPhone: phoneMatch?.[0],
    customerEmail: emailMatch?.[0],
    customerGstin,
    lines,
    notes: `Auto-generated from ${source.toUpperCase()} capture`,
    confidence: Math.min(98, Math.max(35, confidence)),
    extracted,
    totals,
    trust,
  };
}

function extractCustomerName(text: string, extracted: string[]): string {
  const patterns: RegExp[] = [
    /(?:customer|client|party)\s*[:\-]?\s*([A-Z][A-Za-z0-9 &.]{1,40}?)(?=\s*(?:GST|GSTIN|phone|email|,|\.|$|\n|\d{2}[A-Z]{5}))/i,
    /^([A-Z][A-Za-z0-9 &.]{2,40}?)\s+(?:wants|needs|ordered|order)\b/im,
    /(?:invoice|bill)\s+(?:to\s+)?([A-Z][A-Za-z0-9 &.]{2,40}?)(?=\s+for\b|\s+GST|\s+GSTIN|\s*$|\n)/i,
    /(?:send|ship)\s+(?:\d+.*?\s+)?(?:to\s+)?([A-Z][A-Za-z][A-Za-z0-9 &.]{1,40}?)(?=\s+@|\s+GST|\s*$|\n)/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      let name = m[1].trim().replace(/\s+/g, " ");
      // Strip trailing junk words
      name = name.replace(/\s+(for|of|at|with)$/i, "").trim();
      if (name.length >= 2 && !/^\d+$/.test(name)) {
        extracted.push(`Customer: ${name}`);
        return name;
      }
    }
  }
  return "Walk-in Customer";
}

function extractLines(
  text: string,
  source: Invoice["source"],
  extracted: string[]
): Omit<InvoiceLine, "id">[] {
  const lines: Omit<InvoiceLine, "id">[] = [];

  // 15 cartons tomorrow @ 450  OR  120 pcs @ 85  OR  15 cartons of boxes @ 450
  const qtyAtRate = [
    ...text.matchAll(
      /(\d+(?:\.\d+)?)\s*(cartons?|boxes?|pcs?|pieces?|kg|tons?|units?|nos?\.?|pouches?|labels?|crates?)(?:\s+of\s+([A-Za-z][A-Za-z0-9 \-]{0,30}?))?(?:\s+[A-Za-z]{2,12}){0,3}?\s*(?:@|at|x|×)\s*(?:rs\.?\s*|₹\s*)?(\d+(?:,\d{3})*(?:\.\d+)?)/gi
    ),
  ];
  for (const m of qtyAtRate) {
    const qty = Number(m[1]);
    const unit = m[2];
    const item = (m[3] || "").trim();
    const desc = item ? `${item} (${unit})` : String(unit);
    const rate = Number(m[4].replace(/,/g, ""));
    if (qty > 0 && rate >= 0) {
      lines.push({
        description: desc,
        hsn: guessHsn(`${desc} ${unit}`),
        qty,
        rate,
        gstPercent: 18,
      });
      extracted.push(`Line: ${qty} × ${desc} @ ₹${rate}`);
    }
  }

  // Dual lines without "of": "5000 pouches at 2.4 and labels 5000 @ 0.35"
  if (lines.length === 0) {
    const dual = [
      ...text.matchAll(
        /(\d+(?:\.\d+)?)\s*(pouches?|labels?|cartons?|boxes?|pcs?)\s+(?:at|@)\s*(\d+(?:\.\d+)?)/gi
      ),
    ];
    for (const m of dual) {
      lines.push({
        description: m[2],
        hsn: guessHsn(m[2]),
        qty: Number(m[1]),
        rate: Number(m[3]),
        gstPercent: 18,
      });
      extracted.push(`Line: ${m[1]} × ${m[2]} @ ₹${m[3]}`);
    }
  }

  // "for packaging material 25000" / "amount 25000 for X"
  if (lines.length === 0) {
    const amountOnly = text.match(
      /(?:for|of)\s+([A-Za-z][A-Za-z0-9 &\-]{2,40}?)\s+(?:rs\.?\s*|₹\s*)?(\d{2,}(?:,\d{3})*(?:\.\d+)?)/i
    );
    const alt = text.match(
      /([A-Za-z][A-Za-z0-9 &\-]{2,40}?)\s+(?:rs\.?\s*|₹\s*)(\d{2,}(?:,\d{3})*(?:\.\d+)?)/i
    );
    const hit = amountOnly || alt;
    if (hit) {
      const desc = hit[1].trim();
      // Avoid treating company names + GSTIN digits as a line
      if (!/GSTIN|GST/i.test(desc) && !isValidGstin(desc)) {
        const rate = Number(hit[2].replace(/,/g, ""));
        if (rate >= 10) {
          lines.push({
            description: desc,
            hsn: guessHsn(desc),
            qty: 1,
            rate,
            gstPercent: 18,
          });
          extracted.push(`Line: 1 × ${desc} @ ₹${rate}`);
        }
      }
    }
  }

  if (lines.length === 0) {
    const carton = text.match(/(\d+)\s*cartons?/i);
    if (carton) {
      lines.push({
        description: "Cartons / packaging goods",
        hsn: "4819",
        qty: Number(carton[1]),
        rate: 450,
        gstPercent: 18,
      });
      extracted.push(`Inferred ${carton[1]} cartons @ ₹450 (default rate)`);
    } else {
      lines.push({
        description: source === "ocr" ? "Scanned goods (review needed)" : "General supply",
        hsn: "9997",
        qty: 1,
        rate: 1000,
        gstPercent: 18,
      });
      extracted.push("Fallback line created - review rates");
    }
  }

  return lines;
}

export function guessHsn(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes("carton") || d.includes("packag") || d.includes("box")) return "4819";
  if (d.includes("plastic") || d.includes("polymer") || d.includes("pouch")) return "3923";
  if (d.includes("label")) return "4821";
  if (d.includes("steel") || d.includes("metal") || d.includes("fabricat") || d.includes("cnc"))
    return "7326";
  if (d.includes("pharma") || d.includes("medicine")) return "3004";
  if (d.includes("textile") || d.includes("fabric") || d.includes("wear")) return "5208";
  if (d.includes("chemical")) return "3824";
  if (d.includes("crate")) return "3923";
  return "9997";
}

export function calcInvoiceTotals(
  lines: { qty: number; rate: number; gstPercent: number }[],
  customerGstin?: string,
  sellerStateCode: string = SELLER.stateCode
): InvoiceTotals {
  const taxable = round2(lines.reduce((s, l) => s + l.qty * l.rate, 0));
  const gst = round2(
    lines.reduce((s, l) => s + l.qty * l.rate * (l.gstPercent / 100), 0)
  );
  const customerState = customerGstin?.slice(0, 2);
  const isInter = Boolean(customerState && customerState !== sellerStateCode);

  if (isInter) {
    return {
      taxable,
      cgst: 0,
      sgst: 0,
      igst: gst,
      gst,
      total: round2(taxable + gst),
      placeOfSupply: "inter",
    };
  }

  const half = round2(gst / 2);
  // Adjust rounding so cgst+sgst === gst
  const cgst = half;
  const sgst = round2(gst - cgst);
  return {
    taxable,
    cgst,
    sgst,
    igst: 0,
    gst,
    total: round2(taxable + gst),
    placeOfSupply: "intra",
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function nextInvoiceNumber(existing: Invoice[]) {
  const max = existing.reduce((m, inv) => {
    const n = Number(inv.number.replace(/\D/g, ""));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 1000);
  return `INV-${max + 1}`;
}

export function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function stateCodeFromGstin(gstin?: string) {
  return gstin?.slice(0, 2) || "";
}
