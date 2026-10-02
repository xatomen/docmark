export type PageSize = "a4" | "letter";

export type PageOrientation = "portrait" | "landscape";

export type PageMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type PageNumberPosition = "bottom-left" | "bottom-center" | "bottom-right";

export type PageNumberSettings = {
  enabled: boolean;
  position: PageNumberPosition;
  startAt: number;
};

export type DecorationAlignment = "left" | "center" | "right";

export type HeaderFooterSettings = {
  enabled: boolean;
  text: string;
  alignment: DecorationAlignment;
};

export type DocumentSettings = {
  pageSize: PageSize;
  orientation: PageOrientation;
  margins: PageMargins;
  pageNumbers: PageNumberSettings;
  header: HeaderFooterSettings;
  footer: HeaderFooterSettings;
};

export type PageDimensions = {
  widthMm: number;
  heightMm: number;
};

export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  pageSize: "a4",
  orientation: "portrait",
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  pageNumbers: { enabled: false, position: "bottom-center", startAt: 1 },
  header: { enabled: false, text: "", alignment: "left" },
  footer: { enabled: false, text: "", alignment: "left" },
};

export function isDecorationAlignment(value: unknown): value is DecorationAlignment {
  return value === "left" || value === "center" || value === "right";
}

export function isPageNumberPosition(value: unknown): value is PageNumberPosition {
  return value === "bottom-left" || value === "bottom-center" || value === "bottom-right";
}

export function isValidPageNumberStartAt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

export function getPageNumber(displayStartAt: number, physicalPageIndex: number): number {
  return displayStartAt + physicalPageIndex;
}

export const MAX_PAGE_MARGIN_MM = 100;

const PAGE_DIMENSIONS_MM: Record<PageSize, PageDimensions> = {
  a4: { widthMm: 210, heightMm: 297 },
  letter: { widthMm: 215.9, heightMm: 279.4 },
};

export function getPageDimensions(
  pageSize: PageSize,
  orientation: PageOrientation,
): PageDimensions {
  const dimensions = PAGE_DIMENSIONS_MM[pageSize];

  if (orientation === "landscape") {
    return {
      widthMm: dimensions.heightMm,
      heightMm: dimensions.widthMm,
    };
  }

  return dimensions;
}

export function getMarginValidationError(
  margins: PageMargins,
  dimensions: PageDimensions,
): string | null {
  const values = Object.values(margins);

  if (values.some((value) => !Number.isFinite(value))) {
    return "Enter a valid number for each margin.";
  }

  if (values.some((value) => value < 0)) {
    return "Margins cannot be negative.";
  }

  if (values.some((value) => value > MAX_PAGE_MARGIN_MM)) {
    return `Each margin must be ${MAX_PAGE_MARGIN_MM} mm or less.`;
  }

  if (margins.left + margins.right >= dimensions.widthMm) {
    return "Left and right margins must leave room for document content.";
  }

  if (margins.top + margins.bottom >= dimensions.heightMm) {
    return "Top and bottom margins must leave room for document content.";
  }

  return null;
}
