import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { SECURITY_HEADERS } from "@/lib/security";
import { getBusinessProfile, saveBusinessProfile, type BusinessProfile } from "@/lib/business";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    const profile = await getBusinessProfile(session.ownerId);
    return json({ ok: true, profile });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    return json({ ok: false, error: "Failed" }, 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    if (session.role === "staff") return json({ ok: false, error: "Only the owner can change business details" }, 403);
    const body = (await req.json()) as Partial<BusinessProfile>;
    const clean: Partial<BusinessProfile> = {};
    const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);
    if (str(body.name) !== undefined) clean.name = str(body.name)!;
    if (str(body.gstin) !== undefined) clean.gstin = str(body.gstin, 15)!;
    if (str(body.state) !== undefined) clean.state = str(body.state, 40)!;
    if (str(body.stateCode) !== undefined) clean.stateCode = str(body.stateCode, 2)!;
    if (str(body.address, 400) !== undefined) clean.address = str(body.address, 400)!;
    if (str(body.phone) !== undefined) clean.phone = str(body.phone, 20)!;
    if (str(body.email) !== undefined) clean.email = str(body.email, 120)!;
    if (body.bank && typeof body.bank === "object") {
      clean.bank = {
        name: str(body.bank.name) ?? "",
        acNo: str(body.bank.acNo, 30) ?? "",
        ifsc: str(body.bank.ifsc, 11) ?? "",
        branch: str(body.bank.branch) ?? "",
      };
    }
    if (typeof body.defaultGstPercent === "number" && body.defaultGstPercent >= 0 && body.defaultGstPercent <= 40) {
      clean.defaultGstPercent = body.defaultGstPercent;
    }
    if (str(body.logoUrl, 400) !== undefined) clean.logoUrl = str(body.logoUrl, 400)!;
    const profile = await saveBusinessProfile(session.ownerId, clean);
    return json({ ok: true, profile });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    return json({ ok: false, error: e instanceof Error ? e.message : "Save failed" }, 400);
  }
}
