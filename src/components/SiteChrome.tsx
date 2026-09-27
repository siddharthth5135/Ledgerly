"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BrandLogo } from "@/components/BrandLogo";

type NavUser = {
  name: string;
  role: string;
  userType: string;
  businessName?: string;
};

type SessionCtx = {
  user: NavUser | null;
  loading: boolean;
  refresh: () => void;
  /** Apply the user from a login/register response immediately — no full reload. */
  adopt: (user: NavUser) => void;
  clear: () => void;
};

const SessionContext = createContext<SessionCtx>({
  user: null,
  loading: true,
  refresh: () => {},
  adopt: () => {},
  clear: () => {},
});

/** Shared session — avoids /api/auth/me on every page navigation. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<NavUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.user) setUser(d.user);
        else setUser(null);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clear = useCallback(() => setUser(null), []);
  const adopt = useCallback((next: NavUser) => {
    setUser(next);
    setLoading(false);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, adopt, clear }),
    [user, loading, refresh, adopt, clear]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionUser() {
  return useContext(SessionContext);
}

const OWNER_PRIMARY = [
  { href: "/dashboard", label: "Home" },
  { href: "/invoices", label: "Invoices" },
  { href: "/invoices/manual", label: "Bill" },
  { href: "/smart-invoice", label: "Design" },
  { href: "/collections", label: "Collect" },
];

const OWNER_MORE = [
  { href: "/customers", label: "Customers" },
  { href: "/grow", label: "Grow" },
  { href: "/recurring", label: "Recurring" },
  { href: "/books", label: "Books" },
  { href: "/settings", label: "Settings" },
];

const STAFF_LINKS = [
  { href: "/invoices", label: "Invoices" },
  { href: "/invoices/manual", label: "Bill" },
];

function linkActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/invoices") return pathname === "/invoices" || /^\/invoices\/[^/]+$/.test(pathname);
  if (href === "/invoices/manual") return pathname.startsWith("/invoices/manual");
  return pathname === href || pathname.startsWith(href + "/");
}

export function SiteHeader({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { user, clear } = useSessionUser();
  const pathname = usePathname();
  const router = useRouter();

  const primary = useMemo(() => {
    if (!user) return [{ href: "/pricing", label: "Pricing" }];
    return user.role === "staff" ? STAFF_LINKS : OWNER_PRIMARY;
  }, [user]);

  const more = useMemo(() => {
    if (!user || user.role === "staff") return [];
    return OWNER_MORE;
  }, [user]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clear();
    router.push("/login");
    router.refresh();
  }

  const shell = dark
    ? "border-b border-white/10 bg-transparent text-white"
    : "border-b border-[var(--line)] bg-white/90 text-[var(--ink)] backdrop-blur-md";

  return (
    <header className={`relative z-30 ${shell}`}>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-8">
        <BrandLogo href={user ? "/dashboard" : "/"} dark={dark} size="sm" />

        <nav className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 md:flex" aria-label="Primary">
          {primary.map((l) => {
            const active = linkActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
                  active
                    ? dark
                      ? "bg-white/15 text-white"
                      : "bg-[var(--brand-soft)] text-[var(--brand)]"
                    : dark
                      ? "text-white/70 hover:bg-white/10 hover:text-white"
                      : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          {more.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium ${
                  dark ? "text-white/70 hover:bg-white/10" : "text-[var(--muted)] hover:bg-[var(--bg)]"
                }`}
              >
                More ▾
              </button>
              {moreOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default"
                    aria-label="Close"
                    onClick={() => setMoreOpen(false)}
                  />
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border border-[var(--line)] bg-white py-1 shadow-lg">
                    {more.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        onClick={() => setMoreOpen(false)}
                        className={`block px-3 py-2 text-sm ${
                          linkActive(pathname, l.href)
                            ? "bg-[var(--brand-soft)] font-semibold text-[var(--brand)]"
                            : "text-[var(--ink)] hover:bg-[var(--bg)]"
                        }`}
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {user ? (
            <>
              <div className="hidden max-w-[160px] truncate text-right lg:block">
                <p className="truncate text-xs font-semibold leading-tight">
                  {user.businessName || user.name}
                </p>
                <p className="truncate text-[10px] capitalize text-[var(--muted)]">{user.role}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  dark ? "bg-white text-[var(--deep)]" : "border border-[var(--line)] bg-white"
                }`}
              >
                Log out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                dark ? "bg-white text-[var(--deep)]" : "bg-[var(--brand)] text-white"
              }`}
            >
              Sign in
            </Link>
          )}
          <button
            type="button"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg md:hidden ${
              dark ? "bg-white/10" : "border border-[var(--line)] bg-white"
            }`}
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            ☰
          </button>
        </div>
      </div>

      {open && (
        <nav
          className={`mx-auto flex max-w-6xl flex-col gap-0.5 px-4 pb-3 text-sm md:hidden ${
            dark ? "" : ""
          }`}
        >
          {[...primary, ...more].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`rounded-xl px-3 py-2.5 ${
                linkActive(pathname, l.href)
                  ? dark
                    ? "bg-white/15"
                    : "bg-[var(--brand-soft)] font-semibold text-[var(--brand)]"
                  : dark
                    ? "hover:bg-white/10"
                    : "hover:bg-[var(--bg)]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--line)] bg-white px-5 py-10 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:justify-between">
        <div>
          <BrandLogo href="/" size="lg" />
          <p className="mt-3 max-w-sm text-sm text-[var(--muted)]">
            Premium GST invoicing — your letterhead, fast billing, collections that chase, GSTR-ready.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-2">
          <div className="space-y-2">
            <p className="font-semibold">Product</p>
            <Link href="/invoices/manual" className="block text-[var(--muted)] hover:text-[var(--brand)]">
              Quick bill
            </Link>
            <Link href="/smart-invoice" className="block text-[var(--muted)] hover:text-[var(--brand)]">
              Smart invoice
            </Link>
            <Link href="/collections" className="block text-[var(--muted)] hover:text-[var(--brand)]">
              Collections
            </Link>
            <Link href="/pricing" className="block text-[var(--muted)] hover:text-[var(--brand)]">
              Pricing
            </Link>
          </div>
          <div className="space-y-2">
            <p className="font-semibold">Note</p>
            <p className="text-[var(--muted)]">Production Postgres</p>
            <p className="text-[var(--muted)]">Not tax advice</p>
          </div>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-6xl text-xs text-[var(--muted)]">
        © {new Date().getFullYear()} Quill.
      </p>
    </footer>
  );
}

export function AppShell({
  children,
  title,
  subtitle,
  wide,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Full-width workspace (editors): no page heading, content uses the whole screen */
  wide?: boolean;
}) {
  if (wide) {
    return (
      <div className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1800px] flex-1 px-3 py-3 md:px-5">
          <h1 className="sr-only">{title}</h1>
          {children}
        </main>
      </div>
    );
  }
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[var(--muted)]">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
