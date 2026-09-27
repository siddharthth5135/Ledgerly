/**
 * Renders an invoice to a real A4 PDF using headless Chromium (Playwright) against the
 * public share page — so the PDF is pixel-identical to Print / the on-screen bill.
 */
import type { Browser } from "playwright";

type G = typeof globalThis & { __ledgerlyBrowser?: Promise<Browser> };

async function getBrowser(): Promise<Browser> {
  const g = globalThis as G;
  if (!g.__ledgerlyBrowser) {
    g.__ledgerlyBrowser = (async () => {
      const { chromium } = await import("playwright");
      const b = await chromium.launch({ headless: true });
      b.on("disconnected", () => {
        g.__ledgerlyBrowser = undefined;
      });
      return b;
    })();
  }
  return g.__ledgerlyBrowser;
}

export function warmBrowser(): Promise<Browser> {
  return getBrowser();
}

export async function renderInvoicePdf(pageUrl: string): Promise<Buffer> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 });
  try {
    const page = await ctx.newPage();
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForSelector(".bill-document", { timeout: 15_000 });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await ctx.close();
  }
}

export function safeFileName(s: string): string {
  return (s || "invoice").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "invoice";
}
