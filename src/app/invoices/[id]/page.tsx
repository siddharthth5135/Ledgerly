import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/SiteChrome";
import { Pill, StatusPill } from "@/components/Pill";
import { getSession } from "@/lib/auth";
import { spGetInvoiceWithLines } from "@/lib/sp";
import { inrExact } from "@/lib/format";
import { MoneyReceivedToggle } from "@/components/MoneyReceivedToggle";
import { DuplicateInvoiceButton } from "@/components/DuplicateInvoiceButton";
import { PromiseToPayForm } from "@/components/PromiseToPayForm";
import { MakeRecurringButton } from "@/components/MakeRecurringButton";
import { ApproveRecurringDraft } from "@/components/ApproveRecurringDraft";
import { GstPayloadButtons } from "@/components/GstPayloadButtons";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const detail = await spGetInvoiceWithLines(session.ownerId, id);
  if (!detail?.invoice) notFound();

  const inv = detail.invoice as Record<string, unknown>;
  const lines = (detail.lines as Array<Record<string, unknown>>) || [];
  const fv =
    inv.field_values && typeof inv.field_values === "object"
      ? (inv.field_values as Record<string, unknown>)
      : {};
  const isRecurringDraft =
    String(inv.status) === "draft" &&
    (fv.__recurring_draft === true ||
      String(inv.notes || "").toLowerCase().includes("recurring draft"));

  return (
    <AppShell
      title={String(inv.number)}
      subtitle={`${inv.customer_name} · due ${String(inv.due_date).slice(0, 10)}`}
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusPill status={String(inv.status)} />
        <Pill>{String(inv.source)}</Pill>
        {inv.money_received ? <Pill>Money received</Pill> : <Pill>Payment pending</Pill>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-3xl border border-[var(--line)] bg-white p-6">
          <div className="grid gap-4 border-b border-[var(--line)] pb-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-[var(--muted)]">From</p>
              <p className="font-display text-lg font-semibold">
                {session.businessName || "Your business"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Bill to</p>
              <p className="font-display text-lg font-semibold">{String(inv.customer_name)}</p>
              <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                {String(inv.customer_gstin || "Unregistered")} ·{" "}
                {String(inv.customer_phone || "—")}
              </p>
            </div>
          </div>

          <div className="mt-3 flex justify-between text-sm text-[var(--muted)]">
            <span>Issue {String(inv.issue_date).slice(0, 10)}</span>
            <span>Due {String(inv.due_date).slice(0, 10)}</span>
            <span className="font-display text-xl font-semibold text-[var(--ink)]">
              {inrExact(Number(inv.total_amount))}
            </span>
          </div>

          <table className="mt-6 w-full text-left text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2">HSN</th>
                <th className="py-2">Qty</th>
                <th className="py-2">Rate</th>
                <th className="py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={String(l.id)} className="border-t border-[var(--line)]">
                  <td className="py-2">{String(l.description)}</td>
                  <td className="py-2 font-mono text-xs">{String(l.hsn || "")}</td>
                  <td className="py-2">{String(l.qty)}</td>
                  <td className="py-2">{inrExact(Number(l.rate))}</td>
                  <td className="py-2 font-semibold">{inrExact(Number(l.line_amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1 border-t border-[var(--line)] pt-4 text-sm">
            <div className="flex justify-between">
              <span>Taxable</span>
              <span>{inrExact(Number(inv.taxable_amount))}</span>
            </div>
            <div className="flex justify-between">
              <span>CGST</span>
              <span>{inrExact(Number(inv.cgst_amount))}</span>
            </div>
            <div className="flex justify-between">
              <span>SGST</span>
              <span>{inrExact(Number(inv.sgst_amount))}</span>
            </div>
            <div className="flex justify-between">
              <span>IGST</span>
              <span>{inrExact(Number(inv.igst_amount))}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{inrExact(Number(inv.total_amount))}</span>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <ApproveRecurringDraft
            invoiceId={String(inv.id)}
            isDraft={String(inv.status) === "draft"}
            isRecurringDraft={isRecurringDraft}
          />
          <div className="rounded-3xl border border-[var(--line)] bg-white p-5 space-y-3">
            <MoneyReceivedToggle
              invoiceId={String(inv.id)}
              initial={Boolean(inv.money_received)}
            />
            <DuplicateInvoiceButton invoiceId={String(inv.id)} />
            <MakeRecurringButton invoiceId={String(inv.id)} />
            <Link
              href={`/invoices/${inv.id}/print`}
              className="block rounded-xl bg-[var(--brand)] px-4 py-2 text-center text-sm font-semibold text-white"
            >
              Print / Share PDF
            </Link>
            <Link
              href="/collections"
              className="block text-center text-sm text-[var(--brand)]"
            >
              Collections →
            </Link>
          </div>
          <div className="rounded-3xl border border-[var(--line)] bg-white p-5 space-y-4">
            <PromiseToPayForm
              invoiceId={String(inv.id)}
              initialDate={inv.promise_to_pay_date ? String(inv.promise_to_pay_date) : null}
              initialNote={inv.promise_note ? String(inv.promise_note) : null}
            />
            <GstPayloadButtons
              invoiceId={String(inv.id)}
              irn={inv.irn ? String(inv.irn) : null}
              ewbNumber={inv.ewb_number ? String(inv.ewb_number) : null}
            />
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
