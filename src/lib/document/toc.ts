export type TocPageMap = Readonly<Record<string, number>>;

export type TocPaginationPass<T> = {
  result: T;
  headingPages: TocPageMap;
};

export type TocStabilizationResult<T> = TocPaginationPass<T> & {
  passes: number;
  stabilized: boolean;
  stoppedBy: "stable" | "oscillation" | "max-passes";
};

export const MAX_TOC_PAGINATION_PASSES = 5;

export function getPhysicalHeadingPages(
  pages: ReadonlyArray<{ headingIds: readonly string[] }>,
): Record<string, number> {
  const mapping: Record<string, number> = {};
  pages.forEach((page, pageIndex) => {
    for (const id of page.headingIds) mapping[id] = pageIndex + 1;
  });
  return mapping;
}

function mappingSignature(mapping: TocPageMap): string {
  return JSON.stringify(Object.entries(mapping).sort(([left], [right]) => left.localeCompare(right)));
}

function sameMapping(left: TocPageMap, right: TocPageMap): boolean {
  return mappingSignature(left) === mappingSignature(right);
}

/**
 * Re-paginate only when physical heading pages differ from the page values
 * used to render the TOC. A repeated mapping stops oscillation deterministically.
 */
export function stabilizeTocPagination<T>(
  paginate: (tocPages: TocPageMap) => TocPaginationPass<T>,
  initialTocPages: TocPageMap,
  maxPasses = MAX_TOC_PAGINATION_PASSES,
): TocStabilizationResult<T> {
  const seenMappings = new Set<string>();
  let tocPages = initialTocPages;
  let lastPass: TocPaginationPass<T> | null = null;

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    seenMappings.add(mappingSignature(tocPages));
    lastPass = paginate(tocPages);

    if (sameMapping(tocPages, lastPass.headingPages)) {
      return { ...lastPass, passes: pass, stabilized: true, stoppedBy: "stable" };
    }

    if (seenMappings.has(mappingSignature(lastPass.headingPages))) {
      return { ...lastPass, passes: pass, stabilized: false, stoppedBy: "oscillation" };
    }

    tocPages = lastPass.headingPages;
  }

  if (!lastPass) {
    throw new Error("TOC pagination requires at least one pass.");
  }

  return {
    ...lastPass,
    passes: maxPasses,
    stabilized: false,
    stoppedBy: "max-passes",
  };
}
