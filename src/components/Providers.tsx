"use client";

import { SessionProvider } from "@/components/SiteChrome";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
