/**
 * Collections copilot — tone-aware WhatsApp drafts + late-payer ranking (deterministic).
 */
import { inrExact } from "./format";

export type ReminderTone = "polite" | "firm" | "final";

export function pickTone(daysLate: number, remindersSent: number): ReminderTone {
  if (daysLate >= 45 || remindersSent >= 3) return "final";
  if (daysLate >= 15 || remindersSent >= 1) return "firm";
  return "polite";
}

export function draftReminder(opts: {
  businessName: string;
  customerName: string;
  invoiceNumber: string;
  amountDue: number;
  dueDate: string;
  daysLate: number;
  payLink?: string | null;
  tone?: ReminderTone;
  language?: "en" | "hi" | "gu";
}): { tone: ReminderTone; message: string; whenToCall: string } {
  const tone = opts.tone || pickTone(opts.daysLate, 0);
  const amt = inrExact(opts.amountDue);
  const lang = opts.language || "en";
  const link = opts.payLink ? `\nPay link: ${opts.payLink}` : "";

  const en = {
    polite: `Namaste ${opts.customerName},\n\nHope you're well. Invoice *${opts.invoiceNumber}* for *${amt}* was due on ${opts.dueDate}. Could you please arrange payment at your earliest convenience?\n\nThank you,\n${opts.businessName}${link}`,
    firm: `Dear ${opts.customerName},\n\nFriendly reminder: Invoice *${opts.invoiceNumber}* (*${amt}*) is now *${opts.daysLate} days* overdue (due ${opts.dueDate}). Please clear dues this week so we can keep supply uninterrupted.\n\nRegards,\n${opts.businessName}${link}`,
    final: `Dear ${opts.customerName},\n\nFinal notice: Invoice *${opts.invoiceNumber}* (*${amt}*) is *${opts.daysLate} days* overdue. Kindly pay within 48 hours. Further delay may pause dispatches / attract interest as per terms.\n\n${opts.businessName}${link}`,
  };

  const hi = {
    polite: `नमस्ते ${opts.customerName},\n\nइनवॉइस *${opts.invoiceNumber}* राशि *${amt}* की देय तिथि ${opts.dueDate} थी। कृपया शीघ्र भुगतान करें।\n\nधन्यवाद,\n${opts.businessName}${link}`,
    firm: `प्रिय ${opts.customerName},\n\nरिमाइंडर: इनवॉइस *${opts.invoiceNumber}* (*${amt}*) *${opts.daysLate} दिन* से बकाया है। कृपया इस सप्ताह भुगतान करें।\n\n${opts.businessName}${link}`,
    final: `अंतिम सूचना: इनवॉइस *${opts.invoiceNumber}* (*${amt}*) *${opts.daysLate} दिन* ओवरड्यू। 48 घंटे में भुगतान करें।\n\n${opts.businessName}${link}`,
  };

  const gu = {
    polite: `નમસ્તે ${opts.customerName},\n\nઇન્વૉઇસ *${opts.invoiceNumber}* રકમ *${amt}* ની તારીખ ${opts.dueDate} હતી. કૃપા કરીને વહેલી તકે ચુકવણી કરો.\n\nઆભાર,\n${opts.businessName}${link}`,
    firm: `પ્રિય ${opts.customerName},\n\nરિમાઇન્ડર: ઇન્વૉઇસ *${opts.invoiceNumber}* (*${amt}*) *${opts.daysLate} દિવસ* થી બાકી છે. આ અઠવાડિયે ચૂકવો.\n\n${opts.businessName}${link}`,
    final: `અંતિમ સૂચના: ઇન્વૉઇસ *${opts.invoiceNumber}* (*${amt}*) *${opts.daysLate} દિવસ* ઓવરડ્યુ. 48 કલાકમાં ચૂકવો.\n\n${opts.businessName}${link}`,
  };

  const pack = lang === "hi" ? hi : lang === "gu" ? gu : en;
  const whenToCall =
    tone === "final"
      ? "Call today before 11am — final written notice already drafted."
      : tone === "firm"
        ? "If no reply in 48h after WhatsApp, call accounts."
        : "WhatsApp first; call only if unpaid after 5 days.";

  return { tone, message: pack[tone], whenToCall };
}

export function predictLateRisk(opts: {
  daysLate: number;
  overdueAmount: number;
  overdueBills: number;
  remindersSent: number;
}): { score: number; label: "low" | "medium" | "high"; tip: string } {
  let score = 0;
  score += Math.min(40, opts.daysLate * 0.6);
  score += Math.min(30, opts.overdueBills * 8);
  score += Math.min(20, opts.remindersSent * 5);
  if (opts.overdueAmount > 50000) score += 10;
  score = Math.min(100, Math.round(score));
  const label = score >= 65 ? "high" : score >= 35 ? "medium" : "low";
  const tip =
    label === "high"
      ? "Prioritise a phone call + firm WhatsApp today."
      : label === "medium"
        ? "Send firm reminder; follow up in 2 days."
        : "Polite nudge is enough for now.";
  return { score, label, tip };
}
