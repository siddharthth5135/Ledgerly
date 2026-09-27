import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession, requirePermission } from "@/lib/auth";
import { spDashboard, spListInvoices } from "@/lib/sp";
import { SECURITY_HEADERS } from "@/lib/security";
import { buildGrowthTips } from "@/lib/growth-tips";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "Cache-Control": "private, max-age=12",
    },
  });
}

function num(v: unknown) {
  return Number(v || 0);
}

function parseMaybeJson(v: unknown) {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "dashboard");

    const period = req.nextUrl.searchParams.get("period") || "monthly";
    const overview = (await spDashboard(session.ownerId, period)) as Record<string, unknown> | null;
    const recent = await spListInvoices(session.ownerId, {
      period,
      limit: 8,
    });

    if (overview) {
      for (const k of ["top_customers", "daily_trend", "status_breakdown", "ageing", "quiet_regulars", "late_payers"]) {
        overview[k] = parseMaybeJson(overview[k]);
      }
    }

    const tips = buildGrowthTips(
      overview
        ? {
            business_total: num(overview.business_total),
            received_amount: num(overview.received_amount),
            outstanding_amount: num(overview.outstanding_amount),
            collection_pct: num(overview.collection_pct),
            overdue_count: num(overview.overdue_count),
            invoice_count: num(overview.invoice_count),
            avg_invoice_value: num(overview.avg_invoice_value),
            new_customers: num(overview.new_customers),
            customer_count: num(overview.customer_count),
            prior_business_total: num(overview.prior_business_total),
            prior_invoice_count: num(overview.prior_invoice_count),
            gst_total: num(overview.gst_total),
            ageing: overview.ageing as never,
            quiet_regulars: overview.quiet_regulars as never,
            late_payers: overview.late_payers as never,
          }
        : null
    );

    return json({
      ok: true,
      period,
      overview,
      recent,
      tips,
      userType: session.userType,
      businessName: session.businessName,
    }, 200);
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: "Dashboard failed" }, 500);
  }
}
