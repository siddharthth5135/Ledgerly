import { createServer } from "node:http";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Save empty-bill preview JPEG under public/uploads (exact design). */
export async function saveTemplateBackground(
  ownerId: string,
  bytes: Buffer,
  ext = "jpg"
): Promise<{ url: string; absPath: string }> {
  const id = randomUUID();
  const dir = path.join(process.cwd(), "public", "uploads", "templates", ownerId);
  await mkdir(dir, { recursive: true });
  const filename = `${id}.${ext}`;
  const absPath = path.join(dir, filename);
  await writeFile(absPath, bytes);
  const url = `/uploads/templates/${ownerId}/${filename}`;
  return { url, absPath };
}

function isImageFile(fileName: string, mime?: string | null) {
  return (
    (mime || "").startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName)
  );
}

function ensurePdfAssets() {
  const workerDest = path.join(process.cwd(), "public", "pdf.worker.min.mjs");
  const shimDest = path.join(process.cwd(), "public", "pdfjs-shim.js");
  const workerSrc = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "build",
    "pdf.worker.min.mjs"
  );
  if (!existsSync(workerDest) && existsSync(workerSrc)) {
    mkdirSync(path.dirname(workerDest), { recursive: true });
    writeFileSync(workerDest, readFileSync(workerSrc));
  }
  return { workerDest, shimDest };
}

/**
 * Exact PDF page → JPEG via Chromium + bundled pdf.js (IIFE).
 * Avoids CDN and @napi-rs/canvas Path2D crashes on GST PDFs.
 */
export async function renderBillPreviewJpeg(
  buf: Buffer,
  fileName: string,
  mime?: string | null
): Promise<{ jpeg: Buffer; width: number; height: number }> {
  if (isImageFile(fileName, mime)) {
    return { jpeg: buf, width: 1240, height: 1754 };
  }

  const { workerDest, shimDest } = ensurePdfAssets();
  if (!existsSync(shimDest)) {
    throw new Error(
      "public/pdfjs-shim.js missing — run: npx esbuild node_modules/pdfjs-dist/build/pdf.mjs --bundle --format=iife --global-name=pdfjsLib --outfile=public/pdfjs-shim.js --platform=browser"
    );
  }

  const shim = await readFile(shimDest);
  const worker = await readFile(workerDest);
  const html = `<!DOCTYPE html>
<html><body style="margin:0;background:#fff">
<canvas id="c"></canvas>
<script src="/pdfjs-shim.js"></script>
<script>
(async () => {
  try {
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const data = new Uint8Array(await (await fetch("/bill.pdf")).arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const pg = await doc.getPage(1);
    const viewport = pg.getViewport({ scale: 2 });
    const canvas = document.getElementById("c");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    await pg.render({ canvasContext: ctx, viewport }).promise;
    window.__DONE__ = {
      width: canvas.width,
      height: canvas.height,
      dataUrl: canvas.toDataURL("image/jpeg", 0.92),
    };
  } catch (e) {
    window.__ERR__ = String(e && e.stack || e);
  }
})();
</script>
</body></html>`;

  const server = createServer((req, res) => {
    const url = req.url?.split("?")[0] || "/";
    const send = (code: number, type: string, body: string | Buffer) => {
      res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(body);
    };
    try {
      if (url === "/" || url === "/index.html") return send(200, "text/html", html);
      if (url === "/bill.pdf") return send(200, "application/pdf", buf);
      if (url === "/pdfjs-shim.js") return send(200, "text/javascript", shim);
      if (url === "/pdf.worker.min.mjs") return send(200, "text/javascript", worker);
      return send(404, "text/plain", "no");
    } catch (e) {
      return send(500, "text/plain", String(e));
    }
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    server.close();
    throw new Error("Failed to bind PDF render server");
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 2000 } });
    await page.goto(`http://127.0.0.1:${addr.port}/`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.waitForFunction(
      () =>
        Boolean(
          (window as unknown as { __DONE__?: unknown; __ERR__?: unknown }).__DONE__ ||
            (window as unknown as { __ERR__?: unknown }).__ERR__
        ),
      null,
      { timeout: 90_000 }
    );
    const err = await page.evaluate(
      () => (window as unknown as { __ERR__?: string }).__ERR__
    );
    if (err) throw new Error(`PDF render failed: ${err}`);
    const result = await page.evaluate(() => {
      return (window as unknown as {
        __DONE__: { width: number; height: number; dataUrl: string };
      }).__DONE__;
    });
    const m = result.dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
    if (!m) throw new Error("PDF render produced no JPEG");
    return {
      jpeg: Buffer.from(m[1], "base64"),
      width: result.width,
      height: result.height,
    };
  } finally {
    await browser.close();
    server.close();
  }
}
