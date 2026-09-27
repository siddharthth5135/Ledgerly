import { NextRequest, NextResponse } from "next/server";
import {
  computeFraudScore,
  findExactByGstin,
  findExactByPan,
  isValidGstin,
  isValidPan,
} from "@/lib/suppliers";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const gstin = String(body.gstin || "")
    .trim()
    .toUpperCase();
  const pan = String(body.pan || "")
    .trim()
    .toUpperCase();

  if (!gstin && !pan) {
    return NextResponse.json({ ok: false, error: "GSTIN or PAN required" }, { status: 400 });
  }

  if (gstin) {
    if (gstin.length !== 15 || !isValidGstin(gstin)) {
      return NextResponse.json(
        { ok: false, error: "GSTIN must be valid 15-character format" },
        { status: 400 }
      );
    }
  }

  if (pan && !isValidPan(pan)) {
    return NextResponse.json({ ok: false, error: "PAN format invalid" }, { status: 400 });
  }

  const hit = gstin ? findExactByGstin(gstin) : pan ? findExactByPan(pan) : undefined;

  if (hit) {
    if (pan && hit.pan !== pan) {
      return NextResponse.json(
        { ok: false, error: "PAN does not match GSTIN identity", conflict: true },
        { status: 409 }
      );
    }
    return NextResponse.json({
      ok: true,
      matched: true,
      name: hit.name,
      tradeName: hit.tradeName,
      gstin: hit.gstin,
      pan: hit.pan,
      cin: hit.cin || null,
      trustScore: hit.trustScore,
      fraudScore: hit.fraudScore,
      riskLevel: hit.riskLevel,
      badge: hit.badge,
      status: hit.status,
      city: hit.city,
      state: hit.state,
      flags:
        hit.riskLevel === "critical" || hit.riskLevel === "high"
          ? [
              "Elevated fraud risk — avoid large advances",
              ...(!hit.cin ? ["No CIN on file"] : []),
            ]
          : !hit.cin
            ? ["No CIN on file (may be proprietorship)"]
            : [],
    });
  }

  const scored = computeFraudScore({
    gstin: gstin || undefined,
    pan: pan || undefined,
    hasCin: false,
    inNetwork: false,
  });

  return NextResponse.json({
    ok: true,
    matched: false,
    name: "Unknown entity",
    gstin: gstin || null,
    pan: pan || null,
    cin: null,
    ...scored,
    badge: "none",
    status: "unverified",
  });
}
