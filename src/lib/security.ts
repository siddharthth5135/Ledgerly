/**
 * Security helpers for Ledgerly APIs — validation, sanitization, rate limits.
 */

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;

type RateBag = Map<string, { count: number; resetAt: number }>;

const g = globalThis as typeof globalThis & { __ledgerlyRate?: RateBag };

function rateBag(): RateBag {
  if (!g.__ledgerlyRate) g.__ledgerlyRate = new Map();
  return g.__ledgerlyRate;
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "local";
}

/** Sliding window rate limit. Returns true if allowed. */
export function rateLimit(key: string, max = RATE_MAX, windowMs = RATE_WINDOW_MS): boolean {
  const bag = rateBag();
  const now = Date.now();
  const row = bag.get(key);
  if (!row || now > row.resetAt) {
    bag.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (row.count >= max) return false;
  row.count += 1;
  return true;
}

export function resetRateLimitForTests() {
  g.__ledgerlyRate = new Map();
}

/** Strip control chars + limit length. Never trust raw client strings. */
export function sanitizeText(input: unknown, maxLen = 2000): string {
  let s = String(input ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function sanitizePhone(input: unknown): string | undefined {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1))) {
    return digits.slice(1);
  }
  return undefined;
}

/** DB-safe GSTIN: only 15-char Indian format, else undefined (store NULL). */
const GSTIN_FORMAT =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(input: unknown): string | undefined {
  const raw = String(input ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .trim();
  if (!raw) return undefined;
  if (!GSTIN_FORMAT.test(raw)) return undefined;
  return raw;
}

export function phoneKey(phone: string): string {
  return sanitizePhone(phone) || "";
}

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Reject prototype-pollution style payloads; return a plain object copy. */
export function safeJsonObject(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const out: Record<string, unknown> = Object.create(null);
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(k)) continue;
    if (typeof k !== "string" || k.includes("__proto__")) continue;
    out[k] = v;
  }
  return out;
}

export const ALLOWED_UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // 3 MB

export function validateUpload(mime: string, size: number): string | null {
  const m = mime.toLowerCase().split(";")[0].trim();
  if (!ALLOWED_UPLOAD_MIME.has(m) && m !== "image/jpg") {
    return "Unsupported file type. Use JPG, PNG, WEBP, TXT, or DOCX.";
  }
  if (size <= 0 || size > MAX_UPLOAD_BYTES) {
    return "File too large (max 3 MB).";
  }
  return null;
}

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-XSS-Protection": "0",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

export function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
