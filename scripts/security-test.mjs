/**
 * Security tests for Ledgerly APIs
 * Requires server: npm run start (port 3000)
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
  return { res, json, text, headers: res.headers };
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
  console.log("\n== SECURITY: Headers ==");
  {
    const { res, headers } = await req("/");
    check("page 200", res.status === 200);
    check("nosniff", headers.get("x-content-type-options") === "nosniff");
    check("frame deny", headers.get("x-frame-options") === "DENY");
  }

  console.log("\n== SECURITY: Input rejection ==");
  {
    const { res, json } = await req("/api/invoices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "whatsapp", raw: "short" }),
    });
    check("short raw 400", res.status === 400 && json?.ok === false);
  }
  {
    const { res, json } = await req("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Hack",
        customerGstin: "BADGST",
        lines: [{ description: "x", qty: 1, rate: 10, gstPercent: 18 }],
      }),
    });
    check("bad gstin 400", res.status === 400 && /gstin/i.test(json?.error || ""));
  }
  {
    const { res, json } = await req("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        __proto__: { admin: true },
        customerName: "Proto",
        customerPhone: "9876543210",
        lines: [{ description: "Box", hsn: "4819", qty: 1, rate: 100, gstPercent: 18 }],
      }),
    });
    check("proto pollution still creates cleanly", res.status === 201 && json?.ok === true);
    check("no admin leak", !json?.invoice?.admin && !json?.admin);
  }
  {
    const { res, json } = await req("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X", phone: "123" }),
    });
    check("bad phone 400", res.status === 400);
  }
  {
    const form = new FormData();
    const evil = new Blob(["MZ fake exe"], { type: "application/octet-stream" });
    form.append("file", evil, "virus.exe");
    const { res, json } = await req("/api/invoices/from-file", {
      method: "POST",
      body: form,
    });
    check("exe upload blocked", res.status === 400 && /unsupported|type/i.test(json?.error || ""));
  }
  {
    const form = new FormData();
    const big = new Blob([new Uint8Array(3 * 1024 * 1024 + 10)], { type: "image/png" });
    form.append("file", big, "big.png");
    const { res, json } = await req("/api/invoices/from-file", {
      method: "POST",
      body: form,
    });
    check("oversized blocked", res.status === 400 && /large|3 MB/i.test(json?.error || ""));
  }

  console.log("\n== SECURITY: XSS sanitization ==");
  {
    const { res, json } = await req("/api/invoices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "whatsapp",
        raw: '<script>alert(1)</script> Party: Safe Mart wants 5 pcs @ 10. Phone 9876501234',
      }),
    });
    check("generate ok with script junk", res.status === 200 && json?.ok);
    const blob = JSON.stringify(json);
    check("script tag stripped from pipeline", !blob.includes("<script>alert"));
  }

  console.log("\n== FEATURE: CRM + broadcast ==");
  {
    const { res, json } = await req("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Daily Patel Traders",
        phone: "9123456780",
        tags: ["daily", "regular"],
      }),
    });
    check("crm create", res.status === 201 && json?.customer?.phone === "9123456780");
  }
  {
    const { json } = await req("/api/customers?phone=9123456780");
    check("crm phone memory", json?.matched === true && json?.customer?.name.includes("Patel"));
  }
  {
    // bump purchases via invoice
    await req("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Daily Patel Traders",
        customerPhone: "9123456780",
        status: "sent",
        source: "manual",
        lines: [{ description: "Cartons", hsn: "4819", qty: 20, rate: 40, gstPercent: 18 }],
      }),
    });
    const { json } = await req("/api/customers?phone=9123456780");
    check("purchase remembered", json?.customer?.invoiceCount >= 1);
  }
  {
    const { json } = await req("/api/offers/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: "off-festival" }),
    });
    check("broadcast links", json?.ok && Array.isArray(json.links) && json.links.length >= 1);
    check("wa.me urls", json.links.every((l) => String(l.url).includes("wa.me")));
  }

  console.log("\n== FEATURE: TXT import ==");
  {
    const form = new FormData();
    const txt = new Blob(
      ["Sharma Kirana wants 12 cartons @ 45. Phone 9876543210 GSTIN 27AABCS1111K1Z9"],
      { type: "text/plain" }
    );
    form.append("file", txt, "order.txt");
    const { res, json } = await req("/api/invoices/from-file", {
      method: "POST",
      body: form,
    });
    check("txt import", res.status === 200 && json?.ok && json.preview?.lines?.length > 0);
    check("editable flag path", json?.meta?.editable === true);
  }

  console.log(failed === 0 ? "\nSECURITY ALL PASSED" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
