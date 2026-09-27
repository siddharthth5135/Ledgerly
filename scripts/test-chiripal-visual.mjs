/**
 * Real Chiripal PDF end-to-end test — document (vector) template engine.
 * Usage: node scripts/test-chiripal-visual.mjs [baseUrl]
 * Requires: dev server running, owner login owner@demopackers.in / Password@123
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] || "http://localhost:3000";
const EMPTY = "C:\\Users\\SIDDHARTH\\Downloads\\EMPTY_CHIRIPAL.pdf";
const FILLED = "C:\\Users\\SIDDHARTH\\Downloads\\CHIRIPAL.pdf";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;
function ok(name, cond, detail = "") {
  if (cond) passed++;
  else failed++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  console.log("\n=== Chiripal document template E2E ===\n");
  ok("empty PDF exists", fs.existsSync(EMPTY));
  ok("filled PDF exists", fs.existsSync(FILLED));
  ok("pdfjs-shim.js present", fs.existsSync(path.join(root, "public/pdfjs-shim.js")));

  // login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@demopackers.in", password: "Password@123" }),
  });
  const loginData = await loginRes.json().catch(() => ({}));
  const setCookie = loginRes.headers.getSetCookie?.() || [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ") || loginRes.headers.get("set-cookie") || "";
  ok("login", loginRes.ok && loginData.ok, loginData.error || "");
  if (!loginRes.ok) {
    console.log("\nStart server with: npm run dev\n");
    process.exit(1);
  }

  // 1) create template from real PDFs
  console.log("\n-- POST /api/templates --");
  const fd = new FormData();
  fd.set("name", "Chiripal GST");
  fd.set("emptyBill", new Blob([fs.readFileSync(EMPTY)], { type: "application/pdf" }), "EMPTY_CHIRIPAL.pdf");
  fd.set("sampleBill", new Blob([fs.readFileSync(FILLED)], { type: "application/pdf" }), "CHIRIPAL.pdf");
  const t0 = Date.now();
  const tplRes = await fetch(`${BASE}/api/templates`, { method: "POST", headers: { Cookie: cookie }, body: fd });
  const tplData = await tplRes.json().catch((e) => ({ ok: false, error: String(e) }));
  ok("create template", tplRes.ok && tplData.ok, `${Date.now() - t0}ms ${tplData.error || ""}`);

  const layout = tplData.template?.layout_json;
  const spec = layout?.spec;
  ok("mode document", layout?.mode === "document", String(layout?.mode));
  // Seller details on the design come from the owner's BUSINESS PROFILE, never from the sample bill.
  const profRes = await fetch(`${BASE}/api/business`, { headers: { Cookie: cookie } });
  const profile = (await profRes.json()).profile;
  ok("business profile loads", profRes.ok && !!profile?.name, profile?.name);
  ok("design uses MY business name", spec?.seller?.name === profile?.name, spec?.seller?.name);
  ok("design uses MY GSTIN", spec?.seller?.gstin === profile?.gstin, spec?.seller?.gstin);
  ok(
    "bill's own seller reported separately (AADESH)",
    /AADESH COLOURS/.test(tplData.detectedSeller?.name || "") && tplData.detectedSeller?.gstin === "24ANWPP5597Q1ZK",
    JSON.stringify(tplData.detectedSeller)
  );
  const sellerCode = spec?.seller?.stateCode;
  const interstate = sellerCode && sellerCode !== "24";
  ok("Disc column enabled", !!spec?.columns?.find((c) => c.key === "disc" && c.enabled));
  ok("method geometry", tplData.method === "geometry", String(tplData.method));
  const desc = spec?.columns?.find((c) => c.key === "description");
  ok("Description width from grid (~43.8%)", !!desc && Math.abs(desc.width - 43.8) < 1, String(desc?.width));
  ok("receiver split from grid (~49.5%)", Math.abs((spec?.layout?.receiverWidth ?? 0) - 49.5) < 1.5, String(spec?.layout?.receiverWidth));
  ok("footer split from grid (~64%)", Math.abs((spec?.layout?.footerLeftWidth ?? 0) - 64.4) < 1.5, String(spec?.layout?.footerLeftWidth));
  ok("sample invoice_no 015", spec?.sample?.invoice_no === "015", spec?.sample?.invoice_no);
  ok("sample PO", spec?.sample?.po_no === "WOB/00213 /27", spec?.sample?.po_no);
  ok("sample customer", /CHIRIPAL INDUSTRIES/.test(spec?.sample?.customer_name || ""));
  ok("sample item row", spec?.sampleItems?.[0]?.qty === "1" && spec?.sampleItems?.[0]?.rate === "1125.00" && /REPARING/.test(spec?.sampleItems?.[0]?.description || ""), JSON.stringify(spec?.sampleItems?.[0]));
  ok("4 reference rows incl. Vehical No", spec?.metaRows?.filter((m) => m.enabled).length === 4 && !!spec?.metaRows?.find((m) => /Vehical/.test(m.label)));
  ok("detected >= 20", Array.isArray(tplData.detected) && tplData.detected.length >= 20, String(tplData.detected?.length));
  ok("bank IFSC", spec?.bank?.ifsc === "NVNM0000012", spec?.bank?.ifsc);
  ok("bank A/c", spec?.bank?.acNo === "139012102000132", spec?.bank?.acNo);
  ok("terms are the bill's own", spec?.terms?.lines?.length === 4 && /Ahmedabad Jurisdiction/.test(spec.terms.lines[3]), JSON.stringify(spec?.terms?.lines));
  ok("letterhead margin detected (~17.8%)", Math.abs((spec?.layout?.topMarginPct ?? 0) - 17.8) < 1, String(spec?.layout?.topMarginPct));
  ok("GST 18%", spec?.totals?.gstPercent === 18, String(spec?.totals?.gstPercent));
  const ref = layout?.referenceImageUrl;
  ok("reference image url", typeof ref === "string" && ref.startsWith("/uploads/"), String(ref));
  if (ref) {
    const imgRes = await fetch(`${BASE}${ref}`);
    const bytes = Buffer.from(await imgRes.arrayBuffer());
    ok("reference image serves", imgRes.ok && bytes.length > 40000, `${imgRes.status} ${bytes.length} bytes`);
  }

  // 2) default template endpoint (Quick bill uses this)
  const defRes = await fetch(`${BASE}/api/templates?default=1`, { headers: { Cookie: cookie } });
  const defData = await defRes.json();
  ok("default template is document", defData.template?.layout_json?.mode === "document");

  // 3) invoice with 2 items incl. discount + print
  console.log("\n-- invoice + print --");
  const items = [
    { description: "NEW FDY PACK BODY REPARING FOR LINE NO 20&21", hsn: "998719", qty: "1", unit: "NOS", rate: "1125", disc: "" },
    { description: "Very long product description that must wrap onto the next line instead of being clipped in the PDF", hsn: "8302", qty: "3", unit: "PCS", rate: "100", disc: "50" },
  ];
  const invRes = await fetch(`${BASE}/api/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      customerName: "CHIRIPAL INDUSTRIES LTD (FIBRE DIVISION)",
      customerGstin: "24AAACC8513B1ZA",
      lines: [
        { description: items[0].description, hsn: "998719", qty: 1, rate: 1125, gst_percent: 18 },
        { description: items[1].description, hsn: "8302", qty: 3, rate: 83.3333, gst_percent: 18 },
      ],
      source: "quick_bill",
      status: "sent",
      templateId: tplData.template?.id,
      fieldValues: {
        customer_name: "CHIRIPAL INDUSTRIES LTD (FIBRE DIVISION)",
        address: "Survey No. 199/1, Saijpur-Gopalpur, Pirana Road\nPiplej, Ahmedabad - 382405",
        gstin: "24AAACC8513B1ZA",
        buyer_state: "GUJARAT",
        buyer_code: "24",
        invoice_no: "015",
        invoice_date: "27-08-2026",
        payment_days: "30",
        __items: items,
      },
      createRazorpay: false,
    }),
  });
  const invData = await invRes.json();
  ok("create invoice", invRes.ok && invData.ok, invData.error || invData.invoice?.id);

  if (invData.invoice?.id) {
    const printRes = await fetch(`${BASE}/invoices/${invData.invoice.id}/print`, { headers: { Cookie: cookie } });
    const html = await printRes.text();
    ok("print 200", printRes.ok);
    ok("print has bill-document", html.includes("bill-document"));
    ok("print has customer", html.includes("CHIRIPAL INDUSTRIES"));
    ok("print has MY seller GSTIN", html.includes(profile.gstin));
    ok("print has both items", html.includes("REPARING") && html.includes("must wrap"));
    // basic 1125 + 250 = 1375; 18% → 247.50 (CGST 123.75 + SGST 123.75, or IGST 247.50) → 1622.5 → round 1623
    ok("print basic 1,375.00", html.includes("1,375.00"));
    ok(interstate ? "print IGST 247.50" : "print CGST 123.75", html.includes(interstate ? "247.50" : "123.75"));
    ok("print grand 1,623.00", html.includes("1,623.00"));
    ok("print words", html.includes("One Thousand Six Hundred Twenty Three Rupees Only"));
    ok("print signature is MY business", html.includes(`For,`) && html.includes(profile.name));
    ok("edit link correct", html.includes(`/invoices/${invData.invoice.id}`) && !html.includes("/invoices/undefined"));
    ok("no raw image overlay", !html.includes("backgroundUrl"));
    fs.writeFileSync(path.join(process.env.TEMP || ".", "chiripal-print.html"), html);

    // 3) share link + real PDF (WhatsApp)
    console.log("\n-- share + PDF --");
    const shRes = await fetch(`${BASE}/api/invoices/${invData.invoice.id}/share`, { method: "POST", headers: { Cookie: cookie } });
    const sh = await shRes.json();
    ok("share link created", shRes.ok && sh.ok && /\/share\//.test(sh.url), sh.error || sh.url);
    ok("whatsapp url carries PDF link", /wa\.me/.test(sh.whatsapp || "") && /api%2Fshare/.test(sh.whatsapp || "") || /api\/share/.test(decodeURIComponent(sh.whatsapp || "")));
    const pubRes = await fetch(sh.url); // no cookie
    const pubHtml = await pubRes.text();
    ok("public share page (no login)", pubRes.ok && pubHtml.includes("bill-document") && pubHtml.includes("CHIRIPAL INDUSTRIES"));
    const t1 = Date.now();
    const pdfRes = await fetch(sh.pdfUrl);
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    ok("PDF generated", pdfRes.ok && pdfRes.headers.get("content-type")?.includes("pdf") && pdfBuf.subarray(0, 4).toString() === "%PDF", `${pdfBuf.length} bytes in ${Date.now() - t1}ms`);
    fs.writeFileSync(path.join(process.env.TEMP || ".", "chiripal-share.pdf"), pdfBuf);
    const bad = await fetch(`${BASE}/share/${sh.url.split("/share/")[1].slice(0, -3)}xyz`);
    ok("tampered token rejected", bad.status === 404);
  }

  // 4) tax flexibility: 0% / no-tax / IGST override on a bill
  console.log("\n-- tax override --");
  const inv0 = await fetch(`${BASE}/api/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      customerName: "NO TAX CUSTOMER",
      lines: [{ description: "Exempt goods", hsn: "1001", qty: 2, rate: 500, gst_percent: 0 }],
      source: "quick_bill",
      status: "sent",
      templateId: tplData.template?.id,
      fieldValues: { customer_name: "NO TAX CUSTOMER", buyer_state: "GUJARAT", buyer_code: "24", __tax: "none", __items: [{ description: "Exempt goods", hsn: "1001", qty: "2", unit: "", rate: "500", disc: "" }] },
      createRazorpay: false,
    }),
  }).then((r) => r.json());
  ok("no-tax invoice created", inv0.ok, inv0.error);
  if (inv0.invoice?.id) {
    const html0 = await (await fetch(`${BASE}/invoices/${inv0.invoice.id}/print`, { headers: { Cookie: cookie } })).text();
    // (the spec JSON in the RSC payload legitimately contains the "CGST @{pct}%" template — look for rendered rates only)
    ok("no-tax print: no CGST/SGST/IGST rows", !/[CSI]GST @\d/.test(html0));
    ok("no-tax print: grand 1,000.00", html0.includes("1,000.00"));
  }
  const inv5 = await fetch(`${BASE}/api/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      customerName: "FIVE PCT CUSTOMER",
      lines: [{ description: "5% goods", hsn: "1001", qty: 1, rate: 1000, gst_percent: 5 }],
      source: "quick_bill",
      status: "sent",
      templateId: tplData.template?.id,
      fieldValues: { customer_name: "FIVE PCT CUSTOMER", __gst: "5", __tax: "intra", __items: [{ description: "5% goods", hsn: "1001", qty: "1", unit: "", rate: "1000", disc: "" }] },
      createRazorpay: false,
    }),
  }).then((r) => r.json());
  ok("5% intra invoice created", inv5.ok, inv5.error);
  if (inv5.invoice?.id) {
    const html5 = await (await fetch(`${BASE}/invoices/${inv5.invoice.id}/print`, { headers: { Cookie: cookie } })).text();
    ok("5% print: CGST @2.5% rows", html5.includes("CGST @2.5%") && html5.includes("SGST @2.5%"));
    ok("5% print: tax 25.00 each, grand 1,050.00", html5.includes("25.00") && html5.includes("1,050.00"));
  }

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
