/**
 * Image / scanned-bill analysis (server only), no cloud AI needed.
 *
 * Renders the page, reads words + positions with offline OCR (tesseract.js) and finds the printed
 * ruling (table borders, column rules) from the pixels. Output is the same PageAnalysis that the
 * vector-PDF reader produces, so every bill goes through one rebuild path.
 */
import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";
import type { HLine, PageAnalysis, TItem, VLine } from "./bill-analyze";
import { sanitizeForDbText } from "./bill-ocr";

type Px = { data: Uint8ClampedArray; width: number; height: number };

async function decode(jpeg: Buffer): Promise<Px> {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const img = await loadImage(jpeg);
  // OCR accuracy drops on small renders; normalise to ~1700px tall
  const scale = Math.min(3, Math.max(1, 1700 / img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}

async function toPng(px: Px): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const canvas = createCanvas(px.width, px.height);
  const ctx = canvas.getContext("2d");
  const id = ctx.createImageData(px.width, px.height);
  id.data.set(px.data);
  ctx.putImageData(id, 0, 0);
  return canvas.toBuffer("image/png");
}

/** Long straight dark runs = the printed ruling. Letters and dotted leaders are too short to count. */
function findRules(px: Px): { h: HLine[]; v: VLine[]; erase: (buf: Uint8ClampedArray) => void } {
  const { data, width: W, height: H } = px;
  const dark = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    dark[i] = data[p] * 0.3 + data[p + 1] * 0.59 + data[p + 2] * 0.11 < 150 ? 1 : 0;
  }
  const minH = Math.round(W * 0.12);
  const minV = Math.round(H * 0.05);
  // allow 1-2px breaks from anti-aliasing / scan noise
  const gap = 3;

  const hSegs: { y: number; x0: number; x1: number }[] = [];
  for (let y = 0; y < H; y++) {
    let start = -1;
    let miss = 0;
    for (let x = 0; x <= W; x++) {
      const on = x < W && dark[y * W + x] === 1;
      if (on) {
        if (start < 0) start = x;
        miss = 0;
      } else if (start >= 0 && ++miss > gap) {
        const end = x - miss;
        if (end - start >= minH) hSegs.push({ y, x0: start, x1: end });
        start = -1;
        miss = 0;
      }
    }
  }
  const vSegs: { x: number; y0: number; y1: number }[] = [];
  for (let x = 0; x < W; x++) {
    let start = -1;
    let miss = 0;
    for (let y = 0; y <= H; y++) {
      const on = y < H && dark[y * W + x] === 1;
      if (on) {
        if (start < 0) start = y;
        miss = 0;
      } else if (start >= 0 && ++miss > gap) {
        const end = y - miss;
        if (end - start >= minV) vSegs.push({ x, y0: start, y1: end });
        start = -1;
        miss = 0;
      }
    }
  }

  // A 3px-thick rule shows up as 3 adjacent runs: collapse them into one line
  const h: HLine[] = [];
  for (const s of hSegs) {
    const y = (s.y / H) * 100;
    const x0 = (s.x0 / W) * 100;
    const x1 = (s.x1 / W) * 100;
    const near = h.find((l) => Math.abs(l.y - y) < 0.35 && x0 < l.x1 && x1 > l.x0);
    if (near) {
      near.x0 = Math.min(near.x0, x0);
      near.x1 = Math.max(near.x1, x1);
    } else h.push({ y, x0, x1 });
  }
  const v: VLine[] = [];
  for (const s of vSegs) {
    const x = (s.x / W) * 100;
    const y0 = (s.y0 / H) * 100;
    const y1 = (s.y1 / H) * 100;
    const near = v.find((l) => Math.abs(l.x - x) < 0.35 && y0 < l.y1 && y1 > l.y0);
    if (near) {
      near.y0 = Math.min(near.y0, y0);
      near.y1 = Math.max(near.y1, y1);
    } else v.push({ x, y0, y1 });
  }
  // Ruling touching text makes OCR merge or drop words, so whiten it (plus a 1px halo) before reading
  const erase = (buf: Uint8ClampedArray) => {
    const white = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const p = (y * W + x) * 4;
      buf[p] = buf[p + 1] = buf[p + 2] = 255;
    };
    for (const s of hSegs) for (let x = s.x0; x <= s.x1; x++) for (let d = -1; d <= 1; d++) white(x, s.y + d);
    for (const s of vSegs) for (let y = s.y0; y <= s.y1; y++) for (let d = -1; d <= 1; d++) white(s.x + d, y);
  };
  return { h, v, erase };
}

/** Dotted / dashed leaders ("Name.........") confuse OCR: whiten short dark blobs laid out in a row. */
function eraseLeaders(px: Px) {
  const { data, width: W, height: H } = px;
  const isDark = (x: number, y: number) => {
    const p = (y * W + x) * 4;
    return data[p] * 0.3 + data[p + 1] * 0.59 + data[p + 2] * 0.11 < 150;
  };
  const maxDot = Math.max(2, Math.round(H * 0.0035));
  for (let y = 1; y < H - 1; y++) {
    let x = 0;
    while (x < W) {
      if (!isDark(x, y)) {
        x++;
        continue;
      }
      // a leader = at least 6 tiny dots on this row with small regular gaps
      const dots: [number, number][] = [];
      let cx = x;
      while (cx < W) {
        let e = cx;
        while (e < W && isDark(e, y)) e++;
        const len = e - cx;
        if (len > maxDot) break;
        // tiny vertically too: nothing dark 2*maxDot above/below
        let tall = false;
        for (let d = maxDot + 1; d <= maxDot * 2 && !tall; d++) {
          if ((y - d >= 0 && isDark(cx, y - d)) || (y + d < H && isDark(cx, y + d))) tall = true;
        }
        if (tall) break;
        dots.push([cx, e]);
        let g = e;
        while (g < W && !isDark(g, y) && g - e <= maxDot * 3) g++;
        if (g >= W || g - e > maxDot * 3) break;
        cx = g;
      }
      if (dots.length >= 6) {
        for (const [a, b] of dots) {
          for (let xx = a - 1; xx <= b; xx++) {
            for (let d = -maxDot; d <= maxDot; d++) {
              const yy = y + d;
              if (xx >= 0 && yy >= 0 && yy < H) {
                const p = (yy * W + xx) * 4;
                data[p] = data[p + 1] = data[p + 2] = 255;
              }
            }
          }
        }
        x = dots[dots.length - 1][1] + 1;
      } else x = Math.max(x + 1, dots.length ? dots[0][1] + 1 : x + 1);
    }
  }
}

type OcrWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number };

let workerPromise: Promise<import("tesseract.js").Worker> | null = null;
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const cachePath = path.join(os.tmpdir(), "ledgerly-ocr");
      mkdirSync(cachePath, { recursive: true });
      return createWorker("eng", 1, { cachePath });
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

/** Words of one OCR line merged into phrases, split where there is a clear gap (label … value). */
function phrases(words: OcrWord[], W: number, H: number): TItem[] {
  const out: TItem[] = [];
  const sorted = words.slice().sort((a, b) => a.bbox.x0 - b.bbox.x0);
  let cur: OcrWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    const x0 = Math.min(...cur.map((w) => w.bbox.x0));
    const x1 = Math.max(...cur.map((w) => w.bbox.x1));
    const y0 = Math.min(...cur.map((w) => w.bbox.y0));
    const y1 = Math.max(...cur.map((w) => w.bbox.y1));
    const s = sanitizeForDbText(cur.map((w) => w.text).join(" ")).replace(/\s+/g, " ").trim();
    if (s) {
      out.push({
        s,
        x: (x0 / W) * 100,
        // pdf.js y is the text baseline; keep the same convention
        y: (y1 / H) * 100,
        w: ((x1 - x0) / W) * 100,
        h: ((y1 - y0) / H) * 100,
        fs: y1 - y0,
      });
    }
    cur = [];
  };
  for (const w of sorted) {
    const prev = cur[cur.length - 1];
    const lineH = Math.max(8, w.bbox.y1 - w.bbox.y0);
    if (prev && w.bbox.x0 - prev.bbox.x1 > lineH * 1.1) flush();
    cur.push(w);
  }
  flush();
  return out;
}

/**
 * Read one page image. Returns null when OCR is unavailable (e.g. the language data could not be
 * downloaded) so the caller can report it instead of guessing.
 */
export async function analyzeRasterPage(jpeg: Buffer): Promise<PageAnalysis | null> {
  const px = await decode(jpeg);
  const { h, v, erase } = findRules(px);
  const clean: Px = { ...px, data: new Uint8ClampedArray(px.data) };
  erase(clean.data);
  eraseLeaders(clean);
  let texts: TItem[] = [];
  try {
    const worker = await getWorker();
    // sparse-text mode: bills are scattered labels and values, not paragraphs
    await worker.setParameters({ tessedit_pageseg_mode: "11" as never, preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(await toPng(clean), {}, { blocks: true });
    const blocks = (data as unknown as { blocks?: { paragraphs: { lines: { words: OcrWord[] }[] }[] }[] }).blocks || [];
    for (const b of blocks) {
      for (const p of b.paragraphs) {
        for (const line of p.lines) {
          const words = line.words.filter((w) => w.text.trim() && w.confidence > 25);
          texts.push(...phrases(words, px.width, px.height));
        }
      }
    }
  } catch (e) {
    console.warn("offline OCR failed:", e instanceof Error ? e.message : e);
    return null;
  }
  texts = texts.filter((t) => /[A-Za-z0-9]/.test(t.s));
  const text = texts
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .reduce((acc, t, i, arr) => {
      const prev = arr[i - 1];
      const sep = prev && Math.abs(prev.y - t.y) < 0.8 ? " " : "\n";
      return acc + (i ? sep : "") + t.s;
    }, "");
  return { width: px.width, height: px.height, texts, h, v, text };
}
