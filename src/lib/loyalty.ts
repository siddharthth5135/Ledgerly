import type { CrmCustomer } from "./customers";
import { listCustomers } from "./customers";
import { sanitizeText } from "./security";

export type LoyaltyOffer = {
  id: string;
  title: string;
  message: string;
  minDailySpend: number;
  minInvoiceCount: number;
  tagsAny: string[];
  active: boolean;
};

const DEFAULT_OFFERS: LoyaltyOffer[] = [
  {
    id: "off-daily-500",
    title: "Daily buyer perk",
    message:
      "Namaste! As our regular customer, enjoy ₹50 off today on bills above ₹500. Show this message at billing. — Quill Demo",
    minDailySpend: 500,
    minInvoiceCount: 2,
    tagsAny: ["daily", "regular"],
    active: true,
  },
  {
    id: "off-festival",
    title: "New stock / festival offer",
    message:
      "New stock arrived! Special wholesale rates this week. Reply YES for catalogue. — Quill Demo",
    minDailySpend: 0,
    minInvoiceCount: 0,
    tagsAny: [],
    active: true,
  },
];

type OfferBag = { offers: LoyaltyOffer[] };

const g = globalThis as typeof globalThis & { __ledgerlyOffers?: OfferBag };

function bag(): OfferBag {
  if (!g.__ledgerlyOffers) {
    g.__ledgerlyOffers = { offers: structuredClone(DEFAULT_OFFERS) };
  }
  return g.__ledgerlyOffers;
}

export function listOffers() {
  return [...bag().offers];
}

export function getOffer(id: string) {
  return bag().offers.find((o) => o.id === id);
}

export function customerEligible(c: CrmCustomer, offer: LoyaltyOffer): boolean {
  if (!offer.active) return false;
  if (c.invoiceCount < offer.minInvoiceCount) return false;
  if (offer.minDailySpend > 0 && c.totalPurchases < offer.minDailySpend) return false;
  if (offer.tagsAny.length === 0) return Boolean(c.phone);
  return offer.tagsAny.some((t) => c.tags.includes(t));
}

export function eligibleCustomers(offerId: string): CrmCustomer[] {
  const offer = getOffer(offerId);
  if (!offer) return [];
  return listCustomers().filter((c) => customerEligible(c, offer) && c.phone);
}

export function buildBroadcastMessage(offerId: string, customMessage?: string): string {
  const offer = getOffer(offerId);
  const msg = sanitizeText(customMessage || offer?.message || "", 900);
  return msg;
}

export function resetOffersForTests() {
  g.__ledgerlyOffers = undefined;
}
