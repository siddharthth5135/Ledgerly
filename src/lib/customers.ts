import type { Invoice } from "./types";
import { CATALOG_CUSTOMERS } from "./catalog";
import { phoneKey, sanitizePhone, sanitizeText } from "./security";
import { calcInvoiceTotals } from "./invoice-ai";

export type CrmCustomer = {
  id: string;
  name: string;
  phone: string;
  gstin?: string;
  email?: string;
  city?: string;
  notes?: string;
  totalPurchases: number;
  invoiceCount: number;
  lastPurchaseAt?: string;
  createdAt: string;
  tags: string[];
};

type CrmBag = { byPhone: Map<string, CrmCustomer> };

const g = globalThis as typeof globalThis & { __ledgerlyCrm?: CrmBag };

function bag(): CrmBag {
  if (!g.__ledgerlyCrm) {
    g.__ledgerlyCrm = { byPhone: new Map() };
    for (const c of CATALOG_CUSTOMERS) {
      const phone = sanitizePhone(c.phone);
      if (!phone) continue;
      g.__ledgerlyCrm.byPhone.set(phone, {
        id: c.id,
        name: c.name,
        phone,
        gstin: c.gstin,
        email: c.email,
        city: c.city,
        totalPurchases: 0,
        invoiceCount: 0,
        createdAt: new Date().toISOString().slice(0, 10),
        tags: c.id === "c-kirana" || c.id === "c-walkin" ? ["daily"] : ["wholesale"],
      });
    }
  }
  return g.__ledgerlyCrm;
}

export function listCustomers(): CrmCustomer[] {
  return [...bag().byPhone.values()].sort((a, b) =>
    (b.lastPurchaseAt || b.createdAt).localeCompare(a.lastPurchaseAt || a.createdAt)
  );
}

export function findCustomerByPhone(phone?: string): CrmCustomer | undefined {
  const key = phoneKey(phone || "");
  if (!key) return undefined;
  return bag().byPhone.get(key);
}

export function upsertCustomer(input: {
  name: string;
  phone?: string;
  gstin?: string;
  email?: string;
  city?: string;
  notes?: string;
  tags?: string[];
}): CrmCustomer | null {
  const phone = sanitizePhone(input.phone);
  if (!phone) return null;
  const existing = bag().byPhone.get(phone);
  const row: CrmCustomer = {
    id: existing?.id || `crm-${phone}`,
    name: sanitizeText(input.name || existing?.name || "Customer", 120) || "Customer",
    phone,
    gstin: input.gstin ? sanitizeText(input.gstin, 15).toUpperCase() : existing?.gstin,
    email: input.email ? sanitizeText(input.email, 120) : existing?.email,
    city: input.city ? sanitizeText(input.city, 80) : existing?.city,
    notes: input.notes ? sanitizeText(input.notes, 500) : existing?.notes,
    totalPurchases: existing?.totalPurchases || 0,
    invoiceCount: existing?.invoiceCount || 0,
    lastPurchaseAt: existing?.lastPurchaseAt,
    createdAt: existing?.createdAt || new Date().toISOString().slice(0, 10),
    tags: input.tags || existing?.tags || [],
  };
  bag().byPhone.set(phone, row);
  return row;
}

export function recordPurchaseFromInvoice(inv: Invoice, amount: number) {
  const phone = sanitizePhone(inv.customerPhone);
  if (!phone) return;
  const existing = bag().byPhone.get(phone);
  const row = upsertCustomer({
    name: inv.customerName,
    phone,
    gstin: inv.customerGstin,
    email: inv.customerEmail,
  });
  if (!row) return;
  row.totalPurchases = Math.round(((existing?.totalPurchases || 0) + amount) * 100) / 100;
  row.invoiceCount = (existing?.invoiceCount || 0) + 1;
  row.lastPurchaseAt = inv.issueDate || new Date().toISOString().slice(0, 10);
  if (row.invoiceCount >= 3 && !row.tags.includes("daily")) {
    row.tags = [...row.tags, "regular"];
  }
  bag().byPhone.set(phone, row);
}

export function customerInsights() {
  const all = listCustomers();
  const top = [...all].sort((a, b) => b.totalPurchases - a.totalPurchases).slice(0, 5);
  const dormant = all.filter((c) => {
    if (!c.lastPurchaseAt) return c.invoiceCount === 0;
    const days =
      (Date.now() - new Date(c.lastPurchaseAt).getTime()) / (1000 * 60 * 60 * 24);
    return days > 14;
  });
  const daily = all.filter((c) => c.tags.includes("daily") || c.tags.includes("regular"));
  return {
    totalCustomers: all.length,
    topBuyers: top,
    dormantCount: dormant.length,
    dormant,
    dailyRegulars: daily,
  };
}

export function resetCrmForTests() {
  g.__ledgerlyCrm = undefined;
}

/** Recompute purchase stats from invoices (demo bootstrap). */
export function syncCrmFromInvoices(invoices: Invoice[]) {
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const amount = calcInvoiceTotals(inv.lines, inv.customerGstin).total;
    if (inv.customerPhone) {
      const phone = sanitizePhone(inv.customerPhone);
      if (!phone) continue;
      const existing = bag().byPhone.get(phone);
      if (!existing) {
        upsertCustomer({
          name: inv.customerName,
          phone: inv.customerPhone,
          gstin: inv.customerGstin,
          email: inv.customerEmail,
        });
      }
      const row = bag().byPhone.get(phone)!;
      // Only add if not already counted roughly — for seed, set from invoices once
      if (!row.lastPurchaseAt || inv.issueDate >= (row.lastPurchaseAt || "")) {
        row.lastPurchaseAt = inv.issueDate;
      }
      row.name = inv.customerName;
      if (inv.customerGstin) row.gstin = inv.customerGstin;
    }
  }
}
