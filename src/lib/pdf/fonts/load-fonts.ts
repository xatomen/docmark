import type { PdfFontAsset } from "./types";

export type PdfFontFetch = (input: URL, init: RequestInit) => Promise<Response>;

export type PdfFontAssetLoader = {
  load(asset: PdfFontAsset): Promise<Uint8Array>;
};

/** Create an origin-bound loader with per-session deduplication and retry after failure. */
export function createPdfFontAssetLoader(
  fetchFont: PdfFontFetch,
  getOrigin: () => string,
): PdfFontAssetLoader {
  const pendingOrLoaded = new Map<string, Promise<Uint8Array>>();

  return {
    load(asset) {
      const existing = pendingOrLoaded.get(asset.path);
      if (existing) return existing;

      const origin = getOrigin();
      const url = new URL(asset.path, origin);
      if (!asset.path.startsWith("/fonts/") || url.origin !== origin) {
        return Promise.reject(new Error("PDF fonts must be loaded from the application origin"));
      }

      const loading = fetchFont(url, { credentials: "same-origin", redirect: "error" })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Unable to load PDF font (${response.status}): ${asset.fileName}`);
          return new Uint8Array(await response.arrayBuffer());
        })
        .catch((error: unknown) => {
          if (pendingOrLoaded.get(asset.path) === loading) pendingOrLoaded.delete(asset.path);
          throw error;
        });
      pendingOrLoaded.set(asset.path, loading);
      return loading;
    },
  };
}

const browserPdfFontLoader = createPdfFontAssetLoader(
  (url, init) => fetch(url, init),
  () => window.location.origin,
);

export async function loadPdfFontAssets(
  assets: PdfFontAsset[],
): Promise<Map<string, Uint8Array>> {
  const unique = [...new Map(assets.map((font) => [font.path, font])).values()];
  const loaded = await Promise.all(unique.map(async (font) => [font.path, await browserPdfFontLoader.load(font)] as const));
  return new Map(loaded);
}

export function fontBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
