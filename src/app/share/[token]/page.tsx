import { notFound } from "next/navigation";
import { BillDocument } from "@/components/BillDocument";
import { inrExact } from "@/lib/format";
import { loadInvoiceRender } from "@/lib/invoice-render";
import { verifyShareToken } from "@/lib/share-token";

export const dynamic = "force-dynamic";

/**
 * Public, read-only invoice view reached from a signed link (WhatsApp / email).
 * `?raw=1` renders the bare bill (used by the PDF renderer).
 */
export default async function SharedInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ raw?: string }>;
}) {
  const { token } = await params;
  const { raw } = await searchParams;
  const p = verifyShareToken(token);
  if (!p) notFound();
  const r = await loadInvoiceRender(p.own, p.inv);
  if (!r) notFound();

  const bill = r.spec ? (
    <BillDocument
      spec={r.spec}
      values={r.values}
      items={r.items}
      mode="print"
      fallbackInvoiceNo={r.number}
      fallbackInvoiceDate={r.issueDate}
    />
  ) : (
    <article className="bill-document mx-auto max-w-3xl bg-white px-8 py-10 text-sm">
      <h1 className="text-2xl font-semibold">{r.profile.name}</h1>
      <p className="mt-2">Invoice {r.number} · {r.issueDate}</p>
      <p className="mt-4">To: {String(r.inv.customer_name || "")}</p>
      <p className="mt-6 text-lg font-semibold">Total {inrExact(Number(r.inv.total_amount || 0))}</p>
    </article>
  );

  if (raw === "1") {
    return <div className="bg-white text-black">{bill}</div>;
  }

  return (
    <div className="min-h-screen bg-[#cfd3d8] text-black print:bg-white">
      <div className="sticky top-0 z-10 border-b border-black/10 bg-white/95 px-4 py-3 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            <span className="font-semibold">{r.profile.name || "Invoice"}</span>
            {" · "}Invoice {r.number} · {inrExact(Number(r.inv.total_amount || 0))}
          </p>
          <a
            href={`/api/share/${encodeURIComponent(token)}/pdf`}
            className="rounded-full bg-black px-4 py-2 font-semibold text-white"
          >
            Download PDF
          </a>
        </div>
      </div>
      <div className="mx-auto w-[210mm] py-4 print:py-0">
        <div className="shadow-[0_2px_18px_rgba(0,0,0,0.25)] print:shadow-none">{bill}</div>
      </div>
    </div>
  );
}
