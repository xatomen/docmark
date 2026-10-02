import type { DocumentFontDefinition } from "@/lib/document/font-registry";

type FontFaceSetLike = Pick<FontFaceSet, "load" | "check" | "ready">;

const loadedFonts = new WeakMap<object, Map<string, Promise<boolean>>>();

function getFontCache(fonts: FontFaceSetLike): Map<string, Promise<boolean>> {
  const key = fonts as object;
  let cache = loadedFonts.get(key);
  if (!cache) {
    cache = new Map();
    loadedFonts.set(key, cache);
  }
  return cache;
}

/** Load and verify every face used by the document before measuring its layout. */
export function ensureDocumentFontReady(
  font: DocumentFontDefinition,
  fontSize: number,
  fonts: FontFaceSetLike | undefined =
    typeof document === "undefined" ? undefined : document.fonts,
): Promise<boolean> {
  if (font.source === "system") return Promise.resolve(true);
  if (!font.loadFamily || !font.weights?.length || !fonts) return Promise.resolve(false);

  const cache = getFontCache(fonts);
  const existing = cache.get(font.loadFamily);
  if (existing) return existing;

  const loading = Promise.all(
    font.weights.map(async (weight) => {
      const descriptor = `${weight} ${fontSize}pt "${font.loadFamily}"`;
      const faces = await fonts.load(descriptor);
      const matchingFace = faces.find((face) =>
        face.family.replaceAll(/["']/g, "").trim() === font.loadFamily,
      );
      return Boolean(
        matchingFace &&
          matchingFace.status === "loaded" &&
          fonts.check(descriptor),
      );
    }),
  )
    .then(async (results) => {
      await fonts.ready;
      return results.every(Boolean);
    })
    .catch(() => false);

  cache.set(font.loadFamily, loading);
  void loading.then((available) => {
    if (!available && cache.get(font.loadFamily!) === loading) {
      cache.delete(font.loadFamily!);
    }
  });
  return loading;
}
