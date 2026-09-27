/**
 * Business profile — client-safe types & pure helpers (no DB imports).
 * The seller's own details are stored once per owner and applied to every bill design at
 * render time, so a template never carries another company's data.
 */
import type { BillSpec } from "./bill-spec";

export type BusinessProfile = {
  name: string;
  gstin: string;
  state: string;
  stateCode: string;
  address: string;
  /** Six-digit PIN, also appended to address when loaded from the owner row. */
  pincode: string;
  phone: string;
  email: string;
  bank: { name: string; acNo: string; ifsc: string; branch: string };
  defaultGstPercent: number;
  /** Public URL under /uploads/logos/... */
  logoUrl?: string;
};

export function emptyProfile(): BusinessProfile {
  return {
    name: "",
    gstin: "",
    state: "",
    stateCode: "",
    address: "",
    pincode: "",
    phone: "",
    email: "",
    bank: { name: "", acNo: "", ifsc: "", branch: "" },
    defaultGstPercent: 18,
    logoUrl: "",
  };
}

export function profileIsEmpty(p: BusinessProfile | null | undefined): boolean {
  return !p || (!p.name && !p.gstin);
}

/** Seller/bank/GST sections of a spec come from the profile, never from the uploaded sample bill. */
export function applyProfileToSpec(spec: BillSpec, p: BusinessProfile | null | undefined): BillSpec {
  if (!p || profileIsEmpty(p)) return spec;
  return {
    ...spec,
    seller: {
      ...spec.seller,
      name: p.name || spec.seller.name,
      gstin: p.gstin || spec.seller.gstin,
      state: p.state || spec.seller.state,
      stateCode: p.stateCode || spec.seller.stateCode,
      address: p.address || spec.seller.address,
    },
    bank: {
      ...spec.bank,
      name: p.bank.name || spec.bank.name,
      acNo: p.bank.acNo || spec.bank.acNo,
      ifsc: p.bank.ifsc || spec.bank.ifsc,
      branch: p.bank.branch || spec.bank.branch,
    },
    totals: { ...spec.totals, gstPercent: p.defaultGstPercent ?? spec.totals.gstPercent },
    header: {
      ...spec.header,
      logoUrl: p.logoUrl || spec.header.logoUrl,
      showSellerName: spec.header.showSellerName || !!p.logoUrl,
    },
  };
}

/** Pull seller details out of a spec (e.g. after editing them on the bill). */
export function profileFromSpec(spec: BillSpec, base: BusinessProfile): BusinessProfile {
  return {
    ...base,
    name: spec.seller.name || base.name,
    gstin: spec.seller.gstin || base.gstin,
    state: spec.seller.state || base.state,
    stateCode: spec.seller.stateCode || base.stateCode,
    address: spec.seller.address || base.address,
    bank: {
      name: spec.bank.name || base.bank.name,
      acNo: spec.bank.acNo || base.bank.acNo,
      ifsc: spec.bank.ifsc || base.bank.ifsc,
      branch: spec.bank.branch || base.bank.branch,
    },
    defaultGstPercent: spec.totals.gstPercent,
  };
}
