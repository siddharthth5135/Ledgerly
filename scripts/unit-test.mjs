/** Expanded unit tests — tax + GSTIN + IGST split mirror */
let failed = 0;
function check(n, c) {
  if (c) console.log("  PASS ", n);
  else {
    failed++;
    console.log("  FAIL ", n);
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function calc(lines, customerGstin, sellerState = "27") {
  const taxable = round2(lines.reduce((s, l) => s + l.qty * l.rate, 0));
  const gst = round2(lines.reduce((s, l) => s + l.qty * l.rate * (l.gstPercent / 100), 0));
  const cust = customerGstin?.slice(0, 2);
  const inter = Boolean(cust && cust !== sellerState);
  if (inter) {
    return { taxable, cgst: 0, sgst: 0, igst: gst, total: round2(taxable + gst), place: "inter" };
  }
  const cgst = round2(gst / 2);
  const sgst = round2(gst - cgst);
  return { taxable, cgst, sgst, igst: 0, total: round2(taxable + gst), place: "intra" };
}

console.log("\n== Unit ==");
const lines = [{ qty: 15, rate: 450, gstPercent: 18 }];
const inter = calc(lines, "07AABCU9988W1Z3");
check("inter taxable", inter.taxable === 6750);
check("inter igst", inter.igst === 1215);
check("inter cgst0", inter.cgst === 0);
check("inter total", inter.total === 7965);

const intra = calc(lines, "27AABCM5555B1Z8");
check("intra cgst", intra.cgst === 607.5);
check("intra sgst", intra.sgst === 607.5);
check("intra igst0", intra.igst === 0);

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
check("gstin ok", GSTIN.test("07AABCU9988W1Z3"));
check("gstin bad", !GSTIN.test("07AABCU9988W1Y3"));
check("seller gstin", GSTIN.test("27AABCL9999A1Z2"));

/** Amount in words (mirrors src/lib/money-words.ts) */
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`.trim();
}
function threeDigits(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h && r) return `${ONES[h]} Hundred ${twoDigits(r)}`;
  if (h) return `${ONES[h]} Hundred`;
  return twoDigits(r);
}
function integerToWords(n) {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const hundred = n % 1000;
  const parts = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ");
}
function amountInWordsInr(amount) {
  const safe = Math.round((Number(amount) || 0) * 100) / 100;
  const rupees = Math.floor(safe);
  const paise = Math.round((safe - rupees) * 100);
  let out = `Rupees ${integerToWords(rupees)}`;
  if (paise > 0) out += ` and ${twoDigits(paise)} Paise`;
  return `${out} Only`;
}

console.log("\n== Amount in words ==");
check("words 7965", amountInWordsInr(7965) === "Rupees Seven Thousand Nine Hundred Sixty Five Only");
check("words paise", amountInWordsInr(100.5).includes("Paise") && amountInWordsInr(100.5).includes("Only"));
check("words lakh", amountInWordsInr(125000).includes("Lakh"));

console.log(failed === 0 ? "\nUNIT ALL PASSED" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
