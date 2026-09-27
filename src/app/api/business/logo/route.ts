import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { SECURITY_HEADERS } from "@/lib/security";
import { saveBusinessProfile, getBusinessProfile } from "@/lib/business";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

/** Upload business logo → saved under public/uploads/logos/{ownerId}/ */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    if (session.role === "staff") return json({ ok: false, error: "Only owner can upload logo" }, 403);

    const form = await req.formData();
    const file = form.get("logo") as File | null;
    if (!file || file.size === 0) return json({ ok: false, error: "logo file required" }, 400);
    if (file.size > 2_000_000) return json({ ok: false, error: "Logo must be under 2MB" }, 400);
    const mime = file.type || "";
    if (!mime.startsWith("image/")) return json({ ok: false, error: "Upload a PNG or JPG logo" }, 400);

    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const dir = path.join(process.cwd(), "public", "uploads", "logos", session.ownerId);
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, name), buf);
    const logoUrl = `/uploads/logos/${session.ownerId}/${name}`;
    const profile = await saveBusinessProfile(session.ownerId, { logoUrl });
    return json({ ok: true, logoUrl, profile });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: "Logo upload failed" }, 500);
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    const profile = await saveBusinessProfile(session.ownerId, { logoUrl: "" });
    return json({ ok: true, profile });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    return json({ ok: false, error: "Failed" }, 500);
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
  const profile = await getBusinessProfile(session.ownerId);
  return json({ ok: true, logoUrl: profile.logoUrl || null });
}
