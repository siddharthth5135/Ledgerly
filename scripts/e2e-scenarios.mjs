/**
 * Deep real-scenario E2E for Ledgerly modules.
 * node scripts/e2e-scenarios.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3000";
const out = [];
const fail = (n, d) => {
  out.push({ n, ok: false, d });
  console.log(`FAIL  ${n} — ${d}`);
};
const pass = (n, d = "") => {
  out.push({ n, ok: true, d });
  console.log(`PASS  ${n}${d ? " — " + d : ""}`);
};

function getCookie(res) {
  const arr = res.headers.getSetCookie?.() || [];
  if (arr.length) return arr.map((c) => c.split(";")[0]).join("; ");
  const s = res.headers.get("set-cookie");
  return s ? s.split(",")[0].split(";")[0] : "";
}

async function api(path, { method = "GET", body, cookie, formData } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body && !formData) headers["Content-Type"] = "application/json";
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
    data = { _html: text.slice(0, 120), _raw: text.slice(0, 300) };
  }
  const c = getCookie(res);
  return { res, data, cookie: c || cookie || "" };
}

async function page(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
  return res;
}

async function main() {
  console.log(`\nDeep scenarios @ ${BASE}\n`);

  // ========== AUTH ==========
  let r = await api("/api/auth/login", {
    method: "POST",
    body: { email: "wrong@x.com", password: "bad" },
  });
  r.res.status === 401 ? pass("Auth: bad login rejected") : fail("Auth: bad login rejected", String(r.res.status));

  r = await api("/api/auth/login", {
    method: "POST",
    body: { email: "owner@demopackers.in", password: "Password@123" },
  });
  if (!(r.res.ok && r.data.ok && r.cookie)) {
    fail("Auth: owner login", r.data.error || "no cookie");
    console.log("Abort — cannot continue without login");
    process.exit(1);
  }
  pass("Auth: owner login", r.data.user.userType);
  let owner = r.cookie;
  const ownerUser = r.data.user;

  r = await api("/api/auth/me", { cookie: owner });
  r.data.ok ? pass("Auth: session me") : fail("Auth: session me", r.data.error);

  r = await api("/api/auth/forgot-password", {
    method: "POST",
    body: { login: "owner@demopackers.in" },
  });
  if (r.data.ok && r.data.devOtp) {
    pass("Auth: OTP issued", r.data.devOtp);
    const otp = r.data.devOtp;
    r = await api("/api/auth/reset-password", {
      method: "POST",
      body: { login: "owner@demopackers.in", otp: "000000", newPassword: "Password@123" },
    });
    !r.data.ok ? pass("Auth: bad OTP rejected") : fail("Auth: bad OTP rejected", "accepted bad otp");

    r = await api("/api/auth/forgot-password", {
      method: "POST",
      body: { login: "owner@demopackers.in" },
    });
    const otp2 = r.data.devOtp;
    r = await api("/api/auth/reset-password", {
      method: "POST",
      body: { login: "owner@demopackers.in", otp: otp2, newPassword: "Password@123" },
    });
    r.data.ok ? pass("Auth: OTP reset password") : fail("Auth: OTP reset password", r.data.error);
  } else {
    fail("Auth: OTP issued", r.data.error || "no otp");
  }

  // ========== PAGES (owner) ==========
  for (const p of [
    "/dashboard",
    "/invoices",
    "/invoices/manual",
    "/smart-invoice",
    "/customers",
    "/collections",
    "/settings",
    "/grow",
    "/books",
  ]) {
    const res = await page(p, owner);
    res.status === 200 ? pass(`Page ${p}`) : fail(`Page ${p}`, `status ${res.status}`);
  }

  const demo = await page("/demo", owner);
  demo.status >= 300 && demo.status < 400
    ? pass("Nav: demo redirected")
    : fail("Nav: demo redirected", String(demo.status));
  const pricing = await page("/pricing", owner);
  pricing.status >= 300 && pricing.status < 400
    ? pass("Nav: pricing redirected")
    : fail("Nav: pricing redirected", String(pricing.status));

  // Unauthenticated protected
  const dashAnon = await page("/dashboard");
  dashAnon.status === 307 || dashAnon.status === 302
    ? pass("Auth: dashboard requires login")
    : fail("Auth: dashboard requires login", String(dashAnon.status));

  // ========== DASHBOARD ==========
  for (const period of ["weekly", "monthly", "quarterly", "yearly"]) {
    r = await api(`/api/dashboard?period=${period}`, { cookie: owner });
    r.data.ok && r.data.overview
      ? pass(`Dashboard ${period}`, `bills=${r.data.overview.invoice_count}`)
      : fail(`Dashboard ${period}`, r.data.error || "");
  }

  // ========== CUSTOMERS (commercial) ==========
  const phone = `98${String(Date.now()).slice(-8)}`;
  r = await api("/api/customers", {
    method: "POST",
    cookie: owner,
    body: {
      name: "Scenario Traders LLP",
      phone,
      gstin: "27AABCA1234D1Z5",
      email: "accounts@scenario.in",
      city: "Pune",
      state: "Maharashtra",
      addressLine1: "Baner Road",
    },
  });
  r.data.ok ? pass("Customers: create commercial", r.data.customer?.name) : fail("Customers: create", r.data.error);
  const custId = r.data.customer?.id;

  r = await api("/api/customers?autocomplete=1&q=Scenario", { cookie: owner });
  const hit = (r.data.customers || []).find((c) => c.name?.includes("Scenario"));
  hit ? pass("Customers: autocomplete by name", hit.gstin) : fail("Customers: autocomplete", "no hit");

  r = await api("/api/customers?autocomplete=1&q=27AABCA", { cookie: owner });
  (r.data.customers || []).length
    ? pass("Customers: autocomplete by GSTIN")
    : fail("Customers: autocomplete by GSTIN", "empty");

  r = await api("/api/customers?period=monthly", { cookie: owner });
  r.data.ok && r.data.insights && r.data.userType === "commercial"
    ? pass("Customers: insights commercial")
    : fail("Customers: insights", JSON.stringify(r.data.insights || r.data.error));

  // ========== QUICK BILL / INVOICES ==========
  r = await api("/api/templates?default=1", { cookie: owner });
  r.data.ok ? pass("Quick bill: default template", r.data.template?.name || "none") : fail("Quick bill: template", r.data.error);
  const templateId = r.data.template?.id;

  r = await api("/api/invoices", {
    method: "POST",
    cookie: owner,
    body: {
      customerId: custId,
      customerName: "Scenario Traders LLP",
      customerGstin: "27AABCA1234D1Z5",
      customerPhone: phone,
      templateId,
      fieldValues: { customer_name: "Scenario Traders LLP", qty: "5", rate: "200" },
      lines: [
        { description: "Corrugated boxes", hsn: "4819", qty: 5, rate: 200, gstPercent: 18 },
        { description: "Tape rolls", hsn: "3919", qty: 10, rate: 40, gstPercent: 18 },
      ],
      moneyReceived: false,
      source: "quick_bill",
      status: "sent",
      notes: "Scenario bill",
    },
  });
  if (r.data.ok && r.data.invoice) {
    pass("Invoices: create multi-line", `${r.data.invoice.number} total=${r.data.invoice.total_amount}`);
  } else {
    fail("Invoices: create multi-line", r.data.error || "");
  }
  const invId = r.data.invoice?.id;
  const invNumber = r.data.invoice?.number;

  // Filters
  r = await api(`/api/invoices?period=yearly&search=${encodeURIComponent("Scenario")}`, { cookie: owner });
  (r.data.invoices || []).some((i) => i.customer_name?.includes("Scenario"))
    ? pass("Invoices: search filter")
    : fail("Invoices: search filter", "not found");

  r = await api("/api/invoices?period=yearly&amountMin=1000&amountMax=50000", { cookie: owner });
  r.data.ok ? pass("Invoices: amount range", `n=${r.data.invoices?.length}`) : fail("Invoices: amount range", r.data.error);

  r = await api("/api/invoices?period=yearly&moneyReceived=false", { cookie: owner });
  const unpaidBefore = (r.data.invoices || []).filter((i) => !i.money_received).length;
  unpaidBefore >= 1 ? pass("Invoices: unpaid filter", `n=${unpaidBefore}`) : fail("Invoices: unpaid filter", "0");

  if (invId) {
    r = await api(`/api/invoices/${invId}`, { cookie: owner });
    r.data.ok && r.data.invoice
      ? pass("Invoices: detail with lines", `lines=${(r.data.lines || []).length}`)
      : fail("Invoices: detail", r.data.error);

    const print = await page(`/invoices/${invId}/print`, owner);
    print.status === 200 ? pass("Invoices: print page") : fail("Invoices: print page", String(print.status));

    r = await api(`/api/invoices/${invId}`, {
      method: "PATCH",
      cookie: owner,
      body: { moneyReceived: true },
    });
    r.data.invoice?.money_received
      ? pass("Invoices: mark money received")
      : fail("Invoices: mark money received", r.data.error);

    // remind should fail when money received
    r = await api("/api/collections", {
      method: "POST",
      cookie: owner,
      body: { invoiceId: invId, message: "Please pay" },
    });
    !r.data.ok
      ? pass("Collections: cannot remind paid invoice")
      : fail("Collections: cannot remind paid invoice", "allowed remind on paid");
  }

  // Create unpaid for collections
  r = await api("/api/invoices", {
    method: "POST",
    cookie: owner,
    body: {
      customerName: "Overdue Scenario Buyer",
      customerPhone: "9111222333",
      lines: [{ description: "Urgent order", hsn: "9997", qty: 1, rate: 1500, gstPercent: 18 }],
      moneyReceived: false,
      source: "quick_bill",
      status: "sent",
    },
  });
  const unpaidId = r.data.invoice?.id;
  unpaidId ? pass("Collections: unpaid invoice ready", r.data.invoice.number) : fail("Collections: unpaid", r.data.error);

  r = await api("/api/collections?period=yearly", { cookie: owner });
  r.data.ok && r.data.summary
    ? pass(
        "Collections: yearly money KPIs",
        `recv=${r.data.summary.money_received} not=${r.data.summary.money_not_received}`
      )
    : fail("Collections: KPIs", r.data.error);

  if (unpaidId) {
    r = await api(`/api/collections?previewMessageFor=${unpaidId}`, { cookie: owner });
    const msg = r.data.message || "";
    msg.includes("Overdue Scenario") || msg.includes("invoice")
      ? pass("Collections: polite remind draft", `${msg.slice(0, 60)}…`)
      : fail("Collections: remind draft", msg.slice(0, 80));

    r = await api("/api/collections", {
      method: "POST",
      cookie: owner,
      body: { invoiceId: unpaidId, message: msg },
    });
    r.data.ok && r.data.channel === "whatsapp"
      ? pass("Collections: WhatsApp remind sent")
      : fail("Collections: WhatsApp remind", r.data.error);
  }

  // ========== SMART INVOICE ==========
  const emptyPdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n(Customer Name:)\n(GSTIN:)\n"
  );
  const samplePdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n(Customer Name: Chiripal)\n(GSTIN: 24AAAAA0000A1Z5)\n(Qty: 12)\n(Rate: 99)\n"
  );
  const fd = new FormData();
  fd.set("name", "Scenario Chiripal Bill");
  fd.set("emptyBill", new File([emptyPdf], "EMPTY_CHIRIPAL.pdf", { type: "application/pdf" }));
  fd.set("sampleBill", new File([samplePdf], "CHIRIPAL.pdf", { type: "application/pdf" }));
  fd.set(
    "ocrText",
    "Customer Name:\nGSTIN:\nPhone:\nItem / Description:\nHSN:\nQty:\nRate:\nAmount:"
  );
  const t0 = Date.now();
  r = await api("/api/templates", { method: "POST", cookie: owner, formData: fd });
  const ms = Date.now() - t0;
  r.data.ok && ms < 10000
    ? pass("Smart Invoice: create template fast", `${ms}ms`)
    : fail("Smart Invoice: create", `${ms}ms ${r.data.error || ""}`);

  const tpl = r.data.template;
  if (tpl?.id) {
    r = await api("/api/templates", {
      method: "PATCH",
      cookie: owner,
      body: {
        id: tpl.id,
        layoutHtml: "<div>{{customer_name}} / {{rate}}</div>",
        fieldSchema: [
          { key: "customer_name", label: "Customer Name", type: "text", required: true },
          { key: "rate", label: "Rate", type: "number", required: true },
        ],
        setDefault: true,
      },
    });
    r.data.ok ? pass("Smart Invoice: edit+save template") : fail("Smart Invoice: save", r.data.error);

    // Quick bill using template fields
    r = await api("/api/invoices", {
      method: "POST",
      cookie: owner,
      body: {
        customerName: "Template Buyer",
        templateId: tpl.id,
        fieldValues: { customer_name: "Template Buyer", rate: "250" },
        lines: [{ description: "From template", hsn: "9997", qty: 1, rate: 250, gstPercent: 18 }],
        moneyReceived: true,
        source: "quick_bill",
        status: "sent",
      },
    });
    r.data.ok && r.data.invoice?.money_received
      ? pass("Quick bill: from template + money received", r.data.invoice.number)
      : fail("Quick bill: from template", r.data.error);
  }

  r = await api("/api/templates", { cookie: owner });
  (r.data.templates || []).length >= 1
    ? pass("Smart Invoice: list templates", `n=${r.data.templates.length}`)
    : fail("Smart Invoice: list", "empty");

  // ========== STAFF ==========
  const staffEmail = `staff.scen.${Date.now()}@demopackers.in`;
  const staffPhone = `97${String(Date.now()).slice(-8)}`;
  r = await api("/api/auth/staff", {
    method: "POST",
    cookie: owner,
    body: { name: "Billing Clerk", email: staffEmail, phone: staffPhone, password: "Staff@123" },
  });
  r.data.ok ? pass("Owner: create staff") : fail("Owner: create staff", r.data.error);

  r = await api("/api/auth/login", {
    method: "POST",
    body: { email: staffEmail, password: "Staff@123" },
  });
  const staff = r.cookie;
  r.data.user?.role === "staff" ? pass("Staff: login") : fail("Staff: login", r.data.error);

  r = await api("/api/invoices?period=monthly", { cookie: staff });
  r.data.ok ? pass("Staff: invoices allowed") : fail("Staff: invoices", r.data.error);

  r = await api("/api/invoices", {
    method: "POST",
    cookie: staff,
    body: {
      customerName: "Staff Created Customer",
      customerPhone: "9000011111",
      lines: [{ description: "Staff bill", hsn: "9997", qty: 1, rate: 99, gstPercent: 18 }],
      moneyReceived: false,
      source: "quick_bill",
      status: "sent",
    },
  });
  r.data.ok ? pass("Staff: create quick bill", r.data.invoice?.number) : fail("Staff: create bill", r.data.error);

  r = await api("/api/dashboard?period=monthly", { cookie: staff });
  r.res.status === 403 || !r.data.ok
    ? pass("Staff: dashboard forbidden")
    : fail("Staff: dashboard forbidden", "staff saw dashboard");

  r = await api("/api/collections?period=monthly", { cookie: staff });
  r.res.status === 403 || !r.data.ok
    ? pass("Staff: collections forbidden")
    : fail("Staff: collections forbidden", "allowed");

  const staffCustPage = await page("/customers", staff);
  staffCustPage.status === 307 || staffCustPage.status === 302
    ? pass("Staff: customers page redirected")
    : fail("Staff: customers page redirected", String(staffCustPage.status));

  // ========== REGISTER COMMERCIAL + REGULAR ==========
  const ts = Date.now();
  const gstinSuffix = String(ts).slice(-4);
  r = await api("/api/auth/register", {
    method: "POST",
    body: {
      businessName: `Comm Factory ${ts}`,
      ownerName: "Factory Owner",
      email: `comm.${ts}@ex.com`,
      phone: `91${String(ts).slice(-8)}`,
      password: "Test@1234",
      userType: "commercial",
      // unique-ish GSTIN (format only; demo DB uniqueness)
      gstin: `29AABC${gstinSuffix}11P1Z6`.slice(0, 15).toUpperCase().padEnd(15, "X"),
      city: "Bengaluru",
      state: "Karnataka",
    },
  });
  // If GSTIN unique constraint fails, retry without gstin
  if (!r.data.ok) {
    r = await api("/api/auth/register", {
      method: "POST",
      body: {
        businessName: `Comm Factory ${ts}b`,
        ownerName: "Factory Owner",
        email: `comm2.${ts}@ex.com`,
        phone: `93${String(ts).slice(-8)}`,
        password: "Test@1234",
        userType: "commercial",
        city: "Bengaluru",
        state: "Karnataka",
      },
    });
  }
  r.data.ok && r.data.user?.userType === "commercial"
    ? pass("Register: commercial business")
    : fail("Register: commercial", r.data.error);

  r = await api("/api/auth/register", {
    method: "POST",
    body: {
      businessName: `Kirana ${ts}`,
      email: `reg.${ts}@ex.com`,
      phone: `92${String(ts).slice(-8)}`,
      password: "Test@1234",
      userType: "regular",
    },
  });
  r.data.ok && r.data.user?.userType === "regular"
    ? pass("Register: regular shop")
    : fail("Register: regular", r.data.error);

  // Regular customer without GST
  const regCookie = r.cookie;
  r = await api("/api/customers", {
    method: "POST",
    cookie: regCookie,
    body: { name: "Walk-in Ramesh", phone: "9876500001" },
  });
  r.data.ok ? pass("Regular: save light customer") : fail("Regular: save customer", r.data.error);

  r = await api("/api/customers?period=monthly", { cookie: regCookie });
  r.data.userType === "regular" && r.data.insights
    ? pass("Regular: insights (no GST required)")
    : fail("Regular: insights", r.data.error || r.data.userType);

  // Grow
  const grow = await page("/grow", owner);
  grow.status === 200 ? pass("Grow: page intact") : fail("Grow: page", String(grow.status));

  // Logout
  r = await api("/api/auth/logout", { method: "POST", cookie: owner });
  r.data.ok ? pass("Auth: logout") : fail("Auth: logout", r.data.error);

  const failed = out.filter((x) => !x.ok);
  console.log(`\n——— ${out.length - failed.length}/${out.length} passed ——-\n`);
  if (failed.length) {
    console.log("Failures:");
    failed.forEach((f) => console.log(`  - ${f.n}: ${f.d}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
