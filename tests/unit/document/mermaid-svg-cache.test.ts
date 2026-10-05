import { describe, expect, it, vi } from "vitest";
import { createMermaidSvgCacheKey, getOrCreateSanitizedSvg, SanitizedSvgCache } from "@/lib/document/mermaid-svg-cache";

describe("bounded sanitized Mermaid SVG cache", () => {
  it("reuses unchanged sources and only renders a changed source", async () => {
    const cache = new SanitizedSvgCache();
    const render = vi.fn(async (source: string) => `<svg>${source}</svg>`);
    const diagrams = ["flow A", "flow B", "flow C"];

    for (const source of diagrams) await getOrCreateSanitizedSvg(cache, `neutral-v1:${source}`, () => render(source));
    for (const source of diagrams) await getOrCreateSanitizedSvg(cache, `neutral-v1:${source}`, () => render(source));
    await getOrCreateSanitizedSvg(cache, "neutral-v1:flow B changed", () => render("flow B changed"));

    expect(render).toHaveBeenCalledTimes(4);
    expect(cache.stats()).toMatchObject({ hits: 3, misses: 4, entries: 4 });
  });

  it("includes renderer configuration version in cache keys", () => {
    expect(createMermaidSvgCacheKey("flowchart LR\nA --> B"))
      .toBe("mermaid-12-neutral-svg-v1:flowchart LR\nA --> B");
    expect(createMermaidSvgCacheKey("flowchart LR\nA --> B"))
      .not.toBe(createMermaidSvgCacheKey("flowchart LR\nA --> C"));
  });

  it("does not cache failed renders and recovers after the source becomes valid", async () => {
    const cache = new SanitizedSvgCache();
    const invalid = vi.fn(async () => { throw new Error("invalid diagram"); });
    await expect(getOrCreateSanitizedSvg(cache, "neutral-v1:bad", invalid)).rejects.toThrow("invalid diagram");
    await expect(getOrCreateSanitizedSvg(cache, "neutral-v1:bad", async () => "<svg/>"))
      .resolves.toMatchObject({ svg: "<svg/>", cacheHit: false });
    expect(cache.stats()).toMatchObject({ entries: 1, misses: 2 });
  });

  it("evicts least-recently-used entries and oversized values", () => {
    const cache = new SanitizedSvgCache(2, 8);
    cache.set("a", "1234");
    cache.set("b", "5678");
    expect(cache.get("a")).toBe("1234");
    cache.set("c", "abcd");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("1234");
    cache.set("oversized", "x".repeat(9));
    expect(cache.stats()).toMatchObject({ entries: 2, characters: 8 });
    expect(cache.get("oversized")).toBeUndefined();
  });
});
