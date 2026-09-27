export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warmPool } = await import("@/lib/db");
  void warmPool();
  // Chromium for PDFs takes a couple of seconds to launch. Start it before the first download.
  void import("@/lib/invoice-pdf")
    .then((m) => m.warmBrowser())
    .catch(() => undefined);
}
