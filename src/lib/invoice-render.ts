/**
 * Loads everything needed to render an invoice with its bill design
 * (used by the authenticated print page, the public share page and the PDF renderer).
 */
import { spGetInvoiceWithLines } from "./sp";
import { queryOne } from "./db";
import { parseDocumentLayout, type BillItem, type BillSpec } from "./bill-spec";
import { applyProfileToSpec, getBusinessProfile, type BusinessProfile } from "./business";

export type InvoiceRender = {
  inv: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  spec: BillSpec | null;
  values: Record<string, string>;
  items: BillItem[];
  profile: BusinessProfile;
  invoiceId: string;
  number: string;
  issueDate: string;
};

export function ddmmyyyy(iso: unknown): string {
  const s = String(iso || "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

export async function loadInvoiceRender(ownerId: string, id: string): Promise<InvoiceRender | null> {
  const detail = await spGetInvoiceWithLines(ownerId, id);
  if (!detail?.invoice) return null;
  const inv = detail.invoice as Record<string, unknown>;
  const lines = (detail.lines as Array<Record<string, unknown>>) || [];
  const templateId = inv.template_id ? String(inv.template_id) : "";
  const [profile, tpl] = await Promise.all([
    getBusinessProfile(ownerId),
    templateId
      ? queryOne<{ layout_json: unknown }>(
          `SELECT layout_json FROM bill_templates WHERE id = $1 AND owner_id = $2`,
          [templateId, ownerId]
        )
      : Promise.resolve(null),
  ]);

  let spec: BillSpec | null = null;
  if (tpl) {
    spec = parseDocumentLayout(tpl.layout_json)?.spec ?? null;
    if (spec) spec = applyProfileToSpec(spec, profile);
  }

  const fv =
    inv.field_values && typeof inv.field_values === "object"
      ? (inv.field_values as Record<string, unknown>)
      : {};
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(fv)) {
    if (k === "__items") continue;
    values[k] = v == null ? "" : String(v);
  }
  values.customer_name = values.customer_name || String(inv.customer_name || "");
  values.gstin = values.gstin || String(inv.customer_gstin || "");

  let items: BillItem[] = Array.isArray(fv.__items) ? (fv.__items as BillItem[]) : [];
  if (!items.length && lines.length) {
    items = lines.map((l) => ({
      description: String(l.description || ""),
      hsn: String(l.hsn || ""),
      qty: String(l.qty || ""),
      unit: "",
      rate: String(l.rate || ""),
      disc: "",
    }));
  }

  return {
    inv,
    lines,
    spec,
    values,
    items,
    profile,
    invoiceId: String(inv.id || id),
    number: String(inv.number || ""),
    issueDate: ddmmyyyy(inv.issue_date),
  };
}
