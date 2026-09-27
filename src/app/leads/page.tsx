import Link from "next/link";
import { AppShell } from "@/components/SiteChrome";
import { listLeads } from "@/lib/leads";

export const dynamic = "force-dynamic";

export default function LeadsPage() {
  const leads = listLeads();

  return (
    <AppShell
      title="Leads inbox"
      subtitle="Pilot / demo requests from /pilot. Call within 2 hours — this is your tomorrow revenue pipeline."
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <Link
          href="/pilot"
          className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
        >
          Open public pilot form
        </Link>
        <p className="self-center text-sm text-[var(--muted)]">{leads.length} lead(s)</p>
      </div>

      {leads.length === 0 ? (
        <p className="rounded-3xl border border-[var(--line)] bg-white p-8 text-[var(--muted)]">
          No leads yet. Share /pilot on WhatsApp Status + with 20 SME owners today.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)] rounded-3xl border border-[var(--line)] bg-white">
          {leads.map((l) => (
            <li key={l.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {l.name} · {l.business}
                  </p>
                  <p className="mt-1 font-mono text-sm">
                    <a className="text-[var(--brand)]" href={`https://wa.me/91${l.phone}`}>
                      wa.me/91{l.phone}
                    </a>
                    {l.email ? ` · ${l.email}` : ""}
                    {l.city ? ` · ${l.city}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {l.interest} · {l.source} · {new Date(l.createdAt).toLocaleString("en-IN")}
                  </p>
                  {l.message && <p className="mt-2 text-sm">{l.message}</p>}
                </div>
                <a
                  href={`https://wa.me/91${l.phone}?text=${encodeURIComponent(
                    `Hi ${l.name}, this is Quill — ready for your 15-min WhatsApp→GST invoice demo?`
                  )}`}
                  className="rounded-full bg-[var(--ok)] px-3 py-1.5 text-xs font-semibold text-white"
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp now
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
