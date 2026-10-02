import { describe, expect, it, vi } from "vitest";
import { ensureDocumentFontReady } from "@/lib/document/font-loading";
import { DOCUMENT_FONT_REGISTRY } from "@/lib/document/font-registry";

function createFontFaceSet(load: FontFaceSetLike["load"] = async () => [
  { family: "Montserrat", status: "loaded" } as FontFace,
]): FontFaceSetLike {
  return {
    load,
    check: () => true,
    ready: Promise.resolve({} as FontFaceSet),
  };
}

type FontFaceSetLike = Pick<FontFaceSet, "load" | "check" | "ready">;

describe("bundled document font readiness", () => {
  it("does not request system fonts from the Font Loading API", async () => {
    const load = vi.fn(async (descriptor: string) => {
      void descriptor;
      return [] as FontFace[];
    });
    const fonts = createFontFaceSet(load);
    await expect(ensureDocumentFontReady(DOCUMENT_FONT_REGISTRY.Arial, 11, fonts)).resolves.toBe(true);
    expect(load).not.toHaveBeenCalled();
  });

  it("loads and verifies each bundled face using the selected size", async () => {
    const load = vi.fn(async (descriptor: string) => {
      void descriptor;
      return [{ family: "Montserrat", status: "loaded" } as FontFace];
    });
    const fonts = createFontFaceSet(load);

    await expect(ensureDocumentFontReady(DOCUMENT_FONT_REGISTRY.Montserrat, 14, fonts)).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
    expect(load.mock.calls.map(([descriptor]) => descriptor)).toEqual([
      '400 14pt "Montserrat"',
      '600 14pt "Montserrat"',
      '700 14pt "Montserrat"',
    ]);
  });

  it("treats missing faces and rejected loads as a recoverable fallback", async () => {
    const missing = createFontFaceSet(async () => []);
    await expect(ensureDocumentFontReady(DOCUMENT_FONT_REGISTRY.Montserrat, 11, missing)).resolves.toBe(false);

    const rejected = createFontFaceSet(async () => {
      throw new Error("local font unavailable");
    });
    await expect(ensureDocumentFontReady(DOCUMENT_FONT_REGISTRY.Montserrat, 11, rejected)).resolves.toBe(false);
  });

  it("uses cache after a successful load", async () => {
    const load = vi.fn(async (descriptor: string) => {
      void descriptor;
      return [{ family: "Montserrat", status: "loaded" } as FontFace];
    });
    const fonts = createFontFaceSet(load);
    await ensureDocumentFontReady(DOCUMENT_FONT_REGISTRY.Montserrat, 11, fonts);
    await ensureDocumentFontReady(DOCUMENT_FONT_REGISTRY.Montserrat, 16, fonts);
    expect(load).toHaveBeenCalledTimes(3);
  });
});
