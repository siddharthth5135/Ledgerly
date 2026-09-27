/**
 * Ledgerly full client demo (3–5 min) — real UI actions + chapter overlays.
 * Server must be running: npm run start  OR  npm run dev
 *   node scripts/capture-demo.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "demo-assets");
const SHOTS = path.join(OUT, "screenshots");

fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function installOverlay(context) {
  await context.addInitScript(() => {
    window.__ledgerlyDemo = {
      set(title, body) {
        let el = document.getElementById("ledgerly-demo-overlay");
        if (!el) {
          el = document.createElement("div");
          el.id = "ledgerly-demo-overlay";
          el.innerHTML =
            '<div class="ld-badge">LEDGERLY DEMO</div><div class="ld-title"></div><div class="ld-body"></div>';
          document.documentElement.appendChild(el);
          const style = document.createElement("style");
          style.textContent = `
            #ledgerly-demo-overlay{
              position:fixed;left:20px;right:20px;bottom:20px;z-index:2147483647;
              background:rgba(7,17,31,.92);color:#f2f4f8;border:1px solid rgba(224,122,61,.55);
              border-radius:16px;padding:14px 18px;font-family:system-ui,sans-serif;
              box-shadow:0 12px 40px rgba(0,0,0,.35);pointer-events:none;
              backdrop-filter:blur(8px);
            }
            #ledgerly-demo-overlay .ld-badge{
              font-size:11px;letter-spacing:.14em;color:#e07a3d;font-weight:700;margin-bottom:4px;
            }
            #ledgerly-demo-overlay .ld-title{
              font-size:18px;font-weight:700;line-height:1.25;margin-bottom:4px;
            }
            #ledgerly-demo-overlay .ld-body{
              font-size:14px;line-height:1.45;color:rgba(242,244,248,.82);max-width:920px;
            }
          `;
          document.documentElement.appendChild(style);
        }
        el.querySelector(".ld-title").textContent = title || "";
        el.querySelector(".ld-body").textContent = body || "";
        el.style.display = title ? "block" : "none";
      },
      clear() {
        window.__ledgerlyDemo.set("", "");
      },
    };
  });
}

async function say(page, title, body, seconds) {
  await page.evaluate(
    ({ title, body }) => window.__ledgerlyDemo?.set(title, body),
    { title, body }
  );
  await sleep(Math.max(0.5, seconds) * 1000);
}

async function shot(page, name, label) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ✓ ${name}.png — ${label}`);
}

async function main() {
  console.log(`\nRecording FULL demo from ${BASE}\n`);

  // Clean old video tmp
  const tmpDir = path.join(OUT, "video-tmp");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: tmpDir, size: { width: 1440, height: 900 } },
  });

  await installOverlay(context);
  const page = await context.newPage();

  // ========== ACT 1: PROBLEM (home, steady) ==========
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(1200);
  await shot(page, "01-home-problem", "Problem — home steady");

  await say(
    page,
    "The problem every shop faces",
    "Orders come on WhatsApp. Bills are typed in Excel. GST is guessed. Payments are chased late. Customer names live only in the owner’s head.",
    12
  );
  await say(
    page,
    "What that costs you",
    "10+ hours a week on paperwork. Wrong IGST vs CGST notices. Overdue cash stuck for weeks. No memory of who buys every day — so no offers, no follow-up.",
    11
  );
  await page.evaluate(() => window.scrollTo({ top: 420, behavior: "smooth" }));
  await sleep(2000);
  await say(
    page,
    "Existing tools miss the real job",
    "Tally is for accountants. Excel is manual. Invoice apps only print bills. None of them remember your buyers or help you sell more tomorrow.",
    10
  );
  await shot(page, "02-home-scroll", "Problem — scrolled modules");

  // ========== ACT 2: SOLUTION OVERVIEW ==========
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(1500);
  await say(
    page,
    "Ledgerly is not just invoice printing",
    "It is your shop money OS: Bill correctly → Remember every customer → Collect dues → Push offers → Close books for your CA.",
    12
  );
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: "smooth" }));
  await sleep(2000);
  await say(
    page,
    "Four connected jobs (one product)",
    "1) Smart / Quick bill  2) Customer phone memory  3) Collections + Grow offers  4) Books journal. Switching cost grows as your data lives here.",
    12
  );
  await shot(page, "03-solution-overview", "Solution overview");

  // ========== ACT 3: QUICK BILL (detailed) ==========
  await page.goto(`${BASE}/invoices/manual`, { waitUntil: "networkidle" });
  await sleep(1000);
  await say(
    page,
    "Feature 1 — Quick bill (counter)",
    "When a buyer is standing in front of you: pick saved customer, add items, create GST bill in seconds. No WhatsApp paste needed.",
    9
  );
  await shot(page, "04-quick-bill-start", "Quick bill start");

  await page.selectOption("select", { label: /Sharma Kirana/i }).catch(async () => {
    const selects = page.locator("select");
    await selects.first().selectOption({ index: 0 });
  });
  await sleep(1200);
  await say(
    page,
    "Pick a remembered customer",
    "Sharma Kirana — phone and GSTIN fill automatically. Ledgerly already knows this party.",
    7
  );

  // Add item from catalog if select exists
  const catalogSelects = page.locator("select");
  const count = await catalogSelects.count();
  if (count >= 2) {
    await catalogSelects.nth(1).selectOption({ index: 1 }).catch(() => {});
    await sleep(800);
  }
  await say(
    page,
    "Add line items from your catalog",
    "Cartons, tape, pouches — saved HSN and rates. Edit qty and rate if the deal changes today.",
    8
  );
  await shot(page, "05-quick-bill-filled", "Quick bill filled");

  await page.getByRole("button", { name: /Create \+ Print invoice/i }).click();
  await page.waitForURL(/\/invoices\/.*\/print/, { timeout: 20000 });
  await sleep(1500);
  await say(
    page,
    "GST is calculated for you",
    "Same state = CGST + SGST. Other state = IGST. HSN, taxable value, grand total, amount in words — ready for paper or PDF.",
    11
  );
  await shot(page, "06-print-invoice", "Print tax invoice");

  await say(
    page,
    "Print / Save PDF + WhatsApp",
    "Click Print for paper or Save as PDF. Share WhatsApp opens with bill text + pay link — ₹0 cost for demos and pilots.",
    9
  );

  // ========== ACT 4: SMART INVOICE ==========
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle" });
  await sleep(1000);
  await say(
    page,
    "Feature 2 — Smart invoice from WhatsApp",
    "Customer messages: ‘15 cartons @ 450’. Paste it. Ledgerly drafts the bill. Then you edit freely — like Word — before sending.",
    10
  );
  await shot(page, "07-smart-start", "Smart invoice start");

  const wa =
    "Urban Wear wants 15 cartons tomorrow @ 450. GSTIN 07AABCU9988W1Z3. Phone 9811122333 pay@urbanwear.in";
  await page.fill("textarea", "");
  await page.type("textarea", wa, { delay: 12 });
  await sleep(800);
  await say(
    page,
    "Paste the real WhatsApp order",
    "No retyping into Excel. Phone, GSTIN, qty and rate are extracted automatically.",
    7
  );

  await page.getByRole("button", { name: /Generate editable draft/i }).click();
  await page.waitForSelector("text=Edit freely", { timeout: 20000 });
  await sleep(1500);
  await say(
    page,
    "Editable draft — you stay in control",
    "Change customer name, qty, rate, HSN, notes. AI is an assistant, not the boss. Wrong line? Fix it in one tap.",
    10
  );
  await shot(page, "08-smart-editable", "Editable draft");

  // Edit a field to show control
  const qtyInputs = page.locator('input[type="number"]');
  if ((await qtyInputs.count()) > 0) {
    await qtyInputs.first().fill("18");
    await sleep(1000);
    await say(
      page,
      "Live edit example",
      "Owner changed qty from 15 to 18 after a verbal confirmation. Totals update. Then Send + Print.",
      8
    );
  }

  // Phone lookup demo
  const phoneBox = page.getByPlaceholder(/Customer phone/i);
  if (await phoneBox.count()) {
    await phoneBox.fill("9876543210");
    await page.getByRole("button", { name: /Remember \/ lookup/i }).click();
    await sleep(2000);
    await say(
      page,
      "Feature 3 — Remember by phone",
      "Enter mobile → if this buyer billed before, name and history come back. Your customer list grows with every invoice.",
      10
    );
  }
  await shot(page, "09-phone-memory", "Phone memory");

  // ========== ACT 5: CUSTOMERS CRM ==========
  await page.goto(`${BASE}/customers`, { waitUntil: "networkidle" });
  await sleep(1500);
  await say(
    page,
    "Customers = your growth data",
    "Not a static contact book. See bills count, purchase totals, tags like daily/regular, and who went quiet for 14+ days.",
    11
  );
  await shot(page, "10-customers", "Customers CRM");
  await say(
    page,
    "Plan your day from data",
    "Call quiet buyers. Reward regulars. Focus on top purchasers. This is how Ledgerly helps acquire and keep customers — not only print bills.",
    10
  );

  // ========== ACT 6: GROW ==========
  await page.goto(`${BASE}/grow`, { waitUntil: "networkidle" });
  await sleep(1200);
  await say(
    page,
    "Feature 4 — Grow / offers",
    "Festival stock? Daily-buyer perk? Write the message once. Ledgerly prepares WhatsApp links for eligible customers with phones on file.",
    10
  );
  await shot(page, "11-grow-start", "Grow start");

  const prepareBtn = page.getByRole("button", { name: /Prepare WhatsApp broadcast/i });
  if (await prepareBtn.count()) {
    await prepareBtn.click();
    await sleep(2000);
  }
  await say(
    page,
    "Broadcast without buying Meta API yet",
    "Each link opens WhatsApp with the offer pre-filled. Cost today: ₹0. Auto-send later when you have paid volume.",
    10
  );
  await shot(page, "12-grow-links", "Grow links ready");

  // ========== ACT 7: COLLECTIONS ==========
  await page.goto(`${BASE}/collections`, { waitUntil: "networkidle" });
  await sleep(1200);
  await say(
    page,
    "Feature 5 — Collections radar",
    "Overdue invoices surface automatically. Send a polite reminder with pay link. Cash stuck in receivables is recovered — that is real value for money.",
    11
  );
  await shot(page, "13-collections", "Collections");

  // ========== ACT 8: BOOKS ==========
  await page.goto(`${BASE}/books`, { waitUntil: "networkidle" });
  await sleep(1200);
  await say(
    page,
    "Feature 6 — Books bridge",
    "Every bill becomes a balanced journal: Sales, CGST/SGST or IGST, Receivable. Your CA spends less time retyping WhatsApp screenshots.",
    11
  );
  await shot(page, "14-books", "Books");

  // ========== ACT 9: CLOSE ==========
  await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
  await sleep(1000);
  await say(
    page,
    "Why shops say yes",
    "Cheaper than a data-entry person. Faster than Excel. Remembers customers. Helps collect. Helps sell again with offers.",
    10
  );
  await shot(page, "15-pricing", "Pricing");
  await say(
    page,
    "Pilot offer — ₹999 for 7 days",
    "Forward your WhatsApp orders. Get GST-correct printable bills. We chase overdues with you. If it does not save time or cash — you stop.",
    12
  );
  await say(
    page,
    "Next step",
    "Start this week with your last 10 orders. Ledgerly becomes the system that bills, remembers, collects, and grows your shop.",
    10
  );

  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(800);
  await say(
    page,
    "Ledgerly",
    "Bill. Remember. Collect. Grow. Close the books.",
    6
  );
  await shot(page, "16-end-card", "End");

  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  let finalVideo = null;
  if (videoPath && fs.existsSync(videoPath)) {
    finalVideo = path.join(OUT, "Ledgerly-Client-Demo.webm");
    fs.copyFileSync(videoPath, finalVideo);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const mb = (fs.statSync(finalVideo).size / (1024 * 1024)).toFixed(2);
    console.log(`\n  ✓ Video: Ledgerly-Client-Demo.webm (${mb} MB)`);
  }

  fs.writeFileSync(
    path.join(OUT, "manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        baseUrl: BASE,
        targetDuration: "3-5 minutes",
        video: finalVideo ? "Ledgerly-Client-Demo.webm" : null,
      },
      null,
      2
    )
  );
  console.log("\nFull demo capture complete.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
