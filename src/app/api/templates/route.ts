import { NextRequest, NextResponse } from "next/server";
import { AuthError, getSession, requirePermission, canAccess } from "@/lib/auth";
import {
  spCreateBillTemplate,
  spGetDefaultTemplate,
  spGetTemplate,
  spListTemplates,
  spUpdateBillTemplate,
} from "@/lib/sp";
import { SECURITY_HEADERS } from "@/lib/security";
import { extractTextFromPdf, isPdf, sanitizeForDbText } from "@/lib/bill-ocr";
import { saveTemplateBackground, renderBillPreviewJpeg } from "@/lib/template-assets";
import {
  defaultBillSpec,
  inferBillSpecFromText,
  isDocumentLayout,
  parseDocumentLayout,
  specToFieldSchema,
  type BillSpec,
  type DocumentLayout,
} from "@/lib/bill-spec";
import { analyzePdfPage, buildSpecFromAnalysis, type DetectedField, type PageAnalysis } from "@/lib/bill-analyze";
import {
  applyProfileToSpec,
  getBusinessProfile,
  profileFromSpec,
  profileIsEmpty,
  saveBusinessProfile,
} from "@/lib/business";
import { analyzeBillWithVision, mergeGeometryAndVision } from "@/lib/bill-vision";
import { analyzeRasterPage } from "@/lib/bill-raster";

export const runtime = "nodejs";
export const maxDuration = 120;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

function fileRef(file: File, buf: Buffer) {
  const meta = {
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: buf.length,
  };
  return `meta://${encodeURIComponent(JSON.stringify(meta))}`;
}

/** Real words, not the byte soup a scanned PDF's raw stream decodes to. */
function isReadable(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 20) return false;
  const clean = (t.match(/[A-Za-z0-9 .,:/&()\-₹%]/g) || []).length / t.length;
  const words = (t.match(/\b[A-Za-z]{3,}\b/g) || []).filter((w) => /[aeiou]/i.test(w) && !/(.)\1\1/.test(w));
  return clean > 0.85 && words.length >= 6;
}

async function textFromUpload(file: File, buf: Buffer, clientText?: string): Promise<string> {
  if (clientText && isReadable(clientText)) {
    return sanitizeForDbText(clientText).slice(0, 20000);
  }
  if (isPdf(file.name, file.type)) {
    const fromPdf = await extractTextFromPdf(buf);
    if (isReadable(fromPdf)) return fromPdf;
  }
  return "";
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);

    const oneId = req.nextUrl.searchParams.get("id");
    if (oneId) {
      const [t, profile] = await Promise.all([
        spGetTemplate(session.ownerId, oneId),
        getBusinessProfile(session.ownerId),
      ]);
      if (!t) return json({ ok: false, error: "Template not found" }, 404);
      const tpl = t as { layout_json?: unknown };
      const layout = parseDocumentLayout(tpl.layout_json);
      if (layout) tpl.layout_json = { ...layout, spec: applyProfileToSpec(layout.spec, profile) };
      return json({ ok: true, template: t, profile });
    }

    if (req.nextUrl.searchParams.get("default") === "1") {
      const [t, profile] = await Promise.all([
        spGetDefaultTemplate(session.ownerId),
        getBusinessProfile(session.ownerId),
      ]);
      // Seller / bank / default GST always come from the business profile, never from the sample bill.
      if (t && typeof t === "object") {
        const tpl = t as { layout_json?: unknown };
        const layout = parseDocumentLayout(tpl.layout_json);
        if (layout) {
          tpl.layout_json = { ...layout, spec: applyProfileToSpec(layout.spec, profile) };
        }
      }
      return json({ ok: true, template: t, profile });
    }

    // List for Quick bill template picker (invoices) or Smart invoice editor
    if (!canAccess(session, "smart_invoice") && !canAccess(session, "invoices")) {
      return json({ ok: false, error: "Forbidden" }, 403);
    }

    const templates = await spListTemplates(session.ownerId);
    return json({ ok: true, templates });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: "Failed" }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "smart_invoice");

    const form = await req.formData();
    const name = String(form.get("name") || "My bill template").trim();
    const emptyFile = form.get("emptyBill") as File | null;
    const sampleFile = form.get("sampleBill") as File | null;
    const previewFile = form.get("emptyPreview") as File | null;
    const clientOcrText = form.get("ocrText") ? String(form.get("ocrText")) : "";
    const startBlank = form.get("blank") === "1";

    let spec: BillSpec;
    let referenceImageUrl: string | null = null;
    let text = "";
    let emptyBuf: Buffer | null = null;
    let sampleBuf: Buffer | null = null;
    let detected: DetectedField[] = [];
    let method: "geometry" | "text" | "blank" | "vision" | "geometry+vision" | "ocr" | "ocr+vision" = "blank";
    let readBy: "pdf" | "ocr" = "pdf";
    let visionNotes: string[] = [];

    if (startBlank) {
      spec = defaultBillSpec();
      spec.seller.name = session.businessName || "";
      spec.header.showSellerName = true;
    } else {
      if (!sampleFile) {
        return json({ ok: false, error: "Upload your filled bill (and the empty one if you have it)" }, 400);
      }
      sampleBuf = Buffer.from(await sampleFile.arrayBuffer());
      emptyBuf = emptyFile && emptyFile.size > 0 ? Buffer.from(await emptyFile.arrayBuffer()) : null;
      if ((emptyBuf && emptyBuf.length > 20_000_000) || sampleBuf.length > 20_000_000) {
        return json({ ok: false, error: "Each file must be under 20MB" }, 400);
      }

      // 1) Geometric analysis (vector PDFs): exact grid + filled−empty diff
      let filledA: PageAnalysis | null = null;
      let emptyA: PageAnalysis | null = null;
      if (isPdf(sampleFile.name, sampleFile.type)) {
        try {
          filledA = await analyzePdfPage(sampleBuf);
          if (emptyBuf && emptyFile && isPdf(emptyFile.name, emptyFile.type)) {
            emptyA = await analyzePdfPage(emptyBuf);
          }
        } catch (e) {
          console.warn("geometry analysis failed:", e instanceof Error ? e.message : e);
        }
      }

      // Page pictures of both bills: scanned PDFs / photos are read from these
      const pics: { filled: Buffer | null; empty: Buffer | null } = { filled: null, empty: null };
      const pictures = async () => {
        if (!pics.filled) pics.filled = (await renderBillPreviewJpeg(sampleBuf!, sampleFile.name, sampleFile.type)).jpeg;
        if (!pics.empty && emptyBuf && emptyFile) {
          try {
            pics.empty = (await renderBillPreviewJpeg(emptyBuf, emptyFile.name, emptyFile.type)).jpeg;
          } catch {
            pics.empty = null;
          }
        }
        return { filled: pics.filled, empty: pics.empty };
      };

      // 2) No text layer (scan / photo): read the page picture offline — ruled lines + OCR
      if (!filledA || filledA.texts.length < 6) {
        try {
          const p = await pictures();
          const f = await analyzeRasterPage(p.filled);
          const e = p.empty ? await analyzeRasterPage(p.empty) : null;
          if (f && f.texts.length >= 6) {
            filledA = f;
            emptyA = e && e.texts.length >= 6 ? e : null;
            readBy = "ocr";
          }
        } catch (e) {
          console.warn("image reading failed:", e instanceof Error ? e.message : e);
        }
      }

      if (filledA && filledA.texts.length >= 6) {
        const r = buildSpecFromAnalysis(emptyA, filledA, session.businessName || undefined);
        spec = r.spec;
        detected = r.detected;
        method = readBy === "ocr" ? "ocr" : r.method;
        text = filledA.text;
      } else {
        // 3) Plain text only (client OCR text / PDF text stream)
        text = await textFromUpload(sampleFile, sampleBuf, clientOcrText);
        if (!text && emptyFile && emptyBuf) text = await textFromUpload(emptyFile, emptyBuf);
        spec = inferBillSpecFromText(text, session.businessName || undefined);
        method = "text";
      }
      if (!spec.seller.name) spec.seller.name = session.businessName || "";

      // 4) Vision LLM to enrich a thin read — optional (needs OPENAI_API_KEY with credits)
      const wantVision = method === "text" || detected.length < 12;
      let visionFailed = "";
      if (wantVision) {
        try {
          const p = await pictures();
          const vision = await analyzeBillWithVision({
            filledJpeg: p.filled,
            emptyJpeg: p.empty,
            filledMime: isPdf(sampleFile.name, sampleFile.type) ? "image/jpeg" : sampleFile.type || "image/jpeg",
            businessName: session.businessName || undefined,
          });
          if (vision) {
            spec = mergeGeometryAndVision(spec, vision.spec);
            visionNotes = vision.notes;
            method = method === "geometry" ? "geometry+vision" : method === "ocr" ? "ocr+vision" : "vision";
          } else visionFailed = "AI reader is not configured";
        } catch (e) {
          visionFailed = e instanceof Error ? e.message : String(e);
          console.warn("vision step skipped:", visionFailed);
        }
      }

      // Never hand back a generic GST bill pretending to be theirs
      if (method === "text" && !isReadable(text)) {
        return json(
          {
            ok: false,
            error:
              "We couldn't read this bill, so no design was created. Please upload a clearer scan or the original PDF (not a photo of a screen)." +
              (visionFailed && /429|quota|credit/i.test(visionFailed) ? " (The AI reader is out of credits.)" : ""),
          },
          422
        );
      }

      // Reference image of the uploaded bill (for side-by-side comparison) — best effort
      try {
        let previewBuf: Buffer | null = null;
        if (previewFile && previewFile.size > 0) {
          previewBuf = Buffer.from(await previewFile.arrayBuffer());
        } else if (pics.empty || (!emptyBuf && pics.filled)) {
          previewBuf = pics.empty ?? pics.filled;
        } else {
          const refFile = emptyBuf && emptyFile ? emptyFile : sampleFile;
          const refBuf = emptyBuf ?? sampleBuf;
          const rendered = await renderBillPreviewJpeg(refBuf, refFile.name, refFile.type);
          previewBuf = rendered.jpeg;
        }
        if (previewBuf && previewBuf.length < 12_000_000) {
          const saved = await saveTemplateBackground(session.ownerId, previewBuf, "jpg");
          referenceImageUrl = saved.url;
        }
      } catch (e) {
        console.warn("reference image skipped:", e instanceof Error ? e.message : e);
      }
    }

    // Business details live on the owner, not on the design. First upload seeds the profile
    // (it's the user's own bill); afterwards the profile wins and we only *suggest* what the bill said.
    const detectedSeller = {
      name: spec.seller.name,
      gstin: spec.seller.gstin,
      state: spec.seller.state,
      stateCode: spec.seller.stateCode,
      address: spec.seller.address,
      bank: { ...spec.bank },
      gstPercent: spec.totals.gstPercent,
    };
    let profile = await getBusinessProfile(session.ownerId);
    const seededProfile = !startBlank && profileIsEmpty(profile) && !!(spec.seller.gstin || spec.seller.name);
    if (seededProfile) {
      profile = await saveBusinessProfile(session.ownerId, profileFromSpec(spec, profile));
    }
    spec = applyProfileToSpec(spec, profile);

    const layoutJson: DocumentLayout = {
      mode: "document",
      version: 2,
      spec,
      referenceImageUrl,
    };

    const template = await spCreateBillTemplate({
      ownerId: session.ownerId,
      createdBy: session.userId,
      name,
      emptyBillUrl: emptyFile && emptyBuf ? fileRef(emptyFile, emptyBuf) : "meta://blank",
      sampleBillUrl: sampleFile && sampleBuf ? fileRef(sampleFile, sampleBuf) : "meta://blank",
      layoutJson,
      fieldSchema: specToFieldSchema(spec),
      ocrRaw: {
        text: sanitizeForDbText(text).slice(0, 6000),
        emptyFile: emptyFile?.name || null,
        sampleFile: sampleFile?.name || null,
        method,
        detected,
        visionNotes,
      },
      // A new upload becomes the default only when there is none yet; the user switches designs explicitly
      setDefault: !(await spGetDefaultTemplate(session.ownerId)),
    });

    const sellerDiffers =
      !seededProfile &&
      !startBlank &&
      ((detectedSeller.gstin && detectedSeller.gstin !== profile.gstin) ||
        (detectedSeller.name && detectedSeller.name.toUpperCase() !== profile.name.toUpperCase()));
    return json(
      { ok: true, template, detected, method, profile, seededProfile, detectedSeller: sellerDiffers ? detectedSeller : null },
      201
    );
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    console.error("templates POST", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Template create failed" }, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    requirePermission(session, "smart_invoice");
    const body = await req.json();
    const templateId = String(body.id || "");
    if (!templateId) return json({ ok: false, error: "id required" }, 400);

    let layoutJson: DocumentLayout | undefined;
    let fieldSchema: unknown = body.fieldSchema;
    if (body.layoutJson && isDocumentLayout(body.layoutJson)) {
      const lj: DocumentLayout = body.layoutJson;
      layoutJson = lj;
      fieldSchema = specToFieldSchema(lj.spec);
      // Seller / bank / default GST edited on the bill → business profile (owner only; staff can't change them)
      if (body.syncProfile !== false && session.role !== "staff") {
        const current = await getBusinessProfile(session.ownerId);
        await saveBusinessProfile(session.ownerId, profileFromSpec(lj.spec, current));
      }
    }

    const template = await spUpdateBillTemplate({
      ownerId: session.ownerId,
      templateId,
      userId: session.userId,
      name: body.name,
      layoutJson,
      fieldSchema: fieldSchema as object | undefined,
      isActive: body.isActive,
      setDefault: body.setDefault,
    });

    return json({ ok: true, template });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, e.status);
    return json({ ok: false, error: e instanceof Error ? e.message : "Update failed" }, 400);
  }
}
