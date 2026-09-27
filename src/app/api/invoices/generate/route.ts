import { NextRequest, NextResponse } from "next/server";
import { parseInvoiceSource } from "@/lib/invoice-ai";
import {
  clientIp,
  rateLimit,
  safeJsonObject,
  sanitizeText,
  SECURITY_HEADERS,
} from "@/lib/security";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`gen:${clientIp(req)}`, 25, 60_000)) {
    return json({ ok: false, error: "AI rate limit. Try again shortly." }, 429);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  const body = safeJsonObject(rawBody);
  if (!body) return json({ ok: false, error: "Invalid body" }, 400);

  const source = String(body.source || "whatsapp") as "whatsapp" | "gmail" | "ocr" | "manual";
  const raw = sanitizeText(body.raw || "", 8000);

  if (raw.length < 8) {
    return json(
      { ok: false, error: "Paste at least a short message (8+ characters)" },
      400
    );
  }

  if (!["whatsapp", "gmail", "ocr", "manual"].includes(source)) {
    return json({ ok: false, error: "Invalid source" }, 400);
  }

  const preview = parseInvoiceSource(raw, source === "manual" ? "whatsapp" : source);
  return json({ ok: true, preview, editable: true });
}
