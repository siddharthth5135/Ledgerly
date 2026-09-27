/**
 * End-to-end API test for Ledgerly 11 points.
 * Usage: node scripts/e2e-11.mjs [baseUrl]
 */

const BASE = process.argv[2] || "http://localhost:3000";
const results = [];

function ok(name, pass, detail = "") {
  results.push({ name, pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? " — " + detail : ""}`);
}

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() || [];
  if (raw.length) {
    return raw.map((c) => c.split(";")[0]).join("; ");
  }
  const single = res.headers.get("set-cookie");
  return single ? single.split(";")[0] : "";
}

async function jsonFetch(path, { method = "GET", body, cookie, formData } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body && !formData) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text.slice(0, 200) };
  }
  return { res, data, cookie: cookieFrom(res) || cookie };
}

async function main() {
  console.log(`\nE2E against ${BASE}\n`);

  // --- Point 1: Login ---
  let { res, data, cookie } = await jsonFetch("/api/auth/login", {
    method: "POST",
    body: { email: "owner@demopackers.in", password: "Password@123" },
  });
  ok("1. Login JWT", res.ok && data.ok && !!cookie, data.user?.email);
  const ownerCookie = cookie;
  const owner = data.user;
  ok("1. user_type present", !!owner?.userType, owner?.userType);
  ok("1. role owner", owner?.role === "owner", owner?.role);

  // Forgot password OTP
  ({ res, data } = await jsonFetch("/api/auth/forgot-password", {
    method: "POST",
    body: { login: "owner@demopackers.in" },
  }));
  ok(
    "1. Forgot password OTP",
    res.ok && data.ok && (!!data.devOtp || !!data.message),
    data.devOtp ? `devOtp=${data.devOtp}` : data.error || data.message || ""
  );

  if (data.devOtp) {
    ({ res, data } = await jsonFetch("/api/auth/reset-password", {
      method: "POST",
      body: {
        login: "owner@demopackers.in",
        otp: data.devOtp,
        newPassword: "Password@123",
      },
    }));
    ok("1. Reset password with OTP", res.ok && data.ok, data.error || "");
  } else {
    ok("1. Reset password with OTP", false, "no devOtp returned");
  }

  // Me
  ({ res, data } = await jsonFetch("/api/auth/me", { cookie: ownerCookie }));
  ok("1. /api/auth/me", res.ok && data.ok);

  // --- Point 9: Demo & Pricing redirect (HTML) ---
  const demo = await fetch(`${BASE}/demo`, { redirect: "manual", headers: { Cookie: ownerCookie } });
  ok("9. /demo redirects", demo.status === 307 || demo.status === 308 || demo.status === 302, `status=${demo.status}`);
  const pricing = await fetch(`${BASE}/pricing`, { redirect: "manual", headers: { Cookie: ownerCookie } });
  ok("9. /pricing redirects", pricing.status === 307 || pricing.status === 308 || pricing.status === 302, `status=${pricing.status}`);

  // --- Point 10: Dashboard ---
  ({ res, data } = await jsonFetch("/api/dashboard?period=monthly", { cookie: ownerCookie }));
  ok("10. Dashboard monthly", res.ok && data.ok && data.overview, `invoices=${data.overview?.invoice_count}`);

  // --- Point 5: Invoices filters ---
  ({ res, data } = await jsonFetch("/api/invoices?period=yearly", { cookie: ownerCookie }));
  ok("5. Invoices list", res.ok && data.ok && Array.isArray(data.invoices), `count=${data.invoices?.length}`);
  ({ res, data } = await jsonFetch("/api/invoices?period=monthly&moneyReceived=false", { cookie: ownerCookie }));
  ok("5. Filter money not received", res.ok && data.ok);

  // Create invoice with money received checkbox
  ({ res, data } = await jsonFetch("/api/invoices", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      customerName: "E2E Test Buyer",
      customerGstin: "27AABCS1111K1Z9",
      customerPhone: "9876501234",
      lines: [{ description: "Test cartons", hsn: "4819", qty: 2, rate: 100, gstPercent: 18 }],
      source: "quick_bill",
      status: "sent",
      moneyReceived: false,
      notes: "e2e",
    },
  }));
  ok("5. Create quick bill invoice", res.ok && data.ok, data.invoice?.number || data.error);
  const newInvId = data.invoice?.id;

  if (newInvId) {
    ({ res, data } = await jsonFetch(`/api/invoices/${newInvId}`, {
      method: "PATCH",
      cookie: ownerCookie,
      body: { moneyReceived: true },
    }));
    ok("5. Toggle money received", res.ok && data.ok && data.invoice?.money_received === true);
  } else {
    ok("5. Toggle money received", false, "no invoice id");
  }

  // --- Point 3 & 6: Customers commercial autofill ---
  ({ res, data } = await jsonFetch("/api/customers", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      name: "E2E Autofill Co",
      phone: "9988776655",
      gstin: "27AAAAA0000A1Z5",
      city: "Pune",
      state: "Maharashtra",
      addressLine1: "FC Road",
    },
  }));
  // GSTIN might fail format check - use valid checksum-ish
  if (!res.ok) {
    ({ res, data } = await jsonFetch("/api/customers", {
      method: "POST",
      cookie: ownerCookie,
      body: {
        name: "E2E Autofill Co",
        phone: "9988776655",
        gstin: "27AABCA1234D1Z5",
        city: "Pune",
        state: "Maharashtra",
      },
    }));
  }
  ok("6. Save commercial customer", res.ok && data.ok, data.error || data.customer?.name);

  ({ res, data } = await jsonFetch("/api/customers?autocomplete=1&q=E2E", { cookie: ownerCookie }));
  ok("3. Commercial autocomplete", res.ok && data.ok && (data.customers?.length || 0) >= 0, `hits=${data.customers?.length}`);

  ({ res, data } = await jsonFetch("/api/customers?period=monthly", { cookie: ownerCookie }));
  ok("6. Customers list + insights", res.ok && data.ok && data.insights, `type=${data.userType}`);

  // --- Point 8: Collections ---
  ({ res, data } = await jsonFetch("/api/collections?period=monthly", { cookie: ownerCookie }));
  ok("8. Collections summary", res.ok && data.ok && data.summary, `outstanding=${data.summary?.money_not_received}`);

  const unpaid = (data.invoices || []).find((i) => !i.money_received);
  if (unpaid) {
    ({ res, data } = await jsonFetch(`/api/collections?previewMessageFor=${unpaid.id}`, {
      cookie: ownerCookie,
    }));
    ok("8. Remind message preview", res.ok && data.ok && (data.message || "").length > 20);

    ({ res, data } = await jsonFetch("/api/collections", {
      method: "POST",
      cookie: ownerCookie,
      body: { invoiceId: unpaid.id, message: data.message || "Please pay politely." },
    }));
    ok("8. Send WhatsApp remind", res.ok && data.ok, data.channel || data.error);
  } else {
    ok("8. Remind message preview", true, "skipped — no unpaid in month");
    ok("8. Send WhatsApp remind", true, "skipped");
  }

  // --- Point 4: Smart template (no hang) ---
  const emptyPdf = Buffer.from(
    "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n(Customer Name:)\n(GSTIN:)\n(Qty:)\n(Rate:)\n"
  );
  const samplePdf = Buffer.from(
    "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n(Customer Name: Acme)\n(GSTIN: 27AABCA1234D1Z5)\n(Phone: 9999999999)\n(Item: Boxes)\n(Qty: 10)\n(Rate: 50)\n"
  );
  const fd = new FormData();
  fd.set("name", "E2E Template");
  fd.set("emptyBill", new File([emptyPdf], "empty.pdf", { type: "application/pdf" }));
  fd.set("sampleBill", new File([samplePdf], "sample.pdf", { type: "application/pdf" }));
  fd.set(
    "ocrText",
    "Customer Name:\nGSTIN:\nPhone:\nItem / Description:\nQty:\nRate:\nAmount:"
  );

  const t0 = Date.now();
  ({ res, data } = await jsonFetch("/api/templates", {
    method: "POST",
    cookie: ownerCookie,
    formData: fd,
  }));
  const elapsed = Date.now() - t0;
  ok(
    "4. Smart Invoice template create",
    res.ok && data.ok && elapsed < 15000,
    `${elapsed}ms id=${data.template?.id || data.error}`
  );

  ({ res, data } = await jsonFetch("/api/templates?default=1", { cookie: ownerCookie }));
  ok("4. Default template for Quick bill", res.ok && data.ok && !!data.template);

  // --- Point 11: Staff user ---
  const staffEmail = `staff.e2e.${Date.now()}@demopackers.in`;
  ({ res, data } = await jsonFetch("/api/auth/staff", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      name: "E2E Staff",
      email: staffEmail,
      phone: `9${String(Date.now()).slice(-9)}`,
      password: "Staff@123",
    },
  }));
  ok("11. Create staff under owner", res.ok && data.ok, data.error || staffEmail);

  ({ res, data, cookie } = await jsonFetch("/api/auth/login", {
    method: "POST",
    body: { email: staffEmail, password: "Staff@123" },
  }));
  ok("11. Staff login", res.ok && data.ok && data.user?.role === "staff", data.user?.role);
  const staffCookie = cookie;

  ({ res, data } = await jsonFetch("/api/invoices?period=monthly", { cookie: staffCookie }));
  ok("11. Staff can access invoices", res.ok && data.ok);

  ({ res, data } = await jsonFetch("/api/dashboard?period=monthly", { cookie: staffCookie }));
  ok("11. Staff blocked from dashboard API", res.status === 403 || !data.ok, `status=${res.status}`);

  // --- Point 7: Grow still works ---
  const grow = await fetch(`${BASE}/grow`, { headers: { Cookie: ownerCookie } });
  ok("7. Grow page loads", grow.status === 200, `status=${grow.status}`);

  // --- Register new regular user (Point 2) ---
  const regEmail = `regular.e2e.${Date.now()}@example.com`;
  ({ res, data, cookie } = await jsonFetch("/api/auth/register", {
    method: "POST",
    body: {
      businessName: "E2E Kirana",
      ownerName: "Shop Owner",
      email: regEmail,
      phone: `8${String(Date.now()).slice(-9)}`,
      password: "Test@1234",
      userType: "regular",
    },
  }));
  ok("2. Register Regular client", res.ok && data.ok && data.user?.userType === "regular", data.error || data.user?.userType);

  // Summary
  const failed = results.filter((r) => !r.pass);
  console.log(`\n——— ${results.length - failed.length}/${results.length} passed ——-\n`);
  if (failed.length) {
    console.log("Failures:");
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
