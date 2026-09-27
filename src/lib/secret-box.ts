/**
 * AES-256-GCM secret box for per-tenant credentials.
 * Platform secret: CREDENTIALS_ENCRYPTION_KEY (or fallback JWT_SECRET) — never user NIC passwords in .env.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function keyBytes(): Buffer {
  const raw =
    process.env.CREDENTIALS_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "";
  if (!raw || raw.length < 16) {
    throw new Error(
      "Set CREDENTIALS_ENCRYPTION_KEY in .env.local (32+ random chars). Used only to encrypt each business’s GST API passwords in the DB."
    );
  }
  return createHash("sha256").update(raw).digest();
}

/** Encrypt plaintext → "v1.<iv_b64>.<tag_b64>.<data_b64>" */
export function sealSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  if (!sealed.startsWith("v1.")) {
    // legacy / mistaken plaintext — do not return
    return null;
  }
  const [, ivB, tagB, dataB] = sealed.split(".");
  if (!ivB || !tagB || !dataB) return null;
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(dataB, "base64url")),
    decipher.final(),
  ]);
  return out.toString("utf8");
}

export function maskSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  if (plain.length <= 4) return "••••";
  return `${"•".repeat(Math.min(8, plain.length - 4))}${plain.slice(-4)}`;
}

export function hasEncryptionKey(): boolean {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY || process.env.JWT_SECRET || "";
  return raw.length >= 16;
}
