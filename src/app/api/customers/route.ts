import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession, requirePermission } from "@/lib/auth";
import {
  spCustomerInsights,
  spListCustomers,
  spSearchCustomers,
  spUpsertCustomer,
} from "@/lib/sp";
import { sanitizePhone, sanitizeText, SECURITY_HEADERS, normalizeGstin } from "@/lib/security";
import { queryOne } from "@/lib/db";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);

    const sp = req.nextUrl.searchParams;
    const q = sp.get("q") || sp.get("search") || "";
    const autocomplete = sp.get("autocomplete") === "1";

    if (autocomplete) {
      // Commercial autofill (also allowed for staff on quick bill)
      if (!q.trim()) return json({ ok: true, customers: [] });
      const customers = await spSearchCustomers(session.ownerId, q, 12);
      return json({ ok: true, customers, userType: session.userType });
    }

    requirePermission(session, "customers");
    const customers = await spListCustomers(session.ownerId, q || undefined);
    const insights = await spCustomerInsights(
      session.ownerId,
      sp.get("period") || "monthly"
    );

    return json({
      ok: true,
      customers,
      insights,
      userType: session.userType,
      period: sp.get("period") || "monthly",
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: "Failed" }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "customers");

    const body = await req.json();
    const name = sanitizeText(body.name || "", 120);
    if (!name) return json({ ok: false, error: "name required" }, 400);

    const phone = sanitizePhone(body.phone);
    if (session.userType === "regular" && !phone) {
      return json({ ok: false, error: "Phone required for regular clients" }, 400);
    }

    const customer = await spUpsertCustomer({
      ownerId: session.ownerId,
      name,
      phone: phone || undefined,
      gstin: normalizeGstin(body.gstin),
      email: body.email ? String(body.email) : undefined,
      addressLine1: body.addressLine1 ? String(body.addressLine1) : undefined,
      city: body.city ? String(body.city) : undefined,
      state: body.state ? String(body.state) : undefined,
      pincode: body.pincode ? String(body.pincode) : undefined,
      customerKind: body.customerKind || (session.userType === "commercial" ? "b2b" : "retail"),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      notes: body.notes ? String(body.notes) : undefined,
      customerId: body.id || undefined,
    });

    return json({ ok: true, customer }, 201);
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Save failed" }, 500);
  }
}

/** PATCH { id, defaultTemplateId } — bill template this customer always gets */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "customers");
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return json({ ok: false, error: "id required" }, 400);
    const templateId =
      body.defaultTemplateId === null || body.defaultTemplateId === ""
        ? null
        : String(body.defaultTemplateId);
    if (templateId) {
      const ok = await queryOne(
        `SELECT id FROM bill_templates WHERE id = $1 AND owner_id = $2`,
        [templateId, session.ownerId]
      );
      if (!ok) return json({ ok: false, error: "Template not found" }, 404);
    }
    const customer = await queryOne(
      `UPDATE customers SET default_template_id = $3, updated_at = NOW()
        WHERE id = $1 AND owner_id = $2
        RETURNING id, name, default_template_id`,
      [id, session.ownerId, templateId]
    );
    if (!customer) return json({ ok: false, error: "Customer not found" }, 404);
    return json({ ok: true, customer });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    return json({ ok: false, error: "Update failed" }, 400);
  }
}
