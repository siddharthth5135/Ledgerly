/**
 * GST compliance helpers: GSTIN checksum + optional live lookup, GSTR-1 JSON, e-Invoice payload.
 */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Official GSTIN checksum (mod-36). */
export function isValidGstinChecksum(gstin: string): boolean {
  const g = (gstin || "").toUpperCase().trim();
  if (!GSTIN_RE.test(g)) return false;
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const cp = chars.indexOf(g[i]);
    const wt = i % 2 === 0 ? 1 : 2;
    const prod = cp * wt;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const check = (36 - (sum % 36)) % 36;
  return chars[check] === g[14];
}

export type GstinLookup = {
  gstin: string;
  validFormat: boolean;
  validChecksum: boolean;
  legalName?: string | null;
  tradeName?: string | null;
  status?: string | null;
  state?: string | null;
  source: "checksum" | "live" | "none";
  error?: string;
};

export async function lookupGstin(gstin: string): Promise<GstinLookup> {
  const g = (gstin || "").toUpperCase().trim();
  const validFormat = GSTIN_RE.test(g);
  const validChecksum = validFormat && isValidGstinChecksum(g);
  if (!validFormat) {
    return { gstin: g, validFormat: false, validChecksum: false, source: "none", error: "Invalid GSTIN format" };
  }
  if (!validChecksum) {
    return { gstin: g, validFormat: true, validChecksum: false, source: "checksum", error: "Checksum failed" };
  }

  // Optional live provider (e.g. GST Zen / custom proxy). Never call unpaid scrapers by default.
  const endpoint = process.env.GSTIN_LOOKUP_URL; // e.g. https://api.example.com/gstin/{gstin}
  const key = process.env.GSTIN_LOOKUP_KEY;
  if (endpoint) {
    try {
      const url = endpoint.replace("{gstin}", encodeURIComponent(g));
      const res = await fetch(url, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        const d = (await res.json()) as Record<string, unknown>;
        return {
          gstin: g,
          validFormat: true,
          validChecksum: true,
          legalName: String(d.legalName || d.lgnm || d.name || "") || null,
          tradeName: String(d.tradeName || d.tradeNam || "") || null,
          status: String(d.status || d.sts || "") || null,
          state: String(d.state || d.stj || "") || null,
          source: "live",
        };
      }
    } catch (e) {
      return {
        gstin: g,
        validFormat: true,
        validChecksum: true,
        source: "checksum",
        error: e instanceof Error ? e.message : "Live lookup failed",
      };
    }
  }

  return { gstin: g, validFormat: true, validChecksum: true, source: "checksum" };
}

type InvForGstr = {
  number: string;
  issue_date: string;
  customer_gstin: string | null;
  customer_name: string;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  place_of_supply?: string | null;
};

/** Minimal GSTR-1 JSON (B2B + B2CS simplified) for CA / portal import tooling. */
export function buildGstr1Json(opts: {
  gstin: string;
  fp: string; // MMYYYY
  invoices: InvForGstr[];
}) {
  const b2bMap = new Map<string, InvForGstr[]>();
  const b2cs: InvForGstr[] = [];
  for (const inv of opts.invoices) {
    const g = (inv.customer_gstin || "").toUpperCase();
    if (g && GSTIN_RE.test(g)) {
      const arr = b2bMap.get(g) || [];
      arr.push(inv);
      b2bMap.set(g, arr);
    } else {
      b2cs.push(inv);
    }
  }

  const b2b = [...b2bMap.entries()].map(([ctin, invs]) => ({
    ctin,
    inv: invs.map((i) => ({
      inum: i.number,
      idt: formatIdt(i.issue_date),
      val: round2(i.total_amount),
      pos: (i.place_of_supply || ctin.slice(0, 2)).padStart(2, "0"),
      rchrg: "N",
      inv_typ: "R",
      itms: [
        {
          num: 1,
          itm_det: {
            txval: round2(i.taxable_amount),
            rt: guessRate(i),
            camt: round2(i.cgst_amount),
            samt: round2(i.sgst_amount),
            iamt: round2(i.igst_amount),
            csamt: 0,
          },
        },
      ],
    })),
  }));

  return {
    gstin: opts.gstin,
    fp: opts.fp,
    version: "Ledgerly-1.0",
    hash: "computed-offline",
    b2b,
    b2cs: b2cs.length
      ? [
          {
            sply_ty: "INTRA",
            rt: 18,
            typ: "OE",
            pos: opts.gstin.slice(0, 2),
            txval: round2(b2cs.reduce((s, i) => s + i.taxable_amount, 0)),
            camt: round2(b2cs.reduce((s, i) => s + i.cgst_amount, 0)),
            samt: round2(b2cs.reduce((s, i) => s + i.sgst_amount, 0)),
            iamt: round2(b2cs.reduce((s, i) => s + i.igst_amount, 0)),
          },
        ]
      : [],
    meta: {
      generatedAt: new Date().toISOString(),
      invoiceCount: opts.invoices.length,
      note: "Import into your GSTR tool / CA software. Verify before portal upload.",
    },
  };
}

function formatIdt(iso: string) {
  const s = String(iso).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function guessRate(i: InvForGstr) {
  if (!i.taxable_amount) return 0;
  const tax = i.cgst_amount + i.sgst_amount + i.igst_amount;
  return round2((tax / i.taxable_amount) * 100);
}

/** NIC e-Invoice IRN request body (ready when EINV_USER / EINV_PASSWORD / GSTIN configured). */
export function buildEinvoicePayload(opts: {
  sellerGstin: string;
  sellerName: string;
  sellerAddr: string;
  sellerStateCode: string;
  buyerGstin: string;
  buyerName: string;
  buyerAddr: string;
  buyerStateCode: string;
  invoiceNumber: string;
  invoiceDate: string; // DD/MM/YYYY
  items: Array<{ desc: string; hsn: string; qty: number; rate: number; gstPercent: number; amount: number }>;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}) {
  return {
    Version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", EcmGstin: null, IgstOnIntra: "N" },
    DocDtls: { Typ: "INV", No: opts.invoiceNumber, Dt: opts.invoiceDate },
    SellerDtls: {
      Gstin: opts.sellerGstin,
      LglNm: opts.sellerName,
      Addr1: opts.sellerAddr || "Address",
      Loc: opts.sellerAddr || "City",
      Pin: 0,
      Stcd: opts.sellerStateCode,
    },
    BuyerDtls: {
      Gstin: opts.buyerGstin,
      LglNm: opts.buyerName,
      Pos: opts.buyerStateCode,
      Addr1: opts.buyerAddr || "Address",
      Loc: opts.buyerAddr || "City",
      Pin: 0,
      Stcd: opts.buyerStateCode,
    },
    ItemList: opts.items.map((it, idx) => ({
      SlNo: String(idx + 1),
      PrdDesc: it.desc,
      IsServc: "N",
      HsnCd: it.hsn || "9997",
      Qty: it.qty,
      Unit: "NOS",
      UnitPrice: it.rate,
      TotAmt: it.amount,
      AssAmt: it.amount,
      GstRt: it.gstPercent,
      IgstAmt: opts.igst && !opts.cgst ? round2((it.amount * it.gstPercent) / 100) : 0,
      CgstAmt: opts.cgst ? round2((it.amount * it.gstPercent) / 200) : 0,
      SgstAmt: opts.sgst ? round2((it.amount * it.gstPercent) / 200) : 0,
      TotItemVal: round2(it.amount + (it.amount * it.gstPercent) / 100),
    })),
    ValDtls: {
      AssVal: opts.taxable,
      CgstVal: opts.cgst,
      SgstVal: opts.sgst,
      IgstVal: opts.igst,
      TotInvVal: opts.total,
    },
  };
}
