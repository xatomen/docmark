export type DocumentFontDefinition = {
  id: string;
  label: string;
  cssFamily: string;
  source: "system" | "bundled";
  loadFamily?: string;
  weights?: readonly number[];
};

export const DOCUMENT_FONT_REGISTRY = {
  Arial: {
    id: "Arial",
    label: "Arial",
    cssFamily: "Arial, Helvetica, sans-serif",
    source: "system",
  },
  Helvetica: {
    id: "Helvetica",
    label: "Helvetica",
    cssFamily: "Helvetica, Arial, sans-serif",
    source: "system",
  },
  Georgia: {
    id: "Georgia",
    label: "Georgia",
    cssFamily: 'Georgia, "Times New Roman", serif',
    source: "system",
  },
  "Times New Roman": {
    id: "Times New Roman",
    label: "Times New Roman",
    cssFamily: '"Times New Roman", Times, serif',
    source: "system",
  },
  "Courier New": {
    id: "Courier New",
    label: "Courier New",
    cssFamily: '"Courier New", Courier, monospace',
    source: "system",
  },
  Montserrat: {
    id: "Montserrat",
    label: "Montserrat",
    cssFamily: '"Montserrat", Arial, sans-serif',
    source: "bundled",
    loadFamily: "Montserrat",
    weights: [400, 600, 700],
  },
} as const satisfies Record<string, DocumentFontDefinition>;

export type DocumentFontFamily = keyof typeof DOCUMENT_FONT_REGISTRY;

export const DOCUMENT_FONT_FAMILIES = Object.keys(
  DOCUMENT_FONT_REGISTRY,
) as DocumentFontFamily[];

export function getDocumentFontDefinition(
  fontFamily: DocumentFontFamily,
): DocumentFontDefinition {
  return DOCUMENT_FONT_REGISTRY[fontFamily];
}

export function getDocumentFontStack(fontFamily: DocumentFontFamily): string {
  return getDocumentFontDefinition(fontFamily).cssFamily;
}
