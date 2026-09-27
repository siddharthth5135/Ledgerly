import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-20">
        <p className="font-mono text-sm text-[var(--muted)]">404</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Not found</h1>
        <p className="mt-3 text-[var(--muted)]">That page or invoice does not exist in the demo.</p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex w-fit rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Dashboard
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
