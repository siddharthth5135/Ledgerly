import { NextRequest, NextResponse } from "next/server";
import {
  buildBroadcastMessage,
  eligibleCustomers,
  listOffers,
} from "@/lib/loyalty";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";
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

export async function GET() {
  return json({ ok: true, offers: listOffers() });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`broadcast:${ip}`, 15, 60_000)) {
    return json({ ok: false, error: "Broadcast rate limit" }, 429);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  const body = safeJsonObject(raw);
  if (!body) return json({ ok: false, error: "Invalid body" }, 400);

  const offerId = sanitizeText(body.offerId || "", 64);
  if (!offerId) return json({ ok: false, error: "offerId required" }, 400);

  const message = buildBroadcastMessage(
    offerId,
    body.message ? String(body.message) : undefined
  );
  if (message.length < 8) return json({ ok: false, error: "Message too short" }, 400);

  const targets = eligibleCustomers(offerId);
  const links = targets.slice(0, 50).map((c) => {
    const phone = normalizeWhatsAppPhone(c.phone);
    const text = encodeURIComponent(message);
    return {
      customerId: c.id,
      name: c.name,
      phone: c.phone,
      url: phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`,
    };
  });

  return json({
    ok: true,
    count: links.length,
    message,
    links,
    note: "Demo: opens WhatsApp (₹0). Auto Meta send comes after paid pilots.",
  });
}
