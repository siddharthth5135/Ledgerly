/**
 * Bill arithmetic. Imports the real functions, not a copy.
 * The case that failed in production: qty 1, rate 100, a leftover disc of 50,
 * and no Disc column on the bill. Amount must be 100, not 50.
 */
import {
  amountInWordsINR,
  computeTotals,
  defaultBillSpec,
  itemAmount,
  normalizeSpec,
  num,
} from "../src/lib/bill-spec.ts";

let failed = 0;
function check(name, cond, detail = "") {
  if (cond) console.log("  PASS ", name);
  else {
    failed++;
    console.log("  FAIL ", name, detail);
  }
}

const row = (qty, rate, disc = "") => ({
  description: "item",
  hsn: "",
  qty,
  unit: "",
  rate,
  disc,
});

console.log("\n== Numbers ==");
check("plain", num("100") === 100);
check("qty 1", num("1") === 1);
check("indian comma", num("1,500.00") === 1500);
check("indian lakh", num("1,50,000") === 150000);
check("unit after qty", num("20 Bag") === 20);
check("unit Pes", num("10 Pes") === 10);
check("two numbers stay apart", num("20&21") === 20, String(num("20&21")));
check("leading dot", num(".5") === 0.5);
check("blank", num("") === 0);
check("garbage", num("abc") === 0);

console.log("\n== Line amount ==");
const noDisc = defaultBillSpec();
noDisc.columns = noDisc.columns.map((c) => (c.key === "disc" ? { ...c, enabled: false } : c));
check("2 x 200", itemAmount(row("2", "200"), noDisc) === 400);
check("1 x 100 ignores hidden disc", itemAmount(row("1", "100", "50"), noDisc) === 100, String(itemAmount(row("1", "100", "50"), noDisc)));
check("visible disc is rupees off", itemAmount(row("1", "100", "50"), defaultBillSpec()) === 50);
check("10 x 42.50 - 25", itemAmount(row("10", "42.50", "25"), defaultBillSpec()) === 400);
check("comma rate", itemAmount(row("2", "1,500.00"), noDisc) === 3000);
check("float 3 x 10.10", itemAmount(row("3", "10.10"), noDisc) === 30.3);

console.log("\n== Bill total (the reported row) ==");
const spec = defaultBillSpec();
spec.columns = noDisc.columns;
spec.seller.stateCode = "24";
spec.totals.gstPercent = 18;
spec.totals.showRoundOff = false;
const totals = computeTotals(spec, [row("2", "200"), row("1", "100", "50")], { buyer_code: "07" });
check("basic 500", totals.basic === 500, String(totals.basic));
check("igst 90", totals.igst === 90, String(totals.igst));
check("cgst 0", totals.cgst === 0);
check("grand 590", totals.grand === 590, String(totals.grand));
check(
  "words",
  amountInWordsINR(totals.grand) === "Five Hundred Ninety Rupees Only",
  amountInWordsINR(totals.grand)
);

console.log("\n== Tax split ==");
const intra = defaultBillSpec();
intra.seller.stateCode = "24";
intra.totals.gstPercent = 18;
intra.totals.showRoundOff = false;
intra.columns = noDisc.columns;
const odd = computeTotals(intra, [row("1", "100.05")], { buyer_code: "24" });
check("tax halves add up", Math.round((odd.cgst + odd.sgst) * 100) === Math.round((odd.basic * 0.18) * 100), `${odd.cgst}+${odd.sgst} basic ${odd.basic}`);
check("no igst intra", odd.igst === 0);

console.log("\n== Words ==");
check("531", amountInWordsINR(531) === "Five Hundred Thirty One Rupees Only");
check("paise", amountInWordsINR(100.5) === "One Hundred Rupees and Fifty Paise Only", amountInWordsINR(100.5));
check("lakh", amountInWordsINR(125000) === "One Lakh Twenty Five Thousand Rupees Only", amountInWordsINR(125000));
check("only paise", amountInWordsINR(0.5) === "Fifty Paise Only", amountInWordsINR(0.5));

console.log("\n== Serial column ==");
const fixed = normalizeSpec({
  columns: [{ key: "si_n", label: "SI N", width: 7, align: "left", type: "text", enabled: true }],
});
check("SI N is a serial", fixed.columns[0].type === "index");

console.log(failed === 0 ? "\nMATH ALL PASSED" : `\n${failed} MATH FAILED`);
process.exit(failed === 0 ? 0 : 1);
