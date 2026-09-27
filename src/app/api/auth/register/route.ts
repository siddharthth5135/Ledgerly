import { NextRequest, NextResponse } from "next/server";
import {
  hashPassword,
  setSessionCookie,
  signToken,
  type UserType,
} from "@/lib/auth";
import { spRegisterOwner, toSession, spGetUserForLogin } from "@/lib/sp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const businessName = String(body.businessName || "").trim();
    const ownerName = String(body.ownerName || body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").replace(/\D/g, "").slice(-10);
    const password = String(body.password || "");
    const userType = (String(body.userType || "regular") as UserType);
    const gstin = body.gstin ? String(body.gstin).trim().toUpperCase() : undefined;
    const city = body.city ? String(body.city).trim() : undefined;
    const state = body.state ? String(body.state).trim() : undefined;

    if (!businessName || !email || phone.length < 10 || password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Business name, email, 10-digit phone, password (6+) required" },
        { status: 400 }
      );
    }
    if (userType !== "commercial" && userType !== "regular") {
      return NextResponse.json({ ok: false, error: "userType must be commercial or regular" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const created = await spRegisterOwner({
      businessName,
      phone,
      email,
      passwordHash,
      ownerName: ownerName || businessName,
      userType,
      gstin,
      city,
      state,
    });
    if (!created) {
      return NextResponse.json({ ok: false, error: "Registration failed" }, { status: 500 });
    }

    const row = await spGetUserForLogin(email);
    if (!row) {
      return NextResponse.json({ ok: false, error: "Registered but login lookup failed" }, { status: 500 });
    }

    const session = toSession(row);
    const token = await signToken(session);
    await setSessionCookie(token);

    return NextResponse.json({ ok: true, user: session });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Register failed";
    console.error("register", e);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return NextResponse.json({ ok: false, error: "Email or phone already registered" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
