import { describe, expect, it } from "vitest";
import { resolveDisplayPageNumbers } from "@/lib/document/page-numbering";
import type { PageNumberSettings } from "@/lib/document/settings";

function resolve(
  kinds: Array<"cover" | "content">,
  overrides: Partial<PageNumberSettings> = {},
) {
  const settings: PageNumberSettings = {
    enabled: true,
    position: "bottom-center",
    startAt: 1,
    excludeCover: false,
    ...overrides,
  };
  return resolveDisplayPageNumbers(kinds.map((kind) => ({ kind })), settings);
}

describe("logical page number projection", () => {
  it("numbers content pages from one when no cover exists", () => {
    expect(resolve(["content", "content", "content"])).toEqual([1, 2, 3]);
  });

  it("accepts zero and keeps advancing the logical sequence", () => {
    expect(resolve(["content", "content", "content"], { startAt: 0 })).toEqual([0, 1, 2]);
  });

  it("lets an included cover consume a number", () => {
    expect(resolve(["cover", "content", "content"], { excludeCover: false })).toEqual([1, 2, 3]);
  });

  it("excludes cover semantically and starts content at the configured value", () => {
    expect(resolve(["cover", "content", "content"], { excludeCover: true })).toEqual([null, 1, 2]);
    expect(resolve(["cover", "content", "content"], { startAt: 0, excludeCover: true })).toEqual([null, 0, 1]);
    expect(resolve(["content", "cover", "content"], { excludeCover: true })).toEqual([1, null, 2]);
  });

  it("does not add an offset when exclusion is enabled but no cover exists", () => {
    expect(resolve(["content", "content"], { excludeCover: true })).toEqual([1, 2]);
  });

  it("counts empty content pages and does not depend on decoration visibility", () => {
    expect(resolve(["content", "content", "content"], { enabled: false, startAt: 4 })).toEqual([4, 5, 6]);
  });

  it("counts leading and consecutive-break pages as ordinary physical content", () => {
    expect(resolve(["cover", "content", "content", "content"], { startAt: 0, excludeCover: true }))
      .toEqual([null, 0, 1, 2]);
  });
});
