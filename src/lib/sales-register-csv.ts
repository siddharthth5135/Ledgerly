/**
 * Sales register CSV — matches MSME Excel style (Design Comprint sales sheet):
 * DATE | INVOICE NO | COMPANY NAME | GST NO | TAXABLE | CGST | SGST | IGST | ROUND OFF | TOTAL
 * One row per invoice (period export). Clean for CA / Tally Excel import / Zoho paste.
 */

function csvCell(s: string | number) {
  const t = String(s ?? "");
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function ddmmyyyy(iso: string) {
  const s = String(iso || "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export type SalesRegisterRow = {
  issueDate: string;
  invoiceNumber: string;
  customerName: string;
  customerGstin?: string | null;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

const HEADER =
  "DATE,INVOICE NO,COMPANY NAME,GST NO,TAXABLE,CGST,SGST,IGST,ROUND OFF,TOTAL";

/** Professional period sales CSV (weekly / monthly / quarterly / yearly). */
export function buildSalesRegisterCsv(
  rows: SalesRegisterRow[],
  opts?: { title?: string }
): string {
  const sorted = [...rows].sort((a, b) =>
    String(a.issueDate).localeCompare(String(b.issueDate)) ||
    String(a.invoiceNumber).localeCompare(String(b.invoiceNumber))
  );
  const lines = sorted.map((r) => {
    const taxable = round2(r.taxable);
    const cgst = round2(r.cgst);
    const sgst = round2(r.sgst);
    const igst = round2(r.igst);
    const total = round2(r.total);
    const sumParts = round2(taxable + cgst + sgst + igst);
    const roundOff = round2(total - sumParts);
    return [
      csvCell(ddmmyyyy(r.issueDate)),
      csvCell(r.invoiceNumber),
      csvCell(r.customerName),
      csvCell(r.customerGstin || ""),
      taxable,
      cgst,
      sgst,
      igst,
      roundOff,
      total,
    ].join(",");
  });

  const out: string[] = [];
  if (opts?.title) out.push(csvCell(opts.title));
  out.push(HEADER);
  out.push(...lines);

  // Totals footer — accountants like this
  if (sorted.length) {
    const tTax = round2(sorted.reduce((s, r) => s + Number(r.taxable), 0));
    const tC = round2(sorted.reduce((s, r) => s + Number(r.cgst), 0));
    const tS = round2(sorted.reduce((s, r) => s + Number(r.sgst), 0));
    const tI = round2(sorted.reduce((s, r) => s + Number(r.igst), 0));
    const tTot = round2(sorted.reduce((s, r) => s + Number(r.total), 0));
    out.push(
      ["", "", "TOTAL", "", tTax, tC, tS, tI, "", tTot].map(csvCell).join(",")
    );
  }
  return out.join("\n");
}

/** Zoho Books invoice-line CSV (still period-based, not per single bill). */
export function buildZohoInvoiceCsv(
  rows: Array<{
    invoiceNumber: string;
    invoiceDate: string;
    customerName: string;
    customerGstin?: string;
    itemName: string;
    quantity: number;
    rate: number;
    taxPercent: number;
  }>
) {
  const header =
    "Invoice Number,Invoice Date,Customer Name,GST Identification Number (GSTIN),Item Name,Quantity,Item Price,Item Tax %";
  const lines = rows.map((r) =>
    [
      csvCell(r.invoiceNumber),
      csvCell(ddmmyyyy(r.invoiceDate)),
      csvCell(r.customerName),
      csvCell(r.customerGstin || ""),
      csvCell(r.itemName),
      r.quantity,
      r.rate,
      r.taxPercent,
    ].join(",")
  );
  return [header, ...lines].join("\n");
}
