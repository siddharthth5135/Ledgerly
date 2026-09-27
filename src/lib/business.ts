/**
 * Business profile — server side (DB). Pure helpers/types live in ./business-profile.
 */
import { queryOne } from "./db";
import { emptyProfile, type BusinessProfile } from "./business-profile";

export { applyProfileToSpec, emptyProfile, profileFromSpec, profileIsEmpty } from "./business-profile";
export type { BusinessProfile } from "./business-profile";

type OwnerRow = {
  business_name: string | null;
  gstin: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  pincode: string | null;
  business_profile: Partial<BusinessProfile> | null;
};

export async function getBusinessProfile(ownerId: string): Promise<BusinessProfile> {
  const row = await queryOne<OwnerRow>(
    `SELECT business_name, gstin, state, phone, email, address_line1, address_line2, city, pincode, business_profile
       FROM owners WHERE id = $1`,
    [ownerId]
  );
  const p = emptyProfile();
  if (!row) return p;
  const extra = (row.business_profile || {}) as Partial<BusinessProfile>;
  p.name = extra.name || row.business_name || "";
  p.gstin = extra.gstin || row.gstin || "";
  p.state = (extra.state || row.state || "").toUpperCase();
  p.stateCode = extra.stateCode || (p.gstin ? p.gstin.slice(0, 2) : "");
  p.address =
    extra.address ||
    [row.address_line1, row.address_line2, [row.city, row.pincode].filter(Boolean).join(" - ")].filter(Boolean).join(", ");
  const fromAddress = String(p.address || "").match(/\d{6}/g);
  p.pincode = String(extra.pincode || row.pincode || (fromAddress?.length ? fromAddress[fromAddress.length - 1] : "") || "");
  p.phone = extra.phone || row.phone || "";
  p.email = extra.email || row.email || "";
  p.bank = { ...p.bank, ...(extra.bank || {}) };
  p.defaultGstPercent = typeof extra.defaultGstPercent === "number" ? extra.defaultGstPercent : 18;
  p.logoUrl = extra.logoUrl || "";
  return p;
}

export async function saveBusinessProfile(ownerId: string, patch: Partial<BusinessProfile>): Promise<BusinessProfile> {
  const current = await getBusinessProfile(ownerId);
  const next: BusinessProfile = {
    ...current,
    ...patch,
    bank: { ...current.bank, ...(patch.bank || {}) },
  };
  next.gstin = (next.gstin || "").toUpperCase().trim();
  next.state = (next.state || "").toUpperCase().trim();
  next.stateCode = (next.stateCode || "").replace(/\D/g, "").slice(0, 2);
  if (!next.stateCode && next.gstin.length >= 2) next.stateCode = next.gstin.slice(0, 2);
  next.bank.ifsc = (next.bank.ifsc || "").toUpperCase().trim();
  const gstinValid = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(next.gstin);
  try {
    await queryOne(
      `UPDATE owners
          SET business_profile = $2::jsonb,
              business_name = COALESCE(NULLIF($3, ''), business_name),
              gstin = CASE WHEN $4 THEN $5 ELSE gstin END,
              state = COALESCE(NULLIF($6, ''), state),
              updated_at = NOW()
        WHERE id = $1
        RETURNING id`,
      [ownerId, JSON.stringify(next), next.name, gstinValid, gstinValid ? next.gstin : null, next.state]
    );
  } catch (e) {
    // e.g. GSTIN already used by another owner — still persist the JSON profile
    console.warn("profile save partial:", e instanceof Error ? e.message : e);
    await queryOne(`UPDATE owners SET business_profile = $2::jsonb, updated_at = NOW() WHERE id = $1 RETURNING id`, [
      ownerId,
      JSON.stringify(next),
    ]);
  }
  return next;
}
