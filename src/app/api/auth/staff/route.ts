import { NextRequest, NextResponse } from "next/server";
import { hashPassword, requireSession, requirePermission } from "@/lib/auth";
import { spCreateStaff } from "@/lib/sp";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requirePermission(session, "settings");
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Only owner can add staff" }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").replace(/\D/g, "").slice(-10);
    const password = String(body.password || "Staff@123");

    if (!name || !email || phone.length < 10) {
      return NextResponse.json({ ok: false, error: "Name, email, phone required" }, { status: 400 });
    }

    const row = await spCreateStaff({
      ownerId: session.ownerId,
      createdBy: session.userId,
      name,
      email,
      phone,
      passwordHash: await hashPassword(password),
    });

    return NextResponse.json({ ok: true, staff: row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status = msg === "Unauthorized" ? 401 : msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
