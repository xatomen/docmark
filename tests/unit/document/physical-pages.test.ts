import { describe, expect, it } from "vitest";
import { composePhysicalPages } from "@/lib/document/physical-pages";
import type { PaginatedPage } from "@/lib/document/pagination";

const page = (id: string, headingIds: string[] = [], isBlank = false): PaginatedPage => ({
  id, html: isBlank ? "" : "<h1>Heading</h1>", isBlank, overflowPx: 0, headingIds,
});

describe("physical page composition", () => {
  it("prepends a cover and shifts content headings by the physical page count", () => {
    const pages = composePhysicalPages([page("page-1", ["intro"]), page("page-2", ["next"])], true, true);
    expect(pages.map(({ kind }) => kind)).toEqual(["cover", "content", "content"]);
    expect(pages.map(({ id }) => id)).toEqual(["cover-page", "page-1", "page-2"]);
    expect(pages[1].headingIds).toEqual(["intro"]);
  });

  it("keeps exactly one physical page for an enabled cover and empty Markdown", () => {
    expect(composePhysicalPages([page("page-1", [], true)], true, false)).toMatchObject([
      { kind: "cover", id: "cover-page" },
    ]);
  });

  it("leaves legacy content page composition unchanged", () => {
    expect(composePhysicalPages([page("page-1")], false, true)).toMatchObject([
      { kind: "content", id: "page-1" },
    ]);
  });
});
