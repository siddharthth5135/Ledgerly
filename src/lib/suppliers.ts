import type { Supplier } from "./types";

export const suppliers: Supplier[] = [
  {
    id: "sup-001",
    name: "Aarav Precision Components Pvt Ltd",
    tradeName: "Aarav Precision",
    gstin: "27AABCA1234D1Z5",
    pan: "AABCA1234D",
    cin: "U28990MH2014PTC255891",
    city: "Pune",
    state: "Maharashtra",
    category: "Metal Fabrication",
    trustScore: 92,
    fraudScore: 8,
    riskLevel: "low",
    status: "verified",
    badge: "platinum",
    phone: "+91 98765 43210",
    email: "accounts@aaravprecision.in",
  },
  {
    id: "sup-002",
    name: "Shree Ganesh Trading Co",
    tradeName: "SG Traders",
    gstin: "09AAGCS9988K1Z2",
    pan: "AAGCS9988K",
    cin: "",
    city: "Kanpur",
    state: "Uttar Pradesh",
    category: "Chemical Supplies",
    trustScore: 22,
    fraudScore: 78,
    riskLevel: "critical",
    status: "flagged",
    badge: "none",
    phone: "+91 90000 11111",
  },
  {
    id: "sup-003",
    name: "Kerala Polymers India Ltd",
    tradeName: "KP Polymers",
    gstin: "32AABCK4455P1Z8",
    pan: "AABCK4455P",
    cin: "U25200KL2009PLC024411",
    city: "Kochi",
    state: "Kerala",
    category: "Plastic & Packaging",
    trustScore: 84,
    fraudScore: 16,
    riskLevel: "low",
    status: "verified",
    badge: "gold",
    email: "billing@kppolymers.com",
  },
  {
    id: "cus-001",
    name: "Urban Wear Retail Pvt Ltd",
    tradeName: "Urban Wear",
    gstin: "07AABCU9988W1Z3",
    pan: "AABCU9988W",
    cin: "U18100DL2018PTC350001",
    city: "New Delhi",
    state: "Delhi",
    category: "Retail Customer",
    trustScore: 80,
    fraudScore: 20,
    riskLevel: "low",
    status: "verified",
    badge: "silver",
    phone: "+91 98111 22333",
    email: "pay@urbanwear.in",
  },
  {
    id: "cus-002",
    name: "Coastal Pharma Pack",
    tradeName: "Coastal Pharma",
    gstin: "29AABCC2211P1Z6",
    pan: "AABCC2211P",
    cin: "",
    city: "Bengaluru",
    state: "Karnataka",
    category: "Pharma Customer",
    trustScore: 75,
    fraudScore: 25,
    riskLevel: "medium",
    status: "partial",
    badge: "bronze",
    phone: "+91 99001 44556",
    email: "accounts@coastalpharma.in",
  },
];

export function getSupplier(id: string) {
  return suppliers.find((s) => s.id === id);
}

export function searchSuppliers(q: string) {
  const query = q.trim().toLowerCase();
  if (!query) return suppliers;
  return suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(query) ||
      s.tradeName.toLowerCase().includes(query) ||
      s.gstin.toLowerCase().includes(query) ||
      s.pan.toLowerCase().includes(query) ||
      s.cin.toLowerCase().includes(query) ||
      s.city.toLowerCase().includes(query) ||
      s.category.toLowerCase().includes(query)
  );
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function findExactByGstin(gstin: string) {
  const g = gstin.trim().toUpperCase();
  return suppliers.find((s) => s.gstin === g);
}

export function findExactByPan(pan: string) {
  const p = pan.trim().toUpperCase();
  return suppliers.find((s) => s.pan === p);
}

export function isValidGstin(v: string) {
  return GSTIN.test(v.trim().toUpperCase());
}

export function isValidPan(v: string) {
  return PAN.test(v.trim().toUpperCase());
}

export function computeFraudScore(input: {
  gstin?: string;
  pan?: string;
  hasCin?: boolean;
  inNetwork?: boolean;
}) {
  let fraud = 20;
  const flags: string[] = [];

  if (!input.gstin || !isValidGstin(input.gstin)) {
    fraud += 40;
    flags.push("Invalid or missing GSTIN");
  } else if (!input.inNetwork) {
    fraud += 25;
    flags.push("Valid GSTIN but no Ledgerly payment history");
  }

  if (input.pan && !isValidPan(input.pan)) {
    fraud += 15;
    flags.push("Invalid PAN format");
  }

  if (input.hasCin === false) {
    fraud += 10;
    flags.push("No CIN on file");
  }

  fraud = Math.min(95, Math.max(5, fraud));
  const riskLevel =
    fraud >= 70 ? "critical" : fraud >= 45 ? "high" : fraud >= 28 ? "medium" : "low";

  return {
    fraudScore: fraud,
    trustScore: 100 - fraud,
    riskLevel: riskLevel as "low" | "medium" | "high" | "critical",
    flags,
  };
}
