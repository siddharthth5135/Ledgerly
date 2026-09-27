/**
 * Hardcore scenario suite for Ledgerly
 * Requires server: npm run start (or npm run dev)
 * BASE_URL=http://localhost:3000 node scripts/hardcore-test.mjs
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { res, json, text };
}

let failed = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

async function main() {
  console.log("\n== HARDCORE: Pages ==");
  for (const p of [
    "/",
    "/dashboard",
    "/invoices",
    "/invoices/new",
    "/invoices/manual",
    "/invoices/inv-001",
    "/invoices/inv-001/print",
    "/invoices/inv-004",
    "/demo",
    "/customers",
    "/grow",
    "/collections",
    "/books",
    "/pricing",
  ]) {
    const { res } = await req(p);
    check(p, res.status === 200, `got ${res.status}`);
  }
  check("404 invoice", (await req("/invoices/missing-xyz")).res.status === 404);
  check("pay-safe page", (await req("/pay-safe")).res.status === 200);

  console.log("\n== HARDCORE: AI parser quality ==");
  {
    const { json } = await req("/api/invoices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "whatsapp",
        raw: "Urban Wear wants 15 cartons tomorrow @ 450. GSTIN 07AABCU9988W1Z3. Phone 9811122333",
      }),
    });
    const p = json?.preview;
    check("wa customer Urban", /urban/i.test(p?.customerName || ""));
    check("wa qty 15", p?.lines?.[0]?.qty === 15);
    check("wa rate 450", p?.lines?.[0]?.rate === 450);
    check("wa gstin", p?.customerGstin === "07AABCU9988W1Z3");
    check("wa interstate IGST", p?.totals?.placeOfSupply === "inter" && p?.totals?.igst > 0);
    check("wa trust matched", p?.trust?.matched === true);
    check("wa total 7965", Math.abs((p?.totals?.total || 0) - 7965) < 0.01);
  }
  {
    const { json } = await req("/api/invoices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "gmail",
        raw: "Please invoice Coastal Pharma for 5000 polymer pouches at 2.4 and printed labels 5000 @ 0.35. GSTIN 29AABCC2211P1Z6",
      }),
    });
    const p = json?.preview;
    check("gmail name Coastal", /coastal/i.test(p?.customerName || ""), p?.customerName);
    check("gmail not greedy amount in name", !/25000|2\.4/.test(p?.customerName || ""));
    check("gmail has lines", (p?.lines?.length || 0) >= 1);
    check("gmail IGST", p?.totals?.placeOfSupply === "inter");
  }
  {
    const { json } = await req("/api/invoices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "ocr",
        raw: "Party: KP Polymers\n32AABCK4455P1Z8\nPlastic crates 120 pcs @ 85",
      }),
    });
    const p = json?.preview;
    check("ocr party name", /polymer/i.test(p?.customerName || ""), p?.customerName);
    check("ocr qty 120", p?.lines?.some((l) => l.qty === 120));
    check("ocr trust hit", p?.trust?.matched === true);
  }
  {
    const { json } = await req("/api/invoices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "whatsapp",
        raw: "Bill local customer Same State Co GSTIN 27AABCM5555B1Z8 for job work 10000",
      }),
    });
    check(
      "intrastate CGST",
      json?.preview?.totals?.placeOfSupply === "intra" && json?.preview?.totals?.cgst > 0
    );
  }

  console.log("\n== HARDCORE: Trust ==");
  {
    const { json } = await req("/api/trust/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gstin: "27AABCA1234D1Z5", pan: "AABCA1234D" }),
    });
    check("trust+pan ok", json?.matched && json?.cin);
  }
  {
    const { res } = await req("/api/trust/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gstin: "27AABCA1234D1Z5", pan: "ZZZZZ9999Z" }),
    });
    check("pan mismatch 409", res.status === 409);
  }
  {
    const { json } = await req("/api/trust/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gstin: "22AAAAA0000A1Z5" }),
    });
    check("unknown not low-risk", json?.riskLevel !== "low" && json?.fraudScore >= 40);
  }
  {
    const { json } = await req("/api/trust/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pan: "AABCD6677R" }),
    });
    // pan only - may not match unless we have that pan; Deccan not in list with that pan
    check("pan only request ok shape", json?.ok === true || json?.error);
  }
  {
    const { json } = await req("/api/trust/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pan: "AABCA1234D" }),
    });
    check("pan only hit", json?.matched === true && json?.gstin === "27AABCA1234D1Z5");
  }

  console.log("\n== HARDCORE: Invoice lifecycle ==");
  let id;
  {
    const { res, json } = await req("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Hardcore Buyer",
        customerGstin: "07AABCU9988W1Z3",
        source: "whatsapp",
        status: "sent",
        createReminder: true,
        lines: [{ description: "Test", hsn: "4819", qty: 2, rate: 100, gstPercent: 18 }],
      }),
    });
    check("create 201", res.status === 201);
    id = json?.invoice?.id;
    check("razorpay link", Boolean(json?.invoice?.razorpayLink));
  }
  if (id) {
    check(
      "get invoice",
      (await req(`/api/invoices/${id}`)).json?.invoice?.id === id
    );
    check(
      "remind ok",
      (await req(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remind", channel: "email" }),
      })).json?.ok === true
    );
    check(
      "sync zoho",
      (await req(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_books", target: "zoho" }),
      })).json?.invoice?.booksSyncedTo === "zoho"
    );
    check(
      "mark paid",
      (await req(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_paid" }),
      })).json?.invoice?.status === "paid"
    );
    check(
      "remind paid blocked",
      (await req(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remind" }),
      })).res.status === 400
    );
    check(
      "double pay blocked",
      (await req(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_paid" }),
      })).res.status === 400
    );
  }

  // cancel flow
  {
    const { json } = await req("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Cancel Me",
        status: "draft",
        lines: [{ description: "X", qty: 1, rate: 50, gstPercent: 18 }],
      }),
    });
    const cid = json?.invoice?.id;
    const cancel = await req(`/api/invoices/${cid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    check("cancel draft", cancel.json?.invoice?.status === "cancelled");
  }

  console.log("\n== HARDCORE: Books IGST journal ==");
  {
    const { json } = await req("/api/books");
    const inter = json?.invoices?.find((i) => i.id === "inv-001");
    const intra = json?.invoices?.find((i) => i.id === "inv-004");
    check(
      "inter has IGST account",
      inter?.journal?.some((j) => j.account.includes("IGST"))
    );
    check(
      "intra has CGST",
      intra?.journal?.some((j) => j.account.includes("CGST"))
    );
    const bal = (j) =>
      j.reduce((s, r) => s + r.debit - r.credit, 0);
    check("journal balances inv-001", Math.abs(bal(inter?.journal || [])) < 0.02);
  }

  console.log("\n== HARDCORE: Collections ==");
  {
    const { json } = await req("/api/collections");
    check("summary fields", json?.summary?.overdueCount >= 1);
    check("has overdue row", json?.invoices?.some((i) => i.status === "overdue"));
  }

  console.log(failed === 0 ? "\nHARDCORE ALL PASSED" : `\n${failed} HARDCORE FAILURES`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
