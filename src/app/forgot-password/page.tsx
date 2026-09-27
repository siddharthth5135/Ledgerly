"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "reset">("request");
  const [login, setLogin] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed");
        return;
      }
      setMsg(data.message);
      if (data.devOtp) setDevOtp(data.devOtp);
      setStep("reset");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Reset failed");
        return;
      }
      router.push("/login");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-8">
        <h1 className="font-display text-2xl font-semibold">Forgot password</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          OTP is sent to the phone registered on your user account.
        </p>

        {step === "request" ? (
          <form onSubmit={requestOtp} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              Email or phone
              <input
                required
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-semibold text-white"
            >
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="mt-6 space-y-4">
            {msg && <p className="text-sm text-green-700">{msg}</p>}
            {devOtp && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Dev OTP: <strong>{devOtp}</strong> (WhatsApp not configured)
              </p>
            )}
            <label className="block text-sm font-medium">
              OTP
              <input
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              New password
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-semibold text-white"
            >
              {loading ? "Saving…" : "Reset password"}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-[var(--brand)]">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
