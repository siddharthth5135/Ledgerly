/**
 * Ledgerly smoke tests
 * Run with server up: node scripts/smoke-test.mjs
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

async function main() {
  let failed = 0;
  const check = (name, cond, detail = "") => {
    if (cond) console.log(`  PASS  ${name}`);
    else {
      failed++;
      console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
    }
  };

  console.log("\n== Pages ==");
  for (const p of [
    "/",
    "/dashboard",
    "/invoices",
    "/invoices/new",
    "/invoices/manual",
    "/invoices/inv-001",
    "/invoices/inv-001/print",
    "/demo",
    "/customers",
    "/grow",
    "/collections",
    "/books",
    "/pricing",
  ]) {
    const { res } = await req(p);
    check(`${p}`, res.status === 200, `got ${res.status}`);
  }
  {
    const { res } = await req("/invoices/does-not-exist");
    check("missing invoice 404", res.status === 404, `got ${res.status}`);
  }

  console.log("\n== AI generate ==");
  {
    const { res, json } = await req("/api/invoices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "whatsapp",
        raw: "Urban Wear wants 15 cartons tomorrow @ 450. GSTIN 07AABCU9988W1Z3",
      }),
    });
    check(
      "whatsapp parse",
      res.status === 200 &&
        json?.ok &&
        json.preview.lines.length > 0 &&
        json.preview.totals.total > 0
    );
  }
  {
    const { res } = await req("/api/invoices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "whatsapp", raw: "hi" }),
    });
    check("short text 400", res.status === 400);
  }

  {
    const { res, text } = await req("/invoices/inv-001/print");
    check("seed print page", res.status === 200 && text.includes("Tax Invoice"));
    check("seed amount in words", text.includes("Rupees") && text.includes("Only"));
  }

  console.log("\n== Invoices CRUD ==");
  let newId = null;
  {
    const { res, json } = await req("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Test Buyer",
        customerGstin: "07AABCU9988W1Z3",
        customerPhone: "9811122333",
        source: "manual",
        status: "sent",
        createReminder: true,
        createRazorpay: true,
        lines: [{ description: "Test cartons", hsn: "4819", qty: 10, rate: 100, gstPercent: 18 }],
      }),
    });
    check("create invoice", res.status === 201 && json?.invoice?.id);
    newId = json?.invoice?.id;
    if (newId) {
      const print = await req(`/invoices/${newId}/print`);
      check("new invoice print", print.res.status === 200 && print.text.includes("Tax Invoice"));
      check("new invoice words", print.text.includes("Rupees"));
    }
  }
  if (newId) {
    const { json } = await req(`/api/invoices/${newId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remind", channel: "whatsapp" }),
    });
    check("remind", json?.ok === true);
    const paid = await req(`/api/invoices/${newId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_paid" }),
    });
    check("mark paid", paid.json?.invoice?.status === "paid");
    const sync = await req(`/api/invoices/${newId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync_books", target: "tally" }),
    });
    check("sync tally", sync.json?.invoice?.booksSyncedTo === "tally");
  }

  console.log("\n== Trust / collections / books / crm ==");
  {
    const { json } = await req("/api/trust/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gstin: "27AABCA1234D1Z5" }),
    });
    check("trust hit", json?.matched === true && json?.trustScore === 92);
  }
  {
    const { res } = await req("/api/trust/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gstin: "27BAD" }),
    });
    check("trust bad gstin", res.status === 400);
  }
  {
    const { json } = await req("/api/collections");
    check("collections", json?.ok && typeof json.summary?.outstandingAmount === "number");
  }
  {
    const { json } = await req("/api/books");
    check("books", json?.ok && Array.isArray(json.invoices));
  }
  {
    const { json } = await req("/api/customers");
    check("customers list", json?.ok && Array.isArray(json.customers));
  }
  {
    const { json } = await req("/api/offers");
    check("offers list", json?.ok && Array.isArray(json.offers));
  }

  console.log(failed === 0 ? "\nALL PASSED" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
