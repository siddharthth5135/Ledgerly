import { NextRequest, NextResponse } from "next/server";
import { addLead, listLeads } from "@/lib/leads";

export async function GET() {
  return NextResponse.json({ ok: true, count: listLeads().length, leads: listLeads() });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  const business = String(body.business || "").trim();
  const phone = String(body.phone || "").replace(/\s+/g, "");
  const email = body.email ? String(body.email).trim() : undefined;
  const city = body.city ? String(body.city).trim() : undefined;
  const message = body.message ? String(body.message).trim() : undefined;
  const interest = (["pilot", "growth", "trust-api", "demo"].includes(String(body.interest))
    ? body.interest
    : "pilot") as "pilot" | "growth" | "trust-api" | "demo";
  const source = String(body.source || "website").trim();

  if (name.length < 2) {
    return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });
  }
  if (business.length < 2) {
    return NextResponse.json({ ok: false, error: "Business name required" }, { status: 400 });
  }
  const normalized = phone.replace(/^\+91/, "").replace(/\D/g, "");
  if (!/^[6-9]\d{9}$/.test(normalized)) {
    return NextResponse.json(
      { ok: false, error: "Valid 10-digit Indian mobile required" },
      { status: 400 }
    );
  }

  const lead = addLead({
    name,
    business,
    phone: normalized,
    email,
    city,
    interest,
    message,
    source,
  });

  return NextResponse.json(
    {
      ok: true,
      lead,
      nextStep:
        "Call them within 2 hours. Offer: 7-day pilot ₹999 or free WhatsApp→5 invoices demo.",
    },
    { status: 201 }
  );
}
