import { describe, expect, it } from "vitest";
import {
  getMarginValidationError,
  getPageDimensions,
  getPageNumber,
  isPageNumberPosition,
  isDecorationAlignment,
  isDocumentFontFamily,
  isDocumentFontSize,
  isDocumentLineHeight,
  isDocumentTextAlignment,
  DOCUMENT_FONT_FAMILIES,
  DOCUMENT_FONT_SIZES,
  DOCUMENT_LINE_HEIGHTS,
  DOCUMENT_TEXT_ALIGNMENTS,
  isValidPageNumberStartAt,
  DEFAULT_DOCUMENT_SETTINGS,
  type PageSize,
} from "@/lib/document/settings";

describe("physical page settings", () => {
  it("defines closed, validated typography options and defaults matching the current document styles", () => {
    expect(DEFAULT_DOCUMENT_SETTINGS.typography).toEqual({ fontFamily: "Arial", fontSize: 11, lineHeight: 1.75, alignment: "left" });
    expect(DOCUMENT_FONT_FAMILIES.every(isDocumentFontFamily)).toBe(true);
    expect(DOCUMENT_FONT_SIZES.every(isDocumentFontSize)).toBe(true);
    expect(DOCUMENT_LINE_HEIGHTS.every(isDocumentLineHeight)).toBe(true);
    expect(DOCUMENT_TEXT_ALIGNMENTS.every(isDocumentTextAlignment)).toBe(true);
    expect(isDocumentFontFamily("Comic Sans Banana")).toBe(false);
    expect(isDocumentFontSize(10.5)).toBe(false);
    expect(isDocumentLineHeight(-1)).toBe(false);
    expect(isDocumentTextAlignment("diagonal")).toBe(false);
  });
  it("defaults headers and footers off with empty left-aligned text", () => {
    expect(DEFAULT_DOCUMENT_SETTINGS.header).toEqual({ enabled: false, text: "", alignment: "left" });
    expect(DEFAULT_DOCUMENT_SETTINGS.footer).toEqual({ enabled: false, text: "", alignment: "left" });
    expect(["left", "center", "right"].every(isDecorationAlignment)).toBe(true);
    expect(isDecorationAlignment("top")).toBe(false);
  });
  it("defaults page numbers off, centered, and starting at one", () => {
    expect(DEFAULT_DOCUMENT_SETTINGS.pageNumbers).toEqual({
      enabled: false,
      position: "bottom-center",
      startAt: 1,
    });
  });

  it("validates supported positions and positive safe integer start values", () => {
    expect(["bottom-left", "bottom-center", "bottom-right"].every(isPageNumberPosition)).toBe(true);
    expect(isPageNumberPosition("top-center")).toBe(false);
    expect([1, 5, 999999].every(isValidPageNumberStartAt)).toBe(true);
    expect([0, -1, 1.5, "5", Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]
      .every((value) => !isValidPageNumberStartAt(value))).toBe(true);
  });

  it("derives displayed numbers from the start value and physical page index", () => {
    expect(getPageNumber(1, 0)).toBe(1);
    expect(getPageNumber(1, 4)).toBe(5);
    expect(getPageNumber(5, 0)).toBe(5);
    expect(getPageNumber(5, 4)).toBe(9);
  });

  it.each<PageSize>(["a4", "letter"])("keeps %s portrait taller than it is wide", (pageSize) => {
    const dimensions = getPageDimensions(pageSize, "portrait");
    expect(dimensions.heightMm).toBeGreaterThan(dimensions.widthMm);
  });

  it.each<PageSize>(["a4", "letter"])("swaps %s dimensions in landscape", (pageSize) => {
    const portrait = getPageDimensions(pageSize, "portrait");
    const landscape = getPageDimensions(pageSize, "landscape");
    expect(landscape.widthMm).toBe(portrait.heightMm);
    expect(landscape.heightMm).toBe(portrait.widthMm);
  });

  it("rejects margin values above the documented limit", () => {
    expect(getMarginValidationError(
      { top: 20, right: 101, bottom: 20, left: 20 },
      getPageDimensions("a4", "portrait"),
    )).toMatch(/100 mm or less/i);
  });

  it("rejects negative or non-finite margins", () => {
    const dimensions = getPageDimensions("a4", "portrait");
    expect(getMarginValidationError(
      { top: -1, right: 20, bottom: 20, left: 20 }, dimensions,
    )).toMatch(/cannot be negative/i);
    expect(getMarginValidationError(
      { top: Number.NaN, right: 20, bottom: 20, left: 20 }, dimensions,
    )).toMatch(/valid number/i);
  });

  it("accepts finite nonnegative margins within the page", () => {
    expect(getMarginValidationError(
      { top: 12.5, right: 18, bottom: 12.5, left: 18 },
      getPageDimensions("letter", "landscape"),
    )).toBeNull();
  });
});
