/**
 * Signed, expiring links for sharing an invoice PDF without a login
 * (WhatsApp / email recipients). Token = base64url(payload).base64url(hmac).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type SharePayload = { inv: string; own: string; exp: number };

const DEFAULT_TTL_DAYS = 90;

function secret(): string {
  const s = process.env.SHARE_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET missing");
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(data: string): string {
  return b64url(createHmac("sha256", secret()).update(data).digest());
}

export function createShareToken(invoiceId: string, ownerId: string, ttlDays = DEFAULT_TTL_DAYS): string {
  const payload: SharePayload = {
    inv: invoiceId,
    own: ownerId,
    exp: Math.floor(Date.now() / 1000) + ttlDays * 86400,
  };
  const data = b64url(JSON.stringify(payload));
  return `${data}.${sign(data)}`;
}

export function verifyShareToken(token: string): SharePayload | null {
  const [data, sig] = String(token || "").split(".");
  if (!data || !sig) return null;
  let expected: string;
  try {
    expected = sign(data);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SharePayload;
    if (!p.inv || !p.own || !p.exp) return null;
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}
