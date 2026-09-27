import { NextRequest, NextResponse } from "next/server";
import {
  setSessionCookie,
  signToken,
  verifyPassword,
} from "@/lib/auth";
import { spGetUserForLogin, spMarkLoginSuccess, toSession } from "@/lib/sp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const login = String(body.email || body.login || "").trim();
    const password = String(body.password || "");
    if (!login || !password) {
      return NextResponse.json(
        { ok: false, error: "Email/phone and password required" },
        { status: 400 }
      );
    }

    const row = await spGetUserForLogin(login);
    if (!row || !row.is_active || !row.owner_active) {
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }

    const session = toSession(row);
    const token = await signToken(session);
    await setSessionCookie(token);
    await spMarkLoginSuccess(session.userId);

    return NextResponse.json({ ok: true, user: session });
  } catch (e) {
    console.error("login", e);
    return NextResponse.json({ ok: false, error: "Login failed" }, { status: 500 });
  }
}
