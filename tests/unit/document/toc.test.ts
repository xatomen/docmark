import { describe, expect, it, vi } from "vitest";
import {
  getPhysicalHeadingPages,
  MAX_TOC_PAGINATION_PASSES,
  stabilizeTocPagination,
} from "@/lib/document/toc";

describe("physical TOC page mapping", () => {
  it("uses physical page positions, including blank pages", () => {
    expect(getPhysicalHeadingPages([
      { headingIds: ["before"] },
      { headingIds: [] },
      { headingIds: ["after"] },
    ])).toEqual({ before: 1, after: 3 });
  });

  it("stabilizes when the mapping used to render TOC rows equals the paginated mapping", () => {
    const paginate = vi.fn((pages: Readonly<Record<string, number>>) => ({
      result: `rendered-${pages.chapter}`,
      headingPages: { chapter: pages.chapter === 1 ? 2 : 2 },
    }));

    const result = stabilizeTocPagination(paginate, { chapter: 1 });

    expect(result).toMatchObject({ passes: 2, stabilized: true, stoppedBy: "stable", headingPages: { chapter: 2 } });
    expect(result.result).toBe("rendered-2");
  });

  it("stops on repeated mappings instead of oscillating forever", () => {
    const paginate = vi.fn((pages: Readonly<Record<string, number>>) => ({
      result: pages.chapter,
      headingPages: { chapter: pages.chapter === 1 ? 2 : 1 },
    }));

    const result = stabilizeTocPagination(paginate, { chapter: 1 });

    expect(result).toMatchObject({ passes: 2, stabilized: false, stoppedBy: "oscillation" });
    expect(paginate).toHaveBeenCalledTimes(2);
    expect(result.result).toBe(2);
  });

  it("caps non-converging pagination at five passes", () => {
    const paginate = vi.fn((pages: Readonly<Record<string, number>>) => ({
      result: pages.chapter,
      headingPages: { chapter: pages.chapter + 1 },
    }));

    const result = stabilizeTocPagination(paginate, { chapter: 1 });

    expect(MAX_TOC_PAGINATION_PASSES).toBe(5);
    expect(result).toMatchObject({ passes: 5, stabilized: false, stoppedBy: "max-passes" });
    expect(paginate).toHaveBeenCalledTimes(5);
  });

  it("settles an empty TOC in one pass", () => {
    const paginate = vi.fn(() => ({ result: "empty TOC", headingPages: {} }));
    expect(stabilizeTocPagination(paginate, {})).toMatchObject({
      passes: 1, stabilized: true, stoppedBy: "stable", result: "empty TOC",
    });
  });
});
