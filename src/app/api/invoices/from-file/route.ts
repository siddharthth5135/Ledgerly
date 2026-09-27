import { NextRequest, NextResponse } from "next/server";
import { parseInvoiceSource } from "@/lib/invoice-ai";
import { extractDocxText, extractPlainText, normalizeOcrPayload } from "@/lib/extract-file";
import {
  clientIp,
  rateLimit,
  sanitizeText,
  validateUpload,
  SECURITY_HEADERS,
} from "@/lib/security";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`upload:${ip}`, 12, 60_000)) {
    return json({ ok: false, error: "Upload rate limit. Try later." }, 429);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: "Expected multipart form data" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ ok: false, error: "file required" }, 400);
  }

  const mime = file.type || "application/octet-stream";
  const err = validateUpload(mime, file.size);
  if (err) return json({ ok: false, error: err }, 400);

  const name = sanitizeText(file.name || "upload", 180);
  const buf = await file.arrayBuffer();
  const clientText = sanitizeText(form.get("extractedText") || "", 8000);

  let raw = "";
  let source: "ocr" | "whatsapp" | "gmail" | "manual" = "ocr";

  if (mime.includes("wordprocessingml") || name.toLowerCase().endsWith(".docx")) {
    raw = await extractDocxText(buf);
    source = "gmail";
    if (raw.length < 8) {
      return json({ ok: false, error: "Could not read text from DOCX" }, 400);
    }
  } else if (mime.startsWith("text/") || name.toLowerCase().endsWith(".txt")) {
    raw = await extractPlainText(buf);
    source = "whatsapp";
  } else {
    // Image path — prefer client OCR text
    raw = normalizeOcrPayload(clientText, name);
    source = "ocr";
  }

  if (raw.length < 8) {
    return json({ ok: false, error: "Not enough text to build a bill" }, 400);
  }

  const preview = parseInvoiceSource(raw, source);
  return json({
    ok: true,
    preview,
    meta: {
      fileName: name,
      mime,
      source,
      usedClientOcr: Boolean(clientText && clientText.length >= 8),
      editable: true,
    },
  });
}
