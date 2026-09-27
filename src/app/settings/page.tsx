"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/SiteChrome";
import type { BusinessProfile } from "@/lib/business-profile";
import { GstApiSettingsPanel } from "@/components/GstApiSettingsPanel";

export default function SettingsPage() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [staff, setStaff] = useState({ name: "", email: "", phone: "", password: "Staff@123" });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gstMonth, setGstMonth] = useState(new Date().getMonth() + 1);
  const [gstYear, setGstYear] = useState(new Date().getFullYear());
  const [gstinCheck, setGstinCheck] = useState("");
  const [gstinResult, setGstinResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/business")
      .then((r) => r.json())
      .then((d) => d.ok && setProfile(d.profile))
      .catch(() => {});
  }, []);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      setProfile(data.profile);
      setMsg("Business profile saved — applies to every bill.");
    } finally {
      setBusy(false);
    }
  }

  async function onStaff(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    const res = await fetch("/api/auth/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(staff),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setMsg(`Staff created: ${staff.email}`);
    setStaff({ name: "", email: "", phone: "", password: "Staff@123" });
  }

  async function uploadLogo(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("logo", file);
      const res = await fetch("/api/business/logo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      setProfile(data.profile);
      setMsg("Logo uploaded — enable banner on Smart invoice if needed.");
    } finally {
      setBusy(false);
    }
  }

  async function exportGstr1() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/gst?gstr1=1&month=${gstMonth}&year=${gstYear}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Export failed");
        return;
      }
      const blob = new Blob([JSON.stringify(data.gstr1, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = data.fileName || "GSTR1.json";
      a.click();
      setMsg("GSTR-1 JSON downloaded — verify with your CA before portal upload.");
    } finally {
      setBusy(false);
    }
  }

  async function checkGstin() {
    setGstinResult(null);
    const res = await fetch(`/api/gst?gstin=${encodeURIComponent(gstinCheck.trim())}`);
    const data = await res.json();
    if (!data.ok) {
      setGstinResult(data.error || "Failed");
      return;
    }
    setGstinResult(
      data.validChecksum
        ? `Valid checksum ✓${data.legalName ? ` — ${data.legalName}` : ""} (${data.source})`
        : data.error || "Invalid GSTIN"
    );
  }

  return (
    <AppShell title="Settings" subtitle="Business profile, logo, GST compliance and staff access.">
      {(msg || error) && (
        <p className={`mb-4 text-sm ${error ? "text-[var(--danger)]" : "text-[var(--ok)]"}`}>{error || msg}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="surface-card space-y-3 p-5">
          <h2 className="font-display text-lg font-semibold">Business profile</h2>
          <p className="text-xs text-[var(--muted)]">Printed on every bill — not taken from uploaded samples.</p>
          {profile &&
            (
              [
                ["name", "Business name"],
                ["gstin", "GSTIN"],
                ["state", "State"],
                ["stateCode", "State code"],
                ["address", "Address"],
                ["phone", "Phone"],
                ["email", "Email"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="block text-sm">
                <span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
                <input
                  value={String(profile[k] || "")}
                  onChange={(e) => setProfile({ ...profile, [k]: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2"
                />
              </label>
            ))}
          <label className="block text-sm">
            <span className="text-xs font-semibold text-[var(--muted)]">Default GST %</span>
            <input
              type="number"
              min={0}
              max={40}
              step={0.5}
              value={profile?.defaultGstPercent ?? 18}
              onChange={(e) => profile && setProfile({ ...profile, defaultGstPercent: Number(e.target.value) || 0 })}
              className="mt-1 w-32 rounded-xl border border-[var(--line)] px-3 py-2"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {profile?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logoUrl} alt="Logo" className="h-12 object-contain" />
            )}
            <label className="cursor-pointer rounded-full border border-[var(--line)] px-4 py-2 text-xs font-semibold">
              Upload logo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => uploadLogo(e.target.files?.[0] || null)}
              />
            </label>
            <button type="submit" disabled={busy} className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Save profile
            </button>
          </div>
        </form>

        <div id="gst" className="space-y-6">
          <section className="surface-card space-y-3 p-5">
            <h2 className="font-display text-lg font-semibold">GST compliance</h2>
            <p className="text-xs text-[var(--muted)]">
              GSTR-1 JSON for your filing window. Connect e-Invoice / e-Way below — each business uses their own portal login.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="text-xs text-[var(--muted)]">Month</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={gstMonth}
                  onChange={(e) => setGstMonth(Number(e.target.value))}
                  className="mt-1 block w-20 rounded-xl border border-[var(--line)] px-2 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="text-xs text-[var(--muted)]">Year</span>
                <input
                  type="number"
                  value={gstYear}
                  onChange={(e) => setGstYear(Number(e.target.value))}
                  className="mt-1 block w-28 rounded-xl border border-[var(--line)] px-2 py-2"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={exportGstr1}
                className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Download GSTR-1 JSON
              </button>
            </div>
            <div className="border-t border-[var(--line)] pt-3">
              <p className="text-xs font-semibold text-[var(--muted)]">Validate any GSTIN</p>
              <div className="mt-2 flex gap-2">
                <input
                  value={gstinCheck}
                  onChange={(e) => setGstinCheck(e.target.value.toUpperCase())}
                  placeholder="22AAAAA0000A1Z5"
                  className="flex-1 rounded-xl border border-[var(--line)] px-3 py-2 font-mono text-sm"
                />
                <button type="button" onClick={checkGstin} className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold">
                  Check
                </button>
              </div>
              {gstinResult && <p className="mt-2 text-xs">{gstinResult}</p>}
            </div>
          </section>

          <form onSubmit={onStaff} className="surface-card space-y-3 p-5">
            <h2 className="font-display text-lg font-semibold">Add staff</h2>
            <p className="text-xs text-[var(--muted)]">Staff can only use Invoices & Quick bill.</p>
            {(["name", "email", "phone", "password"] as const).map((k) => (
              <input
                key={k}
                required={k !== "phone"}
                type={k === "password" ? "password" : k === "email" ? "email" : "text"}
                placeholder={k}
                value={staff[k]}
                onChange={(e) => setStaff({ ...staff, [k]: e.target.value })}
                className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
              />
            ))}
            <button type="submit" className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white">
              Create staff login
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6">
        <GstApiSettingsPanel businessGstin={profile?.gstin} />
      </div>
    </AppShell>
  );
}
