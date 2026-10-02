import { describe, expect, it } from "vitest";
import { DOCUMENT_THEMES, getDocumentThemeDefinition, isDocumentThemeId } from "@/lib/document/themes";

describe("document theme registry", () => {
  it("exposes four stable IDs and unique scoped classes", () => {
    expect(DOCUMENT_THEMES.map(({ id }) => id)).toEqual(["default", "technical", "academic", "minimal"]);
    expect(new Set(DOCUMENT_THEMES.map(({ className }) => className)).size).toBe(4);
  });

  it("rejects arbitrary IDs and safely falls back to Default", () => {
    expect(isDocumentThemeId("technical")).toBe(true);
    expect(isDocumentThemeId("user-css")).toBe(false);
    expect(getDocumentThemeDefinition("user-css")).toEqual(DOCUMENT_THEMES[0]);
  });
});
