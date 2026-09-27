export type RiskLevel = "low" | "medium" | "high" | "critical";
export type VerificationStatus = "verified" | "partial" | "unverified" | "flagged";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
export type ReminderChannel = "whatsapp" | "email" | "sms";
export type BooksTarget = "tally" | "zoho" | "none";

export interface Supplier {
  id: string;
  name: string;
  tradeName: string;
  gstin: string;
  pan: string;
  cin: string;
  city: string;
  state: string;
  category: string;
  trustScore: number;
  fraudScore: number;
  riskLevel: RiskLevel;
  status: VerificationStatus;
  badge: "platinum" | "gold" | "silver" | "bronze" | "none";
  phone?: string;
  email?: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  gstPercent: number;
}

export interface Invoice {
  id: string;
  number: string;
  customerName: string;
  customerGstin?: string;
  customerPhone?: string;
  customerEmail?: string;
  supplierId?: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  currency: "INR";
  lines: InvoiceLine[];
  notes?: string;
  source: "manual" | "whatsapp" | "gmail" | "ocr";
  sourceRaw?: string;
  razorpayLink?: string;
  booksSyncedTo?: BooksTarget;
  booksSyncedAt?: string;
  remindersSent: number;
  createdAt: string;
}

export interface Reminder {
  id: string;
  invoiceId: string;
  channel: ReminderChannel;
  scheduledFor: string;
  status: "pending" | "sent" | "failed";
  message: string;
}

export interface JournalEntry {
  account: string;
  debit: number;
  credit: number;
}

export interface Lead {
  id: string;
  name: string;
  business: string;
  phone: string;
  email?: string;
  city?: string;
  interest: "pilot" | "growth" | "trust-api" | "demo";
  message?: string;
  source: string;
  createdAt: string;
}
