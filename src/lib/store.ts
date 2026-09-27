import type { Invoice, Reminder, BooksTarget, JournalEntry } from "./types";
import { calcInvoiceTotals, daysFromNow, today, SELLER } from "./invoice-ai";

const seedInvoices: Invoice[] = [
  {
    id: "inv-001",
    number: "INV-1001",
    customerName: "Urban Wear Retail Pvt Ltd",
    customerGstin: "07AABCU9988W1Z3",
    customerPhone: "+91 98111 22333",
    customerEmail: "pay@urbanwear.in",
    supplierId: "cus-001",
    issueDate: daysFromNow(-12),
    dueDate: daysFromNow(-2),
    status: "overdue",
    currency: "INR",
    lines: [
      {
        id: "l1",
        description: "Corrugated cartons (boxes)",
        hsn: "4819",
        qty: 200,
        rate: 28,
        gstPercent: 18,
      },
    ],
    notes: "Net 10 — follow up urgently",
    source: "whatsapp",
    sourceRaw: "Send 200 cartons for Urban Wear @ 28 each",
    razorpayLink: "https://rzp.io/i/demo_inv1001",
    booksSyncedTo: "none",
    remindersSent: 2,
    createdAt: daysFromNow(-12),
  },
  {
    id: "inv-002",
    number: "INV-1002",
    customerName: "Coastal Pharma Pack",
    customerGstin: "29AABCC2211P1Z6",
    customerEmail: "accounts@coastalpharma.in",
    supplierId: "cus-002",
    issueDate: daysFromNow(-5),
    dueDate: daysFromNow(5),
    status: "sent",
    currency: "INR",
    lines: [
      {
        id: "l2",
        description: "Food-grade polymer pouches",
        hsn: "3923",
        qty: 5000,
        rate: 2.4,
        gstPercent: 18,
      },
      {
        id: "l3",
        description: "Printed labels",
        hsn: "4821",
        qty: 5000,
        rate: 0.35,
        gstPercent: 18,
      },
    ],
    source: "gmail",
    sourceRaw: "Fwd: PO — 5000 pouches @ 2.4 and labels",
    razorpayLink: "https://rzp.io/i/demo_inv1002",
    booksSyncedTo: "zoho",
    booksSyncedAt: daysFromNow(-4),
    remindersSent: 0,
    createdAt: daysFromNow(-5),
  },
  {
    id: "inv-003",
    number: "INV-1003",
    customerName: "Aarav Precision",
    customerGstin: "27AABCA1234D1Z5",
    issueDate: daysFromNow(-20),
    dueDate: daysFromNow(-10),
    status: "paid",
    currency: "INR",
    lines: [
      {
        id: "l4",
        description: "CNC tooling insert pack",
        hsn: "8207",
        qty: 40,
        rate: 850,
        gstPercent: 18,
      },
    ],
    source: "manual",
    razorpayLink: "https://rzp.io/i/demo_inv1003",
    booksSyncedTo: "tally",
    booksSyncedAt: daysFromNow(-9),
    remindersSent: 1,
    createdAt: daysFromNow(-20),
  },
  {
    id: "inv-004",
    number: "INV-1004",
    customerName: "Same-state buyer (MH)",
    customerGstin: "27AABCM5555B1Z8",
    issueDate: daysFromNow(-3),
    dueDate: daysFromNow(4),
    status: "sent",
    currency: "INR",
    lines: [
      {
        id: "l5",
        description: "Local fabrication job work",
        hsn: "9988",
        qty: 1,
        rate: 10000,
        gstPercent: 18,
      },
    ],
    source: "manual",
    notes: "Intrastate demo for CGST+SGST",
    razorpayLink: "https://rzp.io/i/demo_inv1004",
    booksSyncedTo: "none",
    remindersSent: 0,
    createdAt: daysFromNow(-3),
  },
];

const seedReminders: Reminder[] = [
  {
    id: "rem-001",
    invoiceId: "inv-001",
    channel: "whatsapp",
    scheduledFor: daysFromNow(-1),
    status: "sent",
    message:
      "Hi Urban Wear — invoice INV-1001 of ₹6,608 is overdue. Pay: https://rzp.io/i/demo_inv1001",
  },
  {
    id: "rem-002",
    invoiceId: "inv-001",
    channel: "email",
    scheduledFor: today(),
    status: "pending",
    message: "Gentle reminder: INV-1001 is past due. Please clear dues today.",
  },
];

/** In-memory demo store — globalThis so API routes + RSC share one copy in Next.js. */
type StoreBag = { invoices: Invoice[]; reminders: Reminder[] };

const g = globalThis as typeof globalThis & { __ledgerlyStore?: StoreBag };

function bag(): StoreBag {
  if (!g.__ledgerlyStore) {
    g.__ledgerlyStore = {
      invoices: structuredClone(seedInvoices),
      reminders: structuredClone(seedReminders),
    };
  }
  return g.__ledgerlyStore;
}

function reconcileStatuses(list: Invoice[]): Invoice[] {
  const todayStr = today();
  return list.map((inv) => {
    if (inv.status === "sent" && inv.dueDate < todayStr) {
      return { ...inv, status: "overdue" as const };
    }
    return inv;
  });
}

export function listInvoices() {
  const s = bag();
  s.invoices = reconcileStatuses(s.invoices);
  return [...s.invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getInvoice(id: string) {
  const s = bag();
  s.invoices = reconcileStatuses(s.invoices);
  return s.invoices.find((i) => i.id === id);
}

export function upsertInvoice(inv: Invoice) {
  const s = bag();
  const idx = s.invoices.findIndex((i) => i.id === inv.id);
  if (idx >= 0) s.invoices[idx] = inv;
  else s.invoices = [inv, ...s.invoices];
  return inv;
}

export function updateInvoice(id: string, patch: Partial<Invoice>) {
  const inv = getInvoice(id);
  if (!inv) return undefined;
  const next = { ...inv, ...patch };
  return upsertInvoice(next);
}

export function listReminders(invoiceId?: string) {
  return bag().reminders.filter((r) => (invoiceId ? r.invoiceId === invoiceId : true));
}

export function addReminder(r: Reminder) {
  const s = bag();
  s.reminders = [r, ...s.reminders];
  return r;
}

export function markReminderSent(id: string) {
  const s = bag();
  s.reminders = s.reminders.map((r) => (r.id === id ? { ...r, status: "sent" as const } : r));
}

export function invoiceAmount(inv: Invoice) {
  return calcInvoiceTotals(inv.lines, inv.customerGstin).total;
}

export function invoiceTotals(inv: Invoice) {
  return calcInvoiceTotals(inv.lines, inv.customerGstin);
}

export function buildJournal(inv: Invoice): JournalEntry[] {
  const t = calcInvoiceTotals(inv.lines, inv.customerGstin);
  const rows: JournalEntry[] = [
    { account: "Accounts Receivable", debit: t.total, credit: 0 },
    { account: "Sales", debit: 0, credit: t.taxable },
  ];
  if (t.placeOfSupply === "inter") {
    rows.push({ account: "Output IGST", debit: 0, credit: t.igst });
  } else {
    rows.push({ account: "Output CGST", debit: 0, credit: t.cgst });
    rows.push({ account: "Output SGST", debit: 0, credit: t.sgst });
  }
  return rows;
}

export function syncToBooks(inv: Invoice, target: Exclude<BooksTarget, "none">) {
  return updateInvoice(inv.id, {
    booksSyncedTo: target,
    booksSyncedAt: new Date().toISOString(),
  });
}

export function collectionsSummary() {
  const all = listInvoices();
  const outstanding = all.filter(
    (i) => i.status === "sent" || i.status === "overdue"
  );
  const overdue = all.filter((i) => i.status === "overdue");
  const paid = all.filter((i) => i.status === "paid");
  const sum = (arr: Invoice[]) => arr.reduce((s, i) => s + invoiceAmount(i), 0);
  return {
    outstandingCount: outstanding.length,
    outstandingAmount: sum(outstanding),
    overdueCount: overdue.length,
    overdueAmount: sum(overdue),
    collectedAmount: sum(paid),
    pendingReminders: bag().reminders.filter((r) => r.status === "pending").length,
    sellerGstin: SELLER.gstin,
  };
}

export function resetStore() {
  g.__ledgerlyStore = {
    invoices: structuredClone(seedInvoices),
    reminders: structuredClone(seedReminders),
  };
}

export { SELLER };
