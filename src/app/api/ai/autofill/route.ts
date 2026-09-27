import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { SECURITY_HEADERS } from "@/lib/security";
import { learnedAutofill } from "@/lib/learned-autofill";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: SECURITY_HEADERS });
    }
    const q = req.nextUrl.searchParams.get("q") || "";
    const data = await learnedAutofill(session.ownerId, { q, limit: 8 });
    return NextResponse.json({ ok: true, ...data }, { headers: SECURITY_HEADERS });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status, headers: SECURITY_HEADERS });
    }
    console.error(e);
    return NextResponse.json({ ok: false, error: "Autofill failed" }, { status: 500, headers: SECURITY_HEADERS });
  }
}
