import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { SECURITY_HEADERS } from "@/lib/security";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json(
      { ok: false, user: null },
      { status: 401, headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { ok: true, user },
    {
      status: 200,
      headers: {
        ...SECURITY_HEADERS,
        // Browser can reuse briefly — SiteChrome session provider also caches in memory
        "Cache-Control": "private, max-age=30",
      },
    }
  );
}
