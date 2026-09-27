import { NextResponse } from "next/server";
import { listOffers } from "@/lib/loyalty";
import { SECURITY_HEADERS } from "@/lib/security";

export async function GET() {
  return NextResponse.json(
    { ok: true, offers: listOffers() },
    { headers: SECURITY_HEADERS }
  );
}
