/** Browser-only: turn PDF/image into a JPEG blob of page 1 (exact visual). */

export async function fileToBillJpeg(
  file: File,
  scale = 2
): Promise<{ blob: Blob; width: number; height: number }> {
  if (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
  ) {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("JPEG encode failed"))),
        "image/jpeg",
        0.92
      )
    );
    return { blob, width: canvas.width, height: canvas.height };
  }

  // Load bundled pdf.js from /public (no CDN)
  await loadPdfJsShim();
  const pdfjs = (window as unknown as { pdfjsLib: typeof import("pdfjs-dist") }).pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: ctx,
    viewport,
  } as never).promise;
  await doc.destroy();

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG encode failed"))),
      "image/jpeg",
      0.92
    )
  );
  return { blob, width: canvas.width, height: canvas.height };
}

let shimPromise: Promise<void> | null = null;
function loadPdfJsShim(): Promise<void> {
  if ((window as unknown as { pdfjsLib?: unknown }).pdfjsLib) {
    return Promise.resolve();
  }
  if (!shimPromise) {
    shimPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/pdfjs-shim.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load /pdfjs-shim.js"));
      document.head.appendChild(s);
    });
  }
  return shimPromise;
}
