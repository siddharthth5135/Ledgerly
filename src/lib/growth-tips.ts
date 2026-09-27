/**
 * Growth tips — deterministic, research-backed heuristics from the owner's own data.
 * No LLM. Each tip cites the metric so the user trusts it.
 */
export type Tip = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
};

type OverviewLike = {
  business_total?: number;
  received_amount?: number;
  outstanding_amount?: number;
  collection_pct?: number;
  overdue_count?: number;
  invoice_count?: number;
  avg_invoice_value?: number;
  new_customers?: number;
  customer_count?: number;
  prior_business_total?: number;
  prior_invoice_count?: number;
  gst_total?: number;
  ageing?: Array<{ bucket: string; bills: number; amount: number }> | null;
  quiet_regulars?: Array<{ customer_name: string; last_bill: string; lifetime_amount: number }> | null;
  late_payers?: Array<{ customer_name: string; overdue_amount: number; max_days_late: number }> | null;
};

function n(v: unknown) {
  return Number(v || 0);
}

export function buildGrowthTips(o: OverviewLike | null | undefined): Tip[] {
  if (!o) return [];
  const tips: Tip[] = [];
  const business = n(o.business_total);
  const received = n(o.received_amount);
  const outstanding = n(o.outstanding_amount);
  const collection = n(o.collection_pct);
  const overdue = n(o.overdue_count);
  const invoices = n(o.invoice_count);
  const priorBiz = n(o.prior_business_total);
  const priorInv = n(o.prior_invoice_count);
  const ageing = o.ageing || [];
  const quiet = o.quiet_regulars || [];
  const late = o.late_payers || [];

  const aged90 = ageing.find((a) => a.bucket === "90+");
  if (aged90 && n(aged90.amount) > 0) {
    tips.push({
      id: "ageing-90",
      severity: "high",
      title: `₹${Math.round(n(aged90.amount)).toLocaleString("en-IN")} stuck over 90 days`,
      body: `${aged90.bills} bill(s) are critically overdue. Beyond 90 days recovery rates drop sharply — call or visit these buyers this week, then follow with a firm WhatsApp.`,
      actionLabel: "Open collections",
      actionHref: "/collections",
    });
  }

  if (collection > 0 && collection < 70 && outstanding > 0) {
    tips.push({
      id: "collection-low",
      severity: "high",
      title: `Only ${collection}% of billed money is collected`,
      body: `Healthy trading businesses typically keep collection above 85%. You have ₹${Math.round(outstanding).toLocaleString("en-IN")} outstanding — schedule reminders for every overdue bill today.`,
      actionLabel: "Send reminders",
      actionHref: "/collections",
    });
  } else if (collection >= 90 && business > 0) {
    tips.push({
      id: "collection-strong",
      severity: "low",
      title: "Collection discipline is strong",
      body: `You’re collecting ${collection}% of what you bill. Keep due dates short (7–15 days) and confirm “money received” the day cash hits — this is how you stay ahead of cash crunches.`,
      actionLabel: "View invoices",
      actionHref: "/invoices",
    });
  }

  if (late[0] && n(late[0].overdue_amount) > 0) {
    tips.push({
      id: "late-payer",
      severity: "high",
      title: `${late[0].customer_name} is your riskiest payer`,
      body: `₹${Math.round(n(late[0].overdue_amount)).toLocaleString("en-IN")} overdue, up to ${late[0].max_days_late} days late. Offer a small early-payment discount next bill, or move them to advance / COD.`,
      actionLabel: "Draft firm reminder",
      actionHref: "/collections",
    });
  }

  if (quiet[0]) {
    tips.push({
      id: "quiet-regular",
      severity: "medium",
      title: `${quiet[0].customer_name} hasn’t ordered in 14+ days`,
      body: `They’ve bought ₹${Math.round(n(quiet[0].lifetime_amount)).toLocaleString("en-IN")} from you before. A short “stock check / new rates” WhatsApp often reactivates quiet regulars — cheaper than finding a new customer.`,
      actionLabel: "Message from Grow",
      actionHref: "/grow",
    });
  }

  if (priorBiz > 0) {
    const growth = ((business - priorBiz) / priorBiz) * 100;
    if (growth <= -15) {
      tips.push({
        id: "revenue-down",
        severity: "medium",
        title: `Revenue is ${Math.abs(Math.round(growth))}% below last period`,
        body: `Billed ₹${Math.round(business).toLocaleString("en-IN")} vs ₹${Math.round(priorBiz).toLocaleString("en-IN")} previously (${priorInv} → ${invoices} invoices). Push a limited offer to top customers and clear pending quotations today.`,
        actionLabel: "See top customers",
        actionHref: "/customers",
      });
    } else if (growth >= 20) {
      tips.push({
        id: "revenue-up",
        severity: "low",
        title: `Sales are up ${Math.round(growth)}% vs last period`,
        body: "Momentum is on your side. Lock in rates with your best buyers and ensure every sale has a due date + reminder — growth without collection creates cash stress.",
        actionLabel: "Quick bill",
        actionHref: "/invoices/manual",
      });
    }
  }

  if (invoices >= 5 && n(o.avg_invoice_value) > 0 && n(o.new_customers) === 0) {
    tips.push({
      id: "no-new-customers",
      severity: "medium",
      title: "No new customers this period",
      body: "You’re billing, but the funnel is stale. Ask every happy buyer for one referral, or share your catalogue offer on WhatsApp Status — new logos compound faster than chasing the same five accounts.",
      actionLabel: "Broadcast offer",
      actionHref: "/grow",
    });
  }

  if (n(o.gst_total) > 0 && invoices > 0) {
    tips.push({
      id: "gst-ready",
      severity: "low",
      title: `GST liability this period: ₹${Math.round(n(o.gst_total)).toLocaleString("en-IN")}`,
      body: "Export GSTR-1 JSON before the filing window and keep e-invoice IRN ready for B2B over the threshold. Quill can generate both from the same bills you already raised.",
      actionLabel: "GST compliance",
      actionHref: "/settings#gst",
    });
  }

  if (tips.length === 0 && invoices === 0) {
    tips.push({
      id: "get-started",
      severity: "medium",
      title: "Create your first bill to unlock insights",
      body: "Upload your empty + filled bill under Smart invoice, then raise a Quick bill. After ~10 invoices the dashboard predicts customers, items and rates for you.",
      actionLabel: "Smart invoice",
      actionHref: "/smart-invoice",
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return tips.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 5);
}
