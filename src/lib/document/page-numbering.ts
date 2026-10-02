import type { PhysicalPage } from "@/lib/document/physical-pages";
import type { PageNumberSettings } from "@/lib/document/settings";

/** Project physical pages onto their logical/document display numbers. */
export function resolveDisplayPageNumbers(
  pages: ReadonlyArray<Pick<PhysicalPage, "kind">>,
  settings: Pick<PageNumberSettings, "startAt" | "excludeCover">,
): Array<number | null> {
  let nextDisplayPageNumber = settings.startAt;

  return pages.map((page) => {
    if (page.kind === "cover" && settings.excludeCover) return null;

    const displayPageNumber = nextDisplayPageNumber;
    nextDisplayPageNumber += 1;
    return displayPageNumber;
  });
}
