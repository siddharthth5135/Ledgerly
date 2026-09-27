import { sanitizeText } from "./security";

/** Extract plain text from a DOCX (OOXML) ArrayBuffer without mammoth. */
export async function extractDocxText(buf: ArrayBuffer): Promise<string> {
  const { unzipSync } = await import("fflate");
  const files = unzipSync(new Uint8Array(buf));
  const xmlBytes = files["word/document.xml"];
  if (!xmlBytes) return "";
  const xml = new TextDecoder("utf-8").decode(xmlBytes);
  // Pull text nodes; collapse tags
  const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  const joined = texts.join(" ").replace(/\s+/g, " ").trim();
  return sanitizeText(joined, 8000);
}

export async function extractPlainText(buf: ArrayBuffer): Promise<string> {
  const text = new TextDecoder("utf-8").decode(buf);
  return sanitizeText(text, 8000);
}

/**
 * Lightweight "OCR" for demos when no OCR engine is available:
 * Prefer client-provided extractedText. Otherwise return empty so UI asks for review.
 */
export function normalizeOcrPayload(extractedText: string, fileName: string): string {
  const t = sanitizeText(extractedText, 8000);
  if (t.length >= 8) return t;
  const hint = sanitizeText(fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "), 120);
  return sanitizeText(
    `Party: Review needed\nOrder from scan (${hint})\nPlease edit lines before sending.`,
    500
  );
}
