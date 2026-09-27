import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession, requirePermission } from "@/lib/auth";
import { SECURITY_HEADERS } from "@/lib/security";
import {
  getOwnerGstApiPublic,
  getOwnerGstApiSecrets,
  markGstApiTest,
  saveOwnerGstApi,
  type GstApiEnv,
  type GstApiProvider,
} from "@/lib/owner-gst-api";
import { hasEncryptionKey } from "@/lib/secret-box";
import { testOwnerGstConnection } from "@/lib/nic-gst-client";
import { getBusinessProfile } from "@/lib/business";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" } });
}

/** GET — public status (masked). Never returns passwords. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "settings");
    const profile = await getBusinessProfile(session.ownerId);
    const gstApi = await getOwnerGstApiPublic(session.ownerId);
    return json({
      ok: true,
      gstApi,
      businessGstin: profile.gstin || null,
      encryptionReady: hasEncryptionKey(),
      guide: {
        title: "Connect your GST portal (per business)",
        steps: [
          "Create API user on e-Invoice / e-Way portal (or via your GSP).",
          "Paste Client ID, Client Secret, API username & password below.",
          "Choose Sandbox first, then Production after tests pass.",
          "Click Test connection — we Auth against NIC using YOUR credentials only.",
          "Then open any invoice → Get IRN / Get e-Way (live).",
        ],
        links: {
          einvSandbox: "https://einv-apisandbox.nic.in/",
          einvProd: "https://einvoice1.gst.gov.in/",
          ewbProd: "https://ewaybillgst.gov.in/",
          ewbDocs: "https://docs.ewaybillgst.gov.in/apidocs/index.html",
        },
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, 500);
  }
}

/** PUT — save this business’s API details (encrypted in DB). */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "settings");
    if (!hasEncryptionKey()) {
      return json(
        {
          ok: false,
          error:
            "Server missing CREDENTIALS_ENCRYPTION_KEY (or JWT_SECRET). Ask platform admin to set it once in .env — not your NIC password.",
        },
        503
      );
    }
    const body = await req.json();
    const gstApi = await saveOwnerGstApi(session.ownerId, {
      provider: (body.provider === "gsp" ? "gsp" : "nic_direct") as GstApiProvider,
      gspName: body.gspName ?? null,
      apiEnv: (body.apiEnv === "production" ? "production" : "sandbox") as GstApiEnv,
      gstin: body.gstin ?? null,
      einvEnabled: !!body.einvEnabled,
      einvUsername: body.einvUsername,
      einvPassword: body.einvPassword,
      einvClientId: body.einvClientId,
      einvClientSecret: body.einvClientSecret,
      ewbEnabled: !!body.ewbEnabled,
      ewbUsername: body.ewbUsername,
      ewbPassword: body.ewbPassword,
      ewbClientId: body.ewbClientId,
      ewbClientSecret: body.ewbClientSecret,
      notes: body.notes ?? null,
      clearEmptySecrets: !!body.clearEmptySecrets,
    });
    return json({
      ok: true,
      gstApi,
      message: "Saved. Credentials are encrypted and only used for your business.",
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Save failed" }, 400);
  }
}

/** POST { kind: "einv"|"ewb" } — test Auth with this owner’s secrets */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "settings");
    const body = await req.json().catch(() => ({}));
    const kind = body.kind === "ewb" ? "ewb" : "einv";
    const secrets = await getOwnerGstApiSecrets(session.ownerId);
    if (!secrets) {
      return json({ ok: false, error: "Save GSTIN and API details first." }, 400);
    }
    const result = await testOwnerGstConnection(secrets, kind);
    const gstApi = await markGstApiTest(session.ownerId, kind, result.ok, result.message);
    return json({
      ok: result.ok,
      message: result.message,
      detail: result.detail,
      gstApi,
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Test failed" }, 400);
  }
}
