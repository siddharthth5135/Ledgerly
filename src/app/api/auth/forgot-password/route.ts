import { NextRequest, NextResponse } from "next/server";
import { generateOtp, hashOtp } from "@/lib/auth";
import { spRequestPasswordOtp } from "@/lib/sp";

/**
 * Forgot password: generates OTP, stores hash, "sends" to registered phone.
 * Without WHATSAPP_TOKEN, returns OTP in response when AUTH_DEV_RETURN_OTP=true
 * (local/demo). Production: wire WhatsApp Business API using returned phone.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const login = String(body.email || body.login || body.phone || "").trim();
    if (!login) {
      return NextResponse.json({ ok: false, error: "Email or phone required" }, { status: 400 });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const row = await spRequestPasswordOtp(login, otpHash);
    if (!row) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // Placeholder WhatsApp send
    const waToken = process.env.WHATSAPP_TOKEN;
    if (waToken) {
      // Integrate Meta WhatsApp Cloud API here with row.phone + otp
      console.log(`[whatsapp] OTP to ${row.phone}`);
    } else {
      console.log(`[dev-otp] phone=${row.phone} otp=${otp}`);
    }

    const payload: Record<string, unknown> = {
      ok: true,
      message: `OTP sent to phone ending …${String(row.phone).slice(-4)}`,
      expiresAt: row.expires_at,
    };
    if (process.env.AUTH_DEV_RETURN_OTP === "true" && !waToken) {
      payload.devOtp = otp;
    }
    return NextResponse.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "OTP request failed";
    console.error("forgot", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
