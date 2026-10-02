import type { PaginatedPage } from "@/lib/document/pagination";

export type PageKind = "cover" | "content";
export type PhysicalPage = PaginatedPage & { kind: PageKind };

/** Add the optional cover to the shared physical page sequence. */
export function composePhysicalPages(
  contentPages: PaginatedPage[],
  coverEnabled: boolean,
  hasMarkdownContent: boolean,
): PhysicalPage[] {
  const body = coverEnabled && !hasMarkdownContent && contentPages.length === 1 && contentPages[0].isBlank
    ? []
    : contentPages;
  const pages: PhysicalPage[] = body.map((page) => ({ ...page, kind: "content" }));
  if (coverEnabled) {
    pages.unshift({
      id: "cover-page",
      kind: "cover",
      html: "",
      isBlank: false,
      overflowPx: 0,
      headingIds: [],
    });
  }
  return pages;
}
