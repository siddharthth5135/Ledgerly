/**
 * NIC / GSP e-Invoice + e-Way client — uses per-owner credentials from DB.
 *
 * Auth: NIC expects RSA-OAEP encrypted AppKey + password (public key from portal).
 * Set EINV_PUBLIC_KEY_PEM / EWB_PUBLIC_KEY_PEM in platform .env (NIC public keys — not secrets),
 * or paste PEM in owner notes later. Without the key we still validate config and return
 * a clear next-step error (no fake IRN).
 */
import { createHash, publicEncrypt, randomBytes, constants } from "crypto";
import type { OwnerGstApiSecrets } from "@/lib/owner-gst-api";

const SANDBOX_EINV_BASE = "https://einvapigateway.gstsandbox.nic.in/eivital/v1.04";
const PROD_EINV_BASE = "https://api.einvoice1.gst.gov.in/eivital/v1.04";
// Alternate common gateway paths vary by NIC version — overridable via env
const SANDBOX_EWB_BASE = "https://ewb1api.gstsandbox.nic.in/ewaybillapi/v1.03";
const PROD_EWB_BASE = "https://api.ewaybillgst.gov.in/ewaybillapi/v1.03";

function einvBase(env: string) {
  return process.env.EINV_API_BASE || (env === "production" ? PROD_EINV_BASE : SANDBOX_EINV_BASE);
}
function ewbBase(env: string) {
  return process.env.EWB_API_BASE || (env === "production" ? PROD_EWB_BASE : SANDBOX_EWB_BASE);
}

function loadPublicKeyPem(kind: "einv" | "ewb"): string | null {
  const pem =
    kind === "einv"
      ? process.env.EINV_PUBLIC_KEY_PEM
      : process.env.EWB_PUBLIC_KEY_PEM || process.env.EINV_PUBLIC_KEY_PEM;
  if (!pem) return null;
  return pem.includes("BEGIN") ? pem : `-----BEGIN PUBLIC KEY-----\n${pem}\n-----END PUBLIC KEY-----`;
}

function rsaEncryptB64(pem: string, data: Buffer): string {
  const enc = publicEncrypt(
    {
      key: pem,
      padding: constants.RSA_PKCS1_PADDING,
    },
    data
  );
  return enc.toString("base64");
}

export type NicAuthResult = {
  ok: boolean;
  authtoken?: string;
  sek?: string;
  error?: string;
  raw?: unknown;
};

/**
 * Attempt NIC Auth. Requires platform public key PEM.
 * Returns structured result — never invents tokens.
 */
export async function nicAuthenticate(
  secrets: OwnerGstApiSecrets,
  kind: "einv" | "ewb"
): Promise<NicAuthResult> {
  const cred = kind === "einv" ? secrets.einv : secrets.ewb;
  if (!cred.username || !cred.password || !cred.clientId || !cred.clientSecret) {
    return {
      ok: false,
      error:
        "Missing API username / password / Client ID / Client Secret. Save them under Settings → GST API.",
    };
  }
  const pem = loadPublicKeyPem(kind);
  if (!pem) {
    return {
      ok: false,
      error:
        "Platform missing NIC public key. Add EINV_PUBLIC_KEY_PEM to server .env (download from einv-apisandbox.nic.in developer portal — this is a public key, not your password).",
    };
  }

  const appKey = randomBytes(32);
  let dataEncrypted: string;
  try {
    // Payload commonly: { userName, password, appKey(base64), forceRefreshAccessToken }
    const payload = Buffer.from(
      JSON.stringify({
        UserName: cred.username,
        Password: cred.password,
        AppKey: appKey.toString("base64"),
        ForceRefreshAccessToken: true,
      }),
      "utf8"
    );
    dataEncrypted = rsaEncryptB64(pem, payload);
  } catch (e) {
    return {
      ok: false,
      error: `Could not encrypt auth payload with NIC public key: ${e instanceof Error ? e.message : "error"}`,
    };
  }

  const base = kind === "einv" ? einvBase(secrets.apiEnv) : ewbBase(secrets.apiEnv);
  const url = `${base}/auth`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        client_id: cred.clientId,
        client_secret: cred.clientSecret,
        gstin: secrets.gstin,
      },
      body: JSON.stringify({ Data: dataEncrypted }),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: `Auth HTTP ${res.status}: ${text.slice(0, 200)}`, raw: text };
    }
    const status = String(json.Status ?? json.status ?? "");
    const err =
      (Array.isArray(json.ErrorDetails) && JSON.stringify(json.ErrorDetails)) ||
      (json.error as string) ||
      (json.message as string);
    if (!res.ok || status === "0" || status === "FAILED") {
      return { ok: false, error: err || `Auth failed HTTP ${res.status}`, raw: json };
    }
    const data = (json.Data || json.data) as Record<string, unknown> | string | undefined;
    let authtoken: string | undefined;
    let sek: string | undefined;
    if (data && typeof data === "object") {
      authtoken = String(data.AuthToken || data.authtoken || "");
      sek = String(data.Sek || data.sek || "");
    }
    if (!authtoken) {
      return {
        ok: false,
        error:
          "Auth response had no AuthToken. Check username/password/GSTIN/env (sandbox vs production) and Client ID.",
        raw: json,
      };
    }
    return { ok: true, authtoken, sek, raw: json };
  } catch (e) {
    return {
      ok: false,
      error: `Network error calling NIC auth: ${e instanceof Error ? e.message : "failed"}`,
    };
  }
}

export async function testOwnerGstConnection(
  secrets: OwnerGstApiSecrets,
  kind: "einv" | "ewb"
): Promise<{ ok: boolean; message: string; detail?: unknown }> {
  const cred = kind === "einv" ? secrets.einv : secrets.ewb;
  if (!cred.enabled) {
    return { ok: false, message: `Enable ${kind === "einv" ? "e-Invoice" : "e-Way"} in Settings first.` };
  }
  if (!secrets.gstin || secrets.gstin.length !== 15) {
    return { ok: false, message: "GSTIN must be 15 characters." };
  }
  if (!cred.username || !cred.password) {
    return { ok: false, message: "API username and password are required." };
  }
  if (!cred.clientId || !cred.clientSecret) {
    return {
      ok: false,
      message: "Client ID and Client Secret are required (from NIC sandbox register / GSP).",
    };
  }

  const auth = await nicAuthenticate(secrets, kind);
  if (!auth.ok) {
    // Soft-pass config validation when only public key is missing — still not a fake success
    if (auth.error?.includes("EINV_PUBLIC_KEY_PEM")) {
      return {
        ok: false,
        message: auth.error,
        detail: {
          configOk: true,
          next: "Platform admin adds NIC public key PEM once; then Test Connection calls real Auth.",
        },
      };
    }
    return { ok: false, message: auth.error || "Auth failed", detail: auth.raw };
  }
  return {
    ok: true,
    message: `${kind === "einv" ? "e-Invoice" : "e-Way"} Auth OK (${secrets.apiEnv}). Token received.`,
    detail: { hasToken: true },
  };
}

export type IrnSubmitResult = {
  ok: boolean;
  irn?: string;
  ackNo?: string;
  ackDate?: string;
  signedQr?: string;
  error?: string;
  raw?: unknown;
};

/**
 * Submit e-Invoice payload to NIC GenerateIRN.
 * `payload` = already-built NIC document (from buildEinvoicePayload).
 */
export async function submitEinvoiceIrn(
  secrets: OwnerGstApiSecrets,
  payload: unknown
): Promise<IrnSubmitResult> {
  if (!secrets.einv.enabled) {
    return { ok: false, error: "e-Invoice not enabled for this business." };
  }
  const auth = await nicAuthenticate(secrets, "einv");
  if (!auth.ok || !auth.authtoken) {
    return { ok: false, error: auth.error || "Auth failed", raw: auth.raw };
  }

  const base = einvBase(secrets.apiEnv);
  // Common path; override with EINV_IRN_PATH if GSP differs
  const url = `${process.env.EINV_IRN_PATH || base.replace("/eivital/", "/eicore/")}/Invoice`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        client_id: secrets.einv.clientId,
        client_secret: secrets.einv.clientSecret,
        gstin: secrets.gstin,
        user_name: secrets.einv.username,
        AuthToken: auth.authtoken,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: `IRN HTTP ${res.status}: ${text.slice(0, 240)}`, raw: text };
    }
    const data = (json.Data || json.data) as Record<string, unknown> | undefined;
    const irn = data ? String(data.Irn || data.IRN || "") : "";
    if (!irn) {
      const err =
        (Array.isArray(json.ErrorDetails) && JSON.stringify(json.ErrorDetails)) ||
        String(json.message || json.error || `No IRN in response (HTTP ${res.status})`);
      return { ok: false, error: err, raw: json };
    }
    return {
      ok: true,
      irn,
      ackNo: data ? String(data.AckNo || data.ackNo || "") : undefined,
      ackDate: data ? String(data.AckDt || data.ackDate || "") : undefined,
      signedQr: data ? String(data.SignedQRCode || data.QRCode || "") : undefined,
      raw: json,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "IRN submit failed" };
  }
}

export type EwbSubmitResult = {
  ok: boolean;
  ewbNumber?: string;
  validUpto?: string;
  error?: string;
  raw?: unknown;
};

export async function submitEwayBill(
  secrets: OwnerGstApiSecrets,
  payload: unknown
): Promise<EwbSubmitResult> {
  if (!secrets.ewb.enabled) {
    return { ok: false, error: "e-Way not enabled for this business." };
  }
  const auth = await nicAuthenticate(secrets, "ewb");
  if (!auth.ok || !auth.authtoken) {
    return { ok: false, error: auth.error || "Auth failed", raw: auth.raw };
  }
  const base = ewbBase(secrets.apiEnv);
  const url = `${base}/ewayapi`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        client_id: secrets.ewb.clientId,
        client_secret: secrets.ewb.clientSecret,
        gstin: secrets.gstin,
        username: secrets.ewb.username,
        authtoken: auth.authtoken,
      },
      body: JSON.stringify({ action: "GENEWAYBILL", data: payload }),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: `EWB HTTP ${res.status}: ${text.slice(0, 240)}`, raw: text };
    }
    const data = (json.Data || json.data || json) as Record<string, unknown>;
    const ewb = String(data.ewayBillNo || data.EwbNo || data.ewbNumber || "");
    if (!ewb) {
      return {
        ok: false,
        error:
          (Array.isArray(json.ErrorDetails) && JSON.stringify(json.ErrorDetails)) ||
          String(json.message || json.error || "No e-Way number in response"),
        raw: json,
      };
    }
    return {
      ok: true,
      ewbNumber: ewb,
      validUpto: String(data.validUpto || data.ValidUpto || ""),
      raw: json,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "e-Way submit failed" };
  }
}

/** Fingerprint for logs without leaking secrets */
export function credFingerprint(secrets: OwnerGstApiSecrets) {
  return createHash("sha256")
    .update(`${secrets.gstin}:${secrets.einv.username}:${secrets.apiEnv}`)
    .digest("hex")
    .slice(0, 12);
}
