import type { Metadata } from "next";
import { Manrope, Fraunces, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

/** Body: Manrope — clean, global SaaS readability (Latin + Devanagari-friendly metrics). */
const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

/** Display: Fraunces — expressive optical sizes for brand moments, not generic Inter. */
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Quill — Premium GST invoicing for growing businesses",
    template: "%s · Quill",
  },
  description:
    "Upload any bill design, bill in seconds, print pixel-perfect GST invoices, collect on WhatsApp, and stay GST-ready. Built for traders worldwide.",
  icons: {
    icon: "/quill-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable} ${mono.variable} h-full scroll-smooth`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col antialiased" suppressHydrationWarning>
        <div id="main-content" className="flex min-h-full flex-1 flex-col">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
