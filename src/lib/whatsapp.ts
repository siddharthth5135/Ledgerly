import type { Invoice } from "./types";
import { inrExact } from "./format";
import { calcInvoiceTotals } from "./invoice-ai";

/** Digits-only phone for wa.me (India default 91). */
export function normalizeWhatsAppPhone(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 10) return digits;
  return null;
}

/** Build a ready-to-send WhatsApp message for an invoice. */
export function buildInvoiceWhatsAppMessage(inv: Invoice, amount?: number): string {
  const totals = calcInvoiceTotals(inv.lines, inv.customerGstin);
  const total = amount ?? totals.total;
  const taxLine =
    totals.placeOfSupply === "inter"
      ? `IGST: ${inrExact(totals.igst)}`
      : `CGST: ${inrExact(totals.cgst)} · SGST: ${inrExact(totals.sgst)}`;

  const lines = [
    `Namaste ${inv.customerName},`,
    ``,
    `Tax Invoice *${inv.number}*`,
    `Date: ${inv.issueDate} · Due: ${inv.dueDate}`,
    `Amount: *${inrExact(total)}*`,
    taxLine,
    inv.razorpayLink ? `Pay online: ${inv.razorpayLink}` : "",
    ``,
    `Thank you — Quill Demo`,
  ].filter(Boolean);

  return lines.join("\n");
}

/** Free share link — opens WhatsApp on phone/desktop. ₹0 cost. */
export function whatsappShareUrl(inv: Invoice, amount?: number): string {
  const text = encodeURIComponent(buildInvoiceWhatsAppMessage(inv, amount));
  const phone = normalizeWhatsAppPhone(inv.customerPhone);
  if (phone) return `https://wa.me/${phone}?text=${text}`;
  return `https://wa.me/?text=${text}`;
}
