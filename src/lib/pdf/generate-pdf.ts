import type { SemanticDocument } from "@/lib/document-model";
import { buildPdfDefinition, type ExportDiagnostic } from "./adapter";
import { fontBytesToBase64, loadPdfFontAssets } from "./fonts/load-fonts";

export type NativePdfResult = { blob: Blob; diagnostics: ExportDiagnostic[] };

/** Generate a PDF on demand in the user's browser. */
export async function generateNativePdf(document: SemanticDocument): Promise<NativePdfResult> {
  if (typeof window === "undefined") throw new Error("Native PDF generation requires a browser");
  const { definition, diagnostics, fontPlan } = buildPdfDefinition(document);
  try {
    const [{ default: pdfMake }, fontAssets] = await Promise.all([
      import("pdfmake/build/pdfmake"),
      loadPdfFontAssets(fontPlan.assets),
    ]);
    const vfs: Record<string, string> = {};
    for (const asset of fontPlan.assets) {
      const bytes = fontAssets.get(asset.path);
      if (!bytes) throw new Error(`Font loader did not return ${asset.fileName}`);
      vfs[asset.fileName] = fontBytesToBase64(bytes);
    }
    pdfMake.addVirtualFileSystem(vfs);
    pdfMake.addFonts(fontPlan.fonts);
    const blob = await pdfMake.createPdf(definition).getBlob();
    if (blob.type !== "application/pdf") throw new Error("Unexpected PDF MIME type");
    return { blob, diagnostics };
  } catch (error) {
    throw new Error("Native PDF generation failed", { cause: error });
  }
}
