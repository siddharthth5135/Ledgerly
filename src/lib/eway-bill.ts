/**
 * e-Way Bill payload (NIC schema subset) — generate locally; submit when EWB_* credentials exist.
 * Zoho/Tally already do multi-vehicle; we ship single-vehicle first (covers 95% of MSME consignments).
 */
export type EwayInput = {
  supplierGstin: string;
  supplierName: string;
  supplierAddr: string;
  supplierPincode: number;
  supplierStateCode: string;
  recipientGstin: string;
  recipientName: string;
  recipientAddr: string;
  recipientPincode: number;
  recipientStateCode: string;
  docNo: string;
  docDate: string; // DD/MM/YYYY
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalValue: number;
  transMode: "1" | "2" | "3" | "4"; // road/rail/air/ship
  vehicleNo?: string;
  transDocNo?: string;
  distance?: number;
  items: Array<{ desc: string; hsn: string; qty: number; taxable: number; gstPercent: number }>;
};

export function buildEwayBillPayload(i: EwayInput) {
  return {
    version: "1.0.0621",
    billLists: [
      {
        userGstin: i.supplierGstin,
        supplyType: "O",
        subSupplyType: "1",
        docType: "INV",
        docNo: i.docNo,
        docDate: i.docDate,
        fromGstin: i.supplierGstin,
        fromTrdName: i.supplierName,
        fromAddr1: i.supplierAddr || "Address",
        fromPincode: i.supplierPincode || 0,
        fromStateCode: Number(i.supplierStateCode) || 0,
        toGstin: i.recipientGstin || "URP",
        toTrdName: i.recipientName,
        toAddr1: i.recipientAddr || "Address",
        toPincode: i.recipientPincode || 0,
        toStateCode: Number(i.recipientStateCode) || 0,
        transactionType: 1,
        totalValue: round2(i.taxableValue),
        cgstValue: round2(i.cgst),
        sgstValue: round2(i.sgst),
        igstValue: round2(i.igst),
        cessValue: 0,
        totInvValue: round2(i.totalValue),
        transMode: i.transMode,
        transDistance: String(i.distance || 0),
        transporterName: "",
        transporterId: "",
        transDocNo: i.transDocNo || "",
        transDocDate: "",
        vehicleNo: (i.vehicleNo || "").toUpperCase().replace(/\s+/g, ""),
        vehicleType: "R",
        itemList: i.items.map((it, idx) => ({
          productName: it.desc,
          productDesc: it.desc,
          hsnCode: Number(String(it.hsn).replace(/\D/g, "").slice(0, 8)) || 0,
          quantity: it.qty,
          qtyUnit: "NOS",
          taxableAmount: round2(it.taxable),
          sgstRate: i.igst > 0 ? 0 : it.gstPercent / 2,
          cgstRate: i.igst > 0 ? 0 : it.gstPercent / 2,
          igstRate: i.igst > 0 ? it.gstPercent : 0,
          cessRate: 0,
        })),
      },
    ],
  };
}

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Basic HSN length check (Tally 7.1 validates HSN/SAC — we mirror simply). */
export function validateHsn(hsn: string): { ok: boolean; tip: string } {
  const d = String(hsn || "").replace(/\D/g, "");
  if (!d) return { ok: false, tip: "HSN/SAC missing — CA will reject GSTR-1 for this line" };
  if (![4, 6, 8].includes(d.length)) {
    return { ok: false, tip: `HSN ${d} should be 4/6/8 digits (GST rule)` };
  }
  return { ok: true, tip: "HSN looks valid" };
}
