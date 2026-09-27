import { NextRequest, NextResponse } from "next/server";
import { hashOtp, hashPassword } from "@/lib/auth";
import { spResetPasswordWithOtp } from "@/lib/sp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const login = String(body.email || body.login || body.phone || "").trim();
    const otp = String(body.otp || "").trim();
    const newPassword = String(body.newPassword || body.password || "");

    if (!login || !otp || newPassword.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Login, OTP, and new password (6+) required" },
        { status: 400 }
      );
    }

    const result = await spResetPasswordWithOtp(
      login,
      hashOtp(otp),
      await hashPassword(newPassword)
    );

    return NextResponse.json({ ok: true, userId: result?.user_id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Reset failed";
    console.error("reset", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
