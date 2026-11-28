import generatedCoverage from "./coverage.generated.json";
import { PDF_FONT_REGISTRY } from "./registry";
import type { CodePointRange, FontCoverageAsset, PdfFontCoverageMetadata, PdfFontAsset } from "./types";

export const GENERATED_FONT_COVERAGE = generatedCoverage as unknown as PdfFontCoverageMetadata;

export function getCurrentFontCoverage(
  asset: PdfFontAsset,
  metadata: PdfFontCoverageMetadata = GENERATED_FONT_COVERAGE,
): FontCoverageAsset | null {
  const generated = metadata.assets[asset.path];
  if (!generated || generated.sha256 !== asset.sha256) return null;
  return generated;
}

export function isInCodePointRanges(ranges: CodePointRange[], codePoint: number): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const [start, end] = ranges[middle];
    if (codePoint < start) high = middle - 1;
    else if (codePoint > end) low = middle + 1;
    else return true;
  }
  return false;
}

export function fontAssetCovers(
  asset: PdfFontAsset,
  codePoint: number,
  metadata: PdfFontCoverageMetadata = GENERATED_FONT_COVERAGE,
): boolean {
  const coverage = getCurrentFontCoverage(asset, metadata);
  return !!coverage && isInCodePointRanges(coverage.ranges, codePoint);
}

/** True only when the variant itself has current coverage for every scalar in the cluster. */
export function fontAssetCoversText(
  asset: PdfFontAsset,
  value: string,
  metadata: PdfFontCoverageMetadata = GENERATED_FONT_COVERAGE,
): boolean {
  const coverage = getCurrentFontCoverage(asset, metadata);
  if (!coverage) return false;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (!isInCodePointRanges(coverage.ranges, point)) return false;
  }
  return true;
}

export function findStaleCoveragePaths(metadata: PdfFontCoverageMetadata = GENERATED_FONT_COVERAGE): string[] {
  const stale: string[] = [];
  for (const family of Object.values(PDF_FONT_REGISTRY)) {
    for (const asset of Object.values(family.variants)) {
      if (!getCurrentFontCoverage(asset, metadata)) stale.push(asset.path);
    }
  }
  return [...new Set(stale)].sort();
}
