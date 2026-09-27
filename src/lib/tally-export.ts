/**
 * TallyPrime / Tally.ERP9 — importable Sales voucher XML (simple, CA-friendly).
 * User: Gateway of Tally → Import → XML / or TallyPrime JSON later.
 */
function esc(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ddmmyyyy(iso: string) {
  const s = String(iso || "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

export type TallyLine = {
  description: string;
  hsn?: string;
  qty: number;
  rate: number;
  amount: number;
  gstPercent?: number;
};

export type TallySalesInput = {
  companyHint?: string;
  voucherNumber: string;
  date: string; // ISO or yyyy-mm-dd
  customerName: string;
  customerGstin?: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  lines: TallyLine[];
  narration?: string;
};

/** One sales voucher. Party ledger = customer name (create in Tally if missing). */
export function buildTallySalesXml(inv: TallySalesInput): string {
  const date = ddmmyyyy(inv.date);
  const party = esc(inv.customerName || "Cash");
  const isIgst = inv.igst > 0;
  const inventory = inv.lines
    .filter((l) => l.amount > 0 || l.qty > 0)
    .map((l) => {
      const name = esc(l.description || "Item");
      const qty = Number(l.qty) || 1;
      const rate = Number(l.rate) || 0;
      const amt = Number(l.amount) || qty * rate;
      return `      <ALLINVENTORYENTRIES.LIST>
        <STOCKITEMNAME>${name}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${rate.toFixed(2)}/Nos</RATE>
        <AMOUNT>${amt.toFixed(2)}</AMOUNT>
        <ACTUALQTY>${qty} Nos</ACTUALQTY>
        <BILLEDQTY>${qty} Nos</BILLEDQTY>
        <HSNCODE>${esc(l.hsn || "")}</HSNCODE>
      </ALLINVENTORYENTRIES.LIST>`;
    })
    .join("\n");

  const taxLedgers = isIgst
    ? `      <LEDGERENTRIES.LIST>
        <LEDGERNAME>Output IGST</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${inv.igst.toFixed(2)}</AMOUNT>
      </LEDGERENTRIES.LIST>`
    : `      <LEDGERENTRIES.LIST>
        <LEDGERNAME>Output CGST</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${inv.cgst.toFixed(2)}</AMOUNT>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
        <LEDGERNAME>Output SGST</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${inv.sgst.toFixed(2)}</AMOUNT>
      </LEDGERENTRIES.LIST>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>Vouchers</REPORTNAME>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">
      <DATE>${date}</DATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${esc(inv.voucherNumber)}</VOUCHERNUMBER>
      <REFERENCE>${esc(inv.voucherNumber)}</REFERENCE>
      <PARTYLEDGERNAME>${party}</PARTYLEDGERNAME>
      <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
      <ISINVOICE>Yes</ISINVOICE>
      <NARRATION>${esc(inv.narration || `Ledgerly export ${inv.voucherNumber}`)}</NARRATION>
      <PARTYGSTIN>${esc(inv.customerGstin || "")}</PARTYGSTIN>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>${party}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <AMOUNT>-${inv.total.toFixed(2)}</AMOUNT>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Sales</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <AMOUNT>${inv.taxable.toFixed(2)}</AMOUNT>
      </LEDGERENTRIES.LIST>
${taxLedgers}
${inventory}
     </VOUCHER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>
`;
}

/** Zoho Books–style CSV (Contacts Invoice import helper) — simple for CA/excel. */
export function buildZohoInvoiceCsv(rows: Array<{
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerGstin?: string;
  itemName: string;
  quantity: number;
  rate: number;
  taxPercent: number;
}>) {
  const header =
    "Invoice Number,Invoice Date,Customer Name,GST Identification Number (GSTIN),Item Name,Quantity,Item Price,Item Tax %";
  const lines = rows.map((r) =>
    [
      csv(r.invoiceNumber),
      csv(ddmmyyyy(r.invoiceDate)),
      csv(r.customerName),
      csv(r.customerGstin || ""),
      csv(r.itemName),
      r.quantity,
      r.rate,
      r.taxPercent,
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

function csv(s: string) {
  const t = String(s || "");
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}
