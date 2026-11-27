import type { SemanticDocument } from "@/lib/document-model";
import { buildPdfDefinition, type ExportDiagnostic } from "./adapter";

export type NativePdfResult = { blob: Blob; diagnostics: ExportDiagnostic[] };

/** Generate a PDF on demand in the user's browser. */
export async function generateNativePdf(document: SemanticDocument): Promise<NativePdfResult> {
  if (typeof window === "undefined") throw new Error("Native PDF generation requires a browser");
  const { definition, diagnostics } = buildPdfDefinition(document);
  try {
    const [{ default: pdfMake }, ...fonts] = await Promise.all([
      import("pdfmake/build/pdfmake"),
      ...["Regular", "Bold", "Italic", "BoldItalic"].map(async style => {
        const response = await fetch(`/fonts/liberation/LiberationSans-${style}.ttf`);
        if (!response.ok) throw new Error(`Unable to load ${style} font`);
        return new Uint8Array(await response.arrayBuffer());
      }),
    ]);
    const names = ["Regular", "Bold", "Italic", "BoldItalic"];
    const vfs: Record<string, string> = {};
    fonts.forEach((bytes, index) => {
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      vfs[`LiberationSans-${names[index]}.ttf`] = btoa(binary);
    });
    pdfMake.addVirtualFileSystem(vfs);
    pdfMake.addFonts({ Liberation: { normal: "LiberationSans-Regular.ttf", bold: "LiberationSans-Bold.ttf", italics: "LiberationSans-Italic.ttf", bolditalics: "LiberationSans-BoldItalic.ttf" } });
    const blob = await pdfMake.createPdf(definition).getBlob();
    if (blob.type !== "application/pdf") throw new Error("Unexpected PDF MIME type");
    return { blob, diagnostics };
  } catch (error) {
    throw new Error("Native PDF generation failed", { cause: error });
  }
}
