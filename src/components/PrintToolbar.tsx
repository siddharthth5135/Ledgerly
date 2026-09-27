"use client";

import Link from "next/link";
import { useState } from "react";

type ShareLinks = { url: string; pdfUrl: string; whatsapp: string; text: string; fileName: string };

export function PrintToolbar({
  invoiceId,
  invoiceNumber,
  total,
  businessName,
  customerPhone,
}: {
  invoiceId: string;
  invoiceNumber: string;
  total: string;
  businessName: string;
  customerPhone?: string;
}) {
  const editHref =
    invoiceId && invoiceId !== "undefined" ? `/invoices/${invoiceId}` : "/invoices";
  const [busy, setBusy] = useState<"" | "wa" | "pdf" | "link">("");
  const [note, setNote] = useState<string | null>(null);

  async function getLinks(): Promise<ShareLinks | null> {
    const res = await fetch(`/api/invoices/${invoiceId}/share`, { method: "POST", credentials: "include" });
    const d = await res.json();
    if (!res.ok || !d.ok) {
      setNote(d.error || "Could not create share link");
      return null;
    }
    return d as ShareLinks;
  }

  /** Share the *generated PDF* on WhatsApp.
   *  Phone / tablet: native share sheet with the PDF file attached (opens straight in WhatsApp).
   *  Desktop: WhatsApp Web with a message that carries the PDF link (WhatsApp cannot accept files via URL). */
  async function shareWhatsApp() {
    if (busy) return;
    setBusy("wa");
    setNote(null);
    try {
      const links = await getLinks();
      if (!links) return;
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (typeof nav.share === "function" && typeof nav.canShare === "function") {
        try {
          const blob = await (await fetch(links.pdfUrl, { credentials: "omit" })).blob();
          const file = new File([blob], links.fileName, { type: "application/pdf" });
          if (nav.canShare({ files: [file] })) {
            await nav.share({ files: [file], title: `Invoice ${invoiceNumber}`, text: links.text });
            setNote("PDF shared.");
            return;
          }
        } catch (e) {
          if ((e as Error)?.name === "AbortError") return; // user closed the sheet
        }
      }
      window.open(links.whatsapp, "_blank", "noopener");
      setNote("Opened WhatsApp with the PDF link. On a phone the PDF file itself is attached.");
    } finally {
      setBusy("");
    }
  }

  async function downloadPdf() {
    if (busy) return;
    setBusy("pdf");
    setNote(null);
    try {
      const links = await getLinks();
      if (!links) return;
      window.open(`${links.pdfUrl}?dl=1`, "_blank", "noopener");
    } finally {
      setBusy("");
    }
  }

  async function copyLink() {
    if (busy) return;
    setBusy("link");
    setNote(null);
    try {
      const links = await getLinks();
      if (!links) return;
      await navigator.clipboard.writeText(links.url);
      setNote("Link copied — anyone with it can view & download this invoice (valid 90 days).");
    } catch {
      setNote("Could not copy the link.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="print-toolbar sticky top-0 z-10 border-b border-[var(--line)] bg-white/95 px-4 py-3 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          <span className="font-semibold text-[var(--ink)]">{businessName}</span> · Invoice {invoiceNumber} · {total} ·{" "}
          <Link href={editHref} className="text-[var(--brand)] underline">
            Edit view
          </Link>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyLink}
            disabled={!!busy}
            className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {busy === "link" ? "…" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            disabled={!!busy}
            className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {busy === "pdf" ? "Generating…" : "Download PDF"}
          </button>
          <button
            type="button"
            onClick={shareWhatsApp}
            disabled={!!busy}
            className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60"
            title={customerPhone ? `Send to ${customerPhone}` : "Share on WhatsApp"}
          >
            {busy === "wa" ? "Preparing PDF…" : "Share PDF on WhatsApp"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
          >
            Print
          </button>
        </div>
        {note && <p className="w-full text-xs text-[var(--muted)]">{note}</p>}
      </div>
    </div>
  );
}
