"use client";

import { FormEvent, useEffect, useState } from "react";

type GstApiPublic = {
  provider: string;
  gspName: string | null;
  apiEnv: string;
  gstin: string | null;
  einvEnabled: boolean;
  einvUsernameMasked: string | null;
  einvHasPassword: boolean;
  einvHasClientId: boolean;
  einvHasClientSecret: boolean;
  einvLastOkAt: string | null;
  einvLastError: string | null;
  ewbEnabled: boolean;
  ewbUsernameMasked: string | null;
  ewbHasPassword: boolean;
  ewbLastOkAt: string | null;
  ewbLastError: string | null;
  setupStep: string;
  einvReady: boolean;
  ewbReady: boolean;
  encryptionReady: boolean;
};

const emptyForm = {
  provider: "nic_direct",
  gspName: "",
  apiEnv: "sandbox",
  gstin: "",
  einvEnabled: true,
  einvUsername: "",
  einvPassword: "",
  einvClientId: "",
  einvClientSecret: "",
  ewbEnabled: true,
  ewbUsername: "",
  ewbPassword: "",
  ewbClientId: "",
  ewbClientSecret: "",
  sameAsEinv: true,
};

export function GstApiSettingsPanel({ businessGstin }: { businessGstin?: string | null }) {
  const [gstApi, setGstApi] = useState<GstApiPublic | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<{ steps: string[]; links: Record<string, string> } | null>(null);

  async function load() {
    const res = await fetch("/api/settings/gst-api", { cache: "no-store" });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error || "Could not load GST API settings");
      return;
    }
    setGstApi(data.gstApi);
    setGuide(data.guide || null);
    setForm((f) => ({
      ...f,
      provider: data.gstApi.provider || "nic_direct",
      gspName: data.gstApi.gspName || "",
      apiEnv: data.gstApi.apiEnv || "sandbox",
      gstin: data.gstApi.gstin || data.businessGstin || businessGstin || "",
      einvEnabled: data.gstApi.einvEnabled ?? true,
      ewbEnabled: data.gstApi.ewbEnabled ?? true,
      // never prefill secrets
      einvUsername: "",
      einvPassword: "",
      einvClientId: "",
      einvClientSecret: "",
      ewbUsername: "",
      ewbPassword: "",
      ewbClientId: "",
      ewbClientSecret: "",
    }));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        provider: form.provider,
        gspName: form.provider === "gsp" ? form.gspName : null,
        apiEnv: form.apiEnv,
        gstin: form.gstin,
        einvEnabled: form.einvEnabled,
        ewbEnabled: form.ewbEnabled,
      };
      if (form.einvUsername.trim()) body.einvUsername = form.einvUsername.trim();
      if (form.einvPassword.trim()) body.einvPassword = form.einvPassword;
      if (form.einvClientId.trim()) body.einvClientId = form.einvClientId.trim();
      if (form.einvClientSecret.trim()) body.einvClientSecret = form.einvClientSecret;
      if (form.sameAsEinv) {
        body.ewbUsername = form.einvUsername.trim() || undefined;
        body.ewbPassword = form.einvPassword || undefined;
        body.ewbClientId = form.einvClientId.trim() || undefined;
        body.ewbClientSecret = form.einvClientSecret || undefined;
      } else {
        if (form.ewbUsername.trim()) body.ewbUsername = form.ewbUsername.trim();
        if (form.ewbPassword.trim()) body.ewbPassword = form.ewbPassword;
        if (form.ewbClientId.trim()) body.ewbClientId = form.ewbClientId.trim();
        if (form.ewbClientSecret.trim()) body.ewbClientSecret = form.ewbClientSecret;
      }
      const res = await fetch("/api/settings/gst-api", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Save failed");
        return;
      }
      setGstApi(data.gstApi);
      setMsg(data.message || "Saved");
      setForm((f) => ({
        ...f,
        einvPassword: "",
        einvClientSecret: "",
        ewbPassword: "",
        ewbClientSecret: "",
      }));
    } finally {
      setBusy(false);
    }
  }

  async function test(kind: "einv" | "ewb") {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/gst-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (data.gstApi) setGstApi(data.gstApi);
      if (data.ok) setMsg(data.message);
      else setError(data.message || data.error || "Test failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="gst-api" className="surface-card space-y-4 p-5 lg:col-span-2">
      <div>
        <h2 className="font-display text-lg font-semibold">GST API (e-Invoice & e-Way)</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Each business On Quill connects <strong>their own</strong> portal / GSP login here.
          We store it encrypted for your account only — not a shared server password.
        </p>
      </div>

      {gstApi && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-3 py-1 font-semibold ${gstApi.einvReady ? "bg-[var(--ok)]/15 text-[var(--ok)]" : "bg-[var(--bg)] text-[var(--muted)]"}`}>
            e-Invoice {gstApi.einvReady ? "ready" : "not connected"}
          </span>
          <span className={`rounded-full px-3 py-1 font-semibold ${gstApi.ewbReady ? "bg-[var(--ok)]/15 text-[var(--ok)]" : "bg-[var(--bg)] text-[var(--muted)]"}`}>
            e-Way {gstApi.ewbReady ? "ready" : "not connected"}
          </span>
          <span className="rounded-full bg-[var(--bg)] px-3 py-1 capitalize text-[var(--muted)]">
            Step: {gstApi.setupStep.replace(/_/g, " ")} · {gstApi.apiEnv}
          </span>
        </div>
      )}

      {guide && (
        <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--muted)]">
          {guide.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      {guide?.links && (
        <p className="flex flex-wrap gap-3 text-xs">
          <a className="text-[var(--brand)] underline" href={guide.links.einvSandbox} target="_blank" rel="noreferrer">
            e-Invoice sandbox
          </a>
          <a className="text-[var(--brand)] underline" href={guide.links.einvProd} target="_blank" rel="noreferrer">
            e-Invoice portal
          </a>
          <a className="text-[var(--brand)] underline" href={guide.links.ewbProd} target="_blank" rel="noreferrer">
            e-Way portal
          </a>
        </p>
      )}

      {!gstApi?.encryptionReady && (
        <p className="rounded-xl bg-[var(--warn-soft)] px-3 py-2 text-xs text-[var(--warn)]">
          Platform needs <code>CREDENTIALS_ENCRYPTION_KEY</code> in server .env (one key for the whole app). Ask admin — not your NIC password.
        </p>
      )}

      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="text-xs font-semibold text-[var(--muted)]">API GSTIN</span>
          <input
            required
            value={form.gstin}
            onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
            className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 font-mono text-sm"
            placeholder="22AAAAA0000A1Z5"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-[var(--muted)]">Environment</span>
          <select
            value={form.apiEnv}
            onChange={(e) => setForm({ ...form, apiEnv: e.target.value })}
            className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          >
            <option value="sandbox">Sandbox (test first)</option>
            <option value="production">Production (live)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-[var(--muted)]">Connect via</span>
          <select
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
            className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          >
            <option value="nic_direct">NIC direct</option>
            <option value="gsp">Through GSP</option>
          </select>
        </label>
        {form.provider === "gsp" && (
          <label className="text-sm sm:col-span-2">
            <span className="text-xs font-semibold text-[var(--muted)]">GSP name</span>
            <input
              value={form.gspName}
              onChange={(e) => setForm({ ...form, gspName: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
              placeholder="ClearTax / MasterGST / …"
            />
          </label>
        )}

        <p className="sm:col-span-2 text-sm font-semibold">e-Invoice API user</p>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.einvEnabled}
            onChange={(e) => setForm({ ...form, einvEnabled: e.target.checked })}
          />
          Enable e-Invoice (IRN)
        </label>
        <input
          placeholder={gstApi?.einvUsernameMasked ? `Username (saved ${gstApi.einvUsernameMasked})` : "API username"}
          value={form.einvUsername}
          onChange={(e) => setForm({ ...form, einvUsername: e.target.value })}
          className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
        />
        <input
          type="password"
          placeholder={gstApi?.einvHasPassword ? "Password (leave blank to keep)" : "API password"}
          value={form.einvPassword}
          onChange={(e) => setForm({ ...form, einvPassword: e.target.value })}
          className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          autoComplete="new-password"
        />
        <input
          placeholder={gstApi?.einvHasClientId ? "Client ID (leave blank to keep)" : "Client ID"}
          value={form.einvClientId}
          onChange={(e) => setForm({ ...form, einvClientId: e.target.value })}
          className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
        />
        <input
          type="password"
          placeholder={gstApi?.einvHasClientSecret ? "Client Secret (leave blank to keep)" : "Client Secret"}
          value={form.einvClientSecret}
          onChange={(e) => setForm({ ...form, einvClientSecret: e.target.value })}
          className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          autoComplete="new-password"
        />

        <p className="sm:col-span-2 text-sm font-semibold">e-Way API user</p>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.ewbEnabled}
            onChange={(e) => setForm({ ...form, ewbEnabled: e.target.checked })}
          />
          Enable e-Way Bill
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.sameAsEinv}
            onChange={(e) => setForm({ ...form, sameAsEinv: e.target.checked })}
          />
          Same credentials as e-Invoice (common)
        </label>
        {!form.sameAsEinv && (
          <>
            <input
              placeholder="e-Way username"
              value={form.ewbUsername}
              onChange={(e) => setForm({ ...form, ewbUsername: e.target.value })}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
            <input
              type="password"
              placeholder="e-Way password"
              value={form.ewbPassword}
              onChange={(e) => setForm({ ...form, ewbPassword: e.target.value })}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
            <input
              placeholder="e-Way Client ID"
              value={form.ewbClientId}
              onChange={(e) => setForm({ ...form, ewbClientId: e.target.value })}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
            <input
              type="password"
              placeholder="e-Way Client Secret"
              value={form.ewbClientSecret}
              onChange={(e) => setForm({ ...form, ewbClientSecret: e.target.value })}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
          </>
        )}

        <div className="flex flex-wrap gap-2 sm:col-span-2 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save GST API
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => test("einv")}
            className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Test e-Invoice Auth
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => test("ewb")}
            className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Test e-Way Auth
          </button>
        </div>
      </form>

      {(msg || error) && (
        <p className={`text-sm ${error ? "text-[var(--danger)]" : "text-[var(--ok)]"}`}>{error || msg}</p>
      )}
      {gstApi?.einvLastError && (
        <p className="text-xs text-[var(--danger)]">Last e-Invoice error: {gstApi.einvLastError}</p>
      )}
      {gstApi?.ewbLastError && (
        <p className="text-xs text-[var(--danger)]">Last e-Way error: {gstApi.ewbLastError}</p>
      )}
    </section>
  );
}
