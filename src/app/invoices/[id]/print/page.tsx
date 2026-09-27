import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { inrExact } from "@/lib/format";
import { PrintToolbar } from "@/components/PrintToolbar";
import { BillDocument } from "@/components/BillDocument";
import { ddmmyyyy, loadInvoiceRender } from "@/lib/invoice-render";

export const dynamic = "force-dynamic";

export default async function PrintInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const r = await loadInvoiceRender(session.ownerId, id);
  if (!r) notFound();

  const { inv, lines, spec, values, items, invoiceId } = r;

  return (
    <div className="min-h-screen bg-[#cfd3d8] text-black print:bg-white">
      <PrintToolbar
        invoiceId={invoiceId}
        invoiceNumber={r.number}
        total={inrExact(Number(inv.total_amount || 0))}
        businessName={r.profile.name || session.businessName || "Quill"}
        customerPhone={String(inv.customer_phone || "")}
      />
      {spec ? (
        <div className="mx-auto w-[210mm] py-4 print:py-0">
          <div className="shadow-[0_2px_18px_rgba(0,0,0,0.25)] print:shadow-none">
            <BillDocument
              spec={spec}
              values={values}
              items={items}
              mode="print"
              fallbackInvoiceNo={r.number}
              fallbackInvoiceDate={r.issueDate}
            />
          </div>
        </div>
      ) : (
        <article className="mx-auto max-w-3xl bg-white px-8 py-10 print:px-0">
          <p className="mb-4 text-xs text-black/50 print:hidden">
            This invoice has no bill design attached. Create one under Smart invoice for an
            exact-design print.
          </p>
          <header className="flex justify-between border-b border-black/20 pb-4">
            <div>
              <h1 className="font-display text-3xl font-semibold">
                {r.profile.name || session.businessName || "Quill"}
              </h1>
              <p className="text-sm text-black/60">TAX INVOICE</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{String(inv.number)}</p>
              <p>Date {ddmmyyyy(inv.issue_date)}</p>
              <p>Due {ddmmyyyy(inv.due_date)}</p>
            </div>
          </header>
          <section className="mt-6 text-sm">
            <p className="text-xs uppercase text-black/50">Bill to</p>
            <p className="text-lg font-semibold">{String(inv.customer_name)}</p>
            <p className="font-mono text-xs">
              {String(inv.customer_gstin || "")} {String(inv.customer_phone || "")}
            </p>
          </section>
          <table className="mt-8 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/20 text-xs uppercase">
                <th className="py-2">Description</th>
                <th className="py-2">HSN</th>
                <th className="py-2">Qty</th>
                <th className="py-2">Rate</th>
                <th className="py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={String(l.id)} className="border-b border-black/10">
                  <td className="py-2">{String(l.description)}</td>
                  <td className="py-2">{String(l.hsn || "")}</td>
                  <td className="py-2">{String(l.qty)}</td>
                  <td className="py-2">{inrExact(Number(l.rate))}</td>
                  <td className="py-2">{inrExact(Number(l.line_amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6 ml-auto w-56 space-y-1 text-sm">
            <div className="flex justify-between"><span>Taxable</span><span>{inrExact(Number(inv.taxable_amount))}</span></div>
            <div className="flex justify-between"><span>CGST</span><span>{inrExact(Number(inv.cgst_amount))}</span></div>
            <div className="flex justify-between"><span>SGST</span><span>{inrExact(Number(inv.sgst_amount))}</span></div>
            <div className="flex justify-between"><span>IGST</span><span>{inrExact(Number(inv.igst_amount))}</span></div>
            <div className="flex justify-between border-t border-black/20 pt-2 text-base font-semibold">
              <span>Total</span><span>{inrExact(Number(inv.total_amount))}</span>
            </div>
          </div>
          {inv.notes ? <p className="mt-8 text-sm text-black/70">{String(inv.notes)}</p> : null}
        </article>
      )}
    </div>
  );
}
