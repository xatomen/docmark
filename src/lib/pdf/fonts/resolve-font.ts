import {
  DEFAULT_PDF_DOCUMENT_FAMILY,
  DOCUMENT_PDF_FONT_MAPPINGS,
  PDF_FONT_REGISTRY,
} from "./registry";
import type { PdfFontFamily, PdfFontVariant, PdfTextStyle, ResolvedPdfFont } from "./types";

const variantFor = ({ bold = false, italic = false }: PdfTextStyle): PdfFontVariant => {
  if (bold && italic) return "boldItalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "regular";
};

const FALLBACKS: Record<PdfFontVariant, PdfFontVariant[]> = {
  regular: ["regular", "bold", "italic", "boldItalic"],
  bold: ["bold", "regular", "boldItalic", "italic"],
  italic: ["italic", "regular", "boldItalic", "bold"],
  boldItalic: ["boldItalic", "bold", "italic", "regular"],
};

export function resolvePdfFont(
  requestedDocumentFamily: string,
  style: PdfTextStyle = {},
  registry: Record<string, PdfFontFamily> = PDF_FONT_REGISTRY,
): ResolvedPdfFont {
  const mapping = Object.hasOwn(DOCUMENT_PDF_FONT_MAPPINGS, requestedDocumentFamily)
    ? DOCUMENT_PDF_FONT_MAPPINGS[requestedDocumentFamily as keyof typeof DOCUMENT_PDF_FONT_MAPPINGS]
    : DOCUMENT_PDF_FONT_MAPPINGS[DEFAULT_PDF_DOCUMENT_FAMILY];
  const requestedFamilyExists = Object.hasOwn(DOCUMENT_PDF_FONT_MAPPINGS, requestedDocumentFamily);
  const family = registry[mapping.familyId] ?? registry["LiberationSans"];
  if (!family) throw new Error("The native PDF font registry has no fallback sans-serif family");

  const requestedVariant = variantFor(style);
  const variant = FALLBACKS[requestedVariant].find((candidate) => family.variants[candidate]) ?? "regular";
  const diagnostic = !requestedFamilyExists
    ? `Unknown document font “${requestedDocumentFamily}”; ${family.displayName} is used.`
    : mapping.fidelity === "approximate"
      ? `Selected ${requestedDocumentFamily} is approximated with embedded ${family.displayName}.`
      : variant !== requestedVariant
        ? `${family.displayName} has no ${requestedVariant} face; ${variant} is used as an approximation.`
        : undefined;

  return {
    requestedDocumentFamily,
    family,
    requestedVariant,
    variant,
    asset: family.variants[variant],
    fidelity: requestedFamilyExists ? mapping.fidelity : "approximate",
    diagnostic,
  };
}
