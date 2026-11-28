export const PDF_FONT_VARIANTS = ["regular", "bold", "italic", "boldItalic"] as const;
export type PdfFontVariant = (typeof PDF_FONT_VARIANTS)[number];
export type PdfFontCategory = "sans-serif" | "serif" | "monospace";
export type PdfFontFidelity = "exact" | "approximate";

export type PdfFontAsset = {
  path: `/fonts/${string}.ttf`;
  fileName: string;
  sha256: string;
};

export type PdfFontFamily = {
  id: string;
  displayName: string;
  internalFamilyName: string;
  category: PdfFontCategory;
  variants: Record<PdfFontVariant, PdfFontAsset>;
  license: { id: string; path: string; sourceUrl: string };
  provenance: { sourceUrl: string; version: string; notes: string };
};

export type DocumentPdfFontMapping = {
  familyId: string;
  fidelity: PdfFontFidelity;
  explanation?: string;
};

export type PdfTextStyle = { bold?: boolean; italic?: boolean };

export type ResolvedPdfFont = {
  requestedDocumentFamily: string;
  family: PdfFontFamily;
  requestedVariant: PdfFontVariant;
  variant: PdfFontVariant;
  asset: PdfFontAsset;
  fidelity: PdfFontFidelity;
  diagnostic?: string;
};

export type PdfMakeFontDescriptor = {
  normal: string;
  bold: string;
  italics: string;
  bolditalics: string;
};

export type FontResolutionPlan = {
  assets: PdfFontAsset[];
  fonts: Record<string, PdfMakeFontDescriptor>;
};

export type CodePointRange = readonly [start: number, end: number];

export type FontCoverageAsset = {
  sha256: string;
  bytes: number;
  codePoints: number;
  ranges: CodePointRange[];
};

export type PdfFontCoverageMetadata = {
  schemaVersion: 1;
  generator: string;
  fontToolsVersion: string;
  cmapPolicy: string;
  assets: Record<string, FontCoverageAsset>;
};

export type ResolvedTextRun = {
  text: string;
  /** PDF-visible text; set to a code-point marker only when no font covers the source cluster. */
  displayText?: string;
  /** An otherwise mapped cluster was rejected because the complete sequence needs unqualified shaping. */
  resolutionIssue?: "unqualified-sequence" | "unqualified-direction";
  familyId: string;
  variant: PdfFontVariant;
  fidelity: "exact" | "approximate" | "unresolved";
};

export type TextRunResolution = {
  runs: ResolvedTextRun[];
  diagnostics: string[];
};
