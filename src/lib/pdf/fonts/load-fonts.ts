import type { PdfFontAsset } from "./types";

export type PdfFontFetch = (input: URL, init: RequestInit) => Promise<Response>;

export type PdfFontAssetLoader = {
  load(asset: PdfFontAsset): Promise<Uint8Array>;
};

const SHA256_PATTERN = /^[a-f\d]{64}$/i;
const TRUE_TYPE_SIGNATURES = ["\u0000\u0001\u0000\u0000", "true", "OTTO"];

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto SHA-256 is unavailable for PDF font validation");
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function hasTrueTypeSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  return TRUE_TYPE_SIGNATURES.includes(signature);
}

/** Create an origin-bound loader that validates bytes before session caching. */
export function createPdfFontAssetLoader(
  fetchFont: PdfFontFetch,
  getOrigin: () => string,
): PdfFontAssetLoader {
  const pendingOrValidated = new Map<string, Promise<Uint8Array>>();

  return {
    load(asset) {
      const cacheKey = `${asset.path}:${asset.sha256.toLowerCase()}`;
      const existing = pendingOrValidated.get(cacheKey);
      if (existing) return existing;

      const origin = getOrigin();
      const url = new URL(asset.path, origin);
      if (!asset.path.startsWith("/fonts/") || url.origin !== origin) {
        return Promise.reject(new Error("PDF fonts must be loaded from the application origin"));
      }
      if (!SHA256_PATTERN.test(asset.sha256)) {
        return Promise.reject(new Error(`Invalid registered SHA-256 for PDF font: ${asset.fileName}`));
      }

      const loading = fetchFont(url, {
        credentials: "same-origin",
        redirect: "error",
        // Bypass a cached stale HTTP 200 so a retry can obtain the current asset.
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Unable to load PDF font (${response.status}): ${asset.fileName}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (!bytes.byteLength) throw new Error(`PDF font response is empty: ${asset.fileName}`);
          if (!hasTrueTypeSignature(bytes)) throw new Error(`Malformed TrueType PDF font response: ${asset.fileName}`);
          const actualHash = await sha256Hex(bytes);
          if (actualHash !== asset.sha256.toLowerCase()) {
            throw new Error(`PDF font integrity check failed: ${asset.fileName}`);
          }
          return bytes;
        })
        .catch((error: unknown) => {
          if (pendingOrValidated.get(cacheKey) === loading) pendingOrValidated.delete(cacheKey);
          throw error;
        });
      pendingOrValidated.set(cacheKey, loading);
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
