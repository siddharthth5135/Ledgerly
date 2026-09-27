/**
 * Learned autofill — deterministic suggestions from invoice history (no LLM).
 * After ~10 bills, predicts next customer / items / rates. UI accepts with Tab.
 */
import { queryRows } from "./db";
import type { BillItem } from "./bill-spec";

export type AutofillSuggestion = {
  id: string;
  kind: "customer" | "items" | "full_bill";
  label: string;
  confidence: number;
  reason: string;
  values?: Record<string, string>;
  items?: BillItem[];
  customerId?: string | null;
};

type InvRow = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  customer_gstin: string | null;
  customer_phone: string | null;
  field_values: Record<string, unknown> | null;
  issue_date: string;
};

type LineRow = {
  invoice_id: string;
  description: string;
  hsn: string | null;
  qty: string | number;
  rate: string | number;
  gst_percent: string | number | null;
};

function scoreName(a: string, b: string) {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (y.startsWith(x) || x.startsWith(y)) return 0.85;
  if (y.includes(x) || x.includes(y)) return 0.6;
  return 0;
}

export async function learnedAutofill(
  ownerId: string,
  opts: { q?: string; limit?: number } = {}
): Promise<{ ready: boolean; invoiceCount: number; suggestions: AutofillSuggestion[] }> {
  const invs = await queryRows<InvRow & { lines: LineRow[] | null }>(
    `SELECT i.id, i.customer_id, i.customer_name, i.customer_gstin, i.customer_phone,
            i.field_values, i.issue_date::text,
            COALESCE(
              json_agg(
                json_build_object(
                  'invoice_id', l.invoice_id,
                  'description', l.description,
                  'hsn', l.hsn,
                  'qty', l.qty,
                  'rate', l.rate,
                  'gst_percent', l.gst_percent
                )
                ORDER BY l.line_no
              ) FILTER (WHERE l.id IS NOT NULL),
              '[]'::json
            ) AS lines
       FROM (
         SELECT id, customer_id, customer_name, customer_gstin, customer_phone, field_values, issue_date, created_at
           FROM invoices
          WHERE owner_id = $1 AND status <> 'cancelled'
          ORDER BY issue_date DESC, created_at DESC
          LIMIT 80
       ) i
       LEFT JOIN invoice_lines l ON l.invoice_id = i.id
      GROUP BY i.id, i.customer_id, i.customer_name, i.customer_gstin, i.customer_phone,
               i.field_values, i.issue_date, i.created_at
      ORDER BY i.issue_date DESC, i.created_at DESC`,
    [ownerId]
  );
  const invoiceCount = invs.length;
  const lines = invs.flatMap((i) => i.lines || []);
  if (invoiceCount < 10) {
    return {
      ready: false,
      invoiceCount,
      suggestions: [],
    };
  }
  const linesByInv = new Map<string, LineRow[]>();
  for (const l of lines) {
    const arr = linesByInv.get(l.invoice_id) || [];
    arr.push(l);
    linesByInv.set(l.invoice_id, arr);
  }

  const q = (opts.q || "").trim();
  const suggestions: AutofillSuggestion[] = [];

  // Frequency of customers
  const custFreq = new Map<string, { count: number; row: InvRow }>();
  for (const inv of invs) {
    const key = (inv.customer_id || inv.customer_name || "").toLowerCase();
    if (!key) continue;
    const cur = custFreq.get(key);
    if (!cur) custFreq.set(key, { count: 1, row: inv });
    else cur.count += 1;
  }

  const rankedCust = [...custFreq.values()]
    .map((c) => ({
      ...c,
      match: q ? scoreName(q, c.row.customer_name) : 0.5 + Math.min(0.4, c.count / 20),
    }))
    .filter((c) => (q ? c.match >= 0.55 : true))
    .sort((a, b) => b.match * 10 + b.count - (a.match * 10 + a.count))
    .slice(0, opts.limit || 5);

  for (const c of rankedCust) {
    const inv = c.row;
    const fv = (inv.field_values || {}) as Record<string, unknown>;
    const itemsFromLines = (linesByInv.get(inv.id) || []).map((l) => ({
      description: l.description || "",
      hsn: l.hsn || "",
      qty: String(l.qty ?? ""),
      unit: "",
      rate: String(l.rate ?? ""),
      disc: "",
    }));
    const itemsFromFv = Array.isArray(fv.__items) ? (fv.__items as BillItem[]) : [];
    const items = itemsFromFv.length ? itemsFromFv : itemsFromLines;

    suggestions.push({
      id: `cust_${inv.id}`,
      kind: "full_bill",
      label: inv.customer_name,
      confidence: Math.min(0.97, 0.55 + c.count * 0.04 + (q ? c.match * 0.2 : 0)),
      reason: `Used ${c.count}× in your last ${invoiceCount} bills`,
      customerId: inv.customer_id,
      values: {
        customer_name: inv.customer_name,
        gstin: inv.customer_gstin || String(fv.gstin || ""),
        address: String(fv.address || ""),
        buyer_state: String(fv.buyer_state || ""),
        buyer_code: String(fv.buyer_code || (inv.customer_gstin || "").slice(0, 2)),
      },
      items: items.slice(0, 12),
    });
  }

  // Popular item lines (when typing in description)
  if (q.length >= 2) {
    const itemFreq = new Map<string, { count: number; sample: LineRow }>();
    for (const l of lines) {
      const key = (l.description || "").toLowerCase().trim();
      if (!key) continue;
      if (scoreName(q, key) < 0.55 && !key.includes(q.toLowerCase())) continue;
      const cur = itemFreq.get(key);
      if (!cur) itemFreq.set(key, { count: 1, sample: l });
      else cur.count += 1;
    }
    const topItems = [...itemFreq.values()].sort((a, b) => b.count - a.count).slice(0, 4);
    for (const it of topItems) {
      suggestions.push({
        id: `item_${it.sample.description.slice(0, 24)}`,
        kind: "items",
        label: it.sample.description,
        confidence: Math.min(0.95, 0.5 + it.count * 0.05),
        reason: `Item sold ${it.count}× · usual rate ₹${it.sample.rate}`,
        items: [
          {
            description: it.sample.description,
            hsn: it.sample.hsn || "",
            qty: "1",
            unit: "",
            rate: String(it.sample.rate ?? ""),
            disc: "",
          },
        ],
      });
    }
  }

  return { ready: true, invoiceCount, suggestions: suggestions.slice(0, opts.limit || 8) };
}
