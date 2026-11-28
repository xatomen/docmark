import {
  DEFAULT_PDF_DOCUMENT_FAMILY,
  DEFAULT_PDF_MONOSPACE_FAMILY,
  DOCUMENT_PDF_FONT_MAPPINGS,
  PDF_FONT_REGISTRY,
  type PdfFontFamilyId,
} from "./registry";
import type { PdfFontCoverageMetadata, PdfFontFamily, PdfFontVariant, ResolvedTextRun, TextRunResolution } from "./types";
import { fontAssetCoversText, GENERATED_FONT_COVERAGE, getCurrentFontCoverage } from "./coverage";
import { codePoints, formatCodePoint, requiresUnqualifiedDirection, segmentGraphemes } from "./unicode";

const VARIANT_ORDER: Record<PdfFontVariant, PdfFontVariant[]> = {
  regular: ["regular", "bold", "italic", "boldItalic"],
  bold: ["bold", "regular", "boldItalic", "italic"],
  italic: ["italic", "regular", "boldItalic", "bold"],
  boldItalic: ["boldItalic", "bold", "italic", "regular"],
};

const FAMILY_ORDER: Record<PdfFontFamily["category"], PdfFontFamilyId[]> = {
  "sans-serif": ["LiberationSans", "DocmarkSignatureSans", "LiberationSerif", "LiberationMono", "DejaVuMathTeXGyre", "NotoSansSymbols2"],
  serif: ["LiberationSerif", "LiberationSans", "DocmarkSignatureSans", "LiberationMono", "DejaVuMathTeXGyre", "NotoSansSymbols2"],
  monospace: ["LiberationMono", "LiberationSans", "DocmarkSignatureSans", "LiberationSerif", "DejaVuMathTeXGyre", "NotoSansSymbols2"],
};

function requiresUnqualifiedSequenceHandling(cluster: string): boolean {
  return codePoints(cluster).some((point) =>
    point === 0x200D || // zero-width joiner; emoji and script shaping are not qualified
    (point >= 0xFE00 && point <= 0xFE0F) || // variation selectors
    (point >= 0x1F3FB && point <= 0x1F3FF) || // emoji modifiers
    (point >= 0x1F1E6 && point <= 0x1F1FF) || // regional indicators
    point === 0x20E3 || // keycap sequences
    (point >= 0xE0020 && point <= 0xE007F) // emoji tag sequences
  );
}

export type PdfFontRequest = {
  familyId?: string;
  documentFamily?: string;
  variant?: PdfFontVariant;
};

function mergedRuns(runs: ResolvedTextRun[]): ResolvedTextRun[] {
  const result: ResolvedTextRun[] = [];
  for (const run of runs) {
    const previous = result.at(-1);
    if (previous && previous.familyId === run.familyId && previous.variant === run.variant && previous.fidelity === run.fidelity && previous.resolutionIssue === run.resolutionIssue) {
      previous.text += run.text;
      if (previous.displayText !== undefined || run.displayText !== undefined) {
        previous.displayText = (previous.displayText ?? "") + (run.displayText ?? run.text);
      }
    } else {
      result.push({ ...run });
    }
  }
  return result;
}

function clusterLabel(cluster: string): string {
  const points = codePoints(cluster);
  const printable = !requiresUnqualifiedDirection(cluster) && points.length <= 8 && [...cluster].every((character) => {
    const point = character.codePointAt(0)!;
    return point >= 0x20 && point !== 0x7F && !(point >= 0x80 && point <= 0x9F);
  });
  const label = printable ? `${JSON.stringify(cluster)} ` : "";
  return `${label}(${points.slice(0, 8).map(formatCodePoint).join(" ")}${points.length > 8 ? " …" : ""})`;
}

function fontCandidates(request: PdfFontRequest): { primary: PdfFontFamily; families: PdfFontFamily[]; label: string } {
  let primary: PdfFontFamily;
  let label: string;
  if (request.familyId && Object.hasOwn(PDF_FONT_REGISTRY, request.familyId)) {
    primary = PDF_FONT_REGISTRY[request.familyId as PdfFontFamilyId];
    label = request.familyId === DEFAULT_PDF_MONOSPACE_FAMILY ? "monospace code" : primary.displayName;
  } else {
    const requestedDocumentFamily = request.documentFamily ?? DEFAULT_PDF_DOCUMENT_FAMILY;
    const mapping = Object.hasOwn(DOCUMENT_PDF_FONT_MAPPINGS, requestedDocumentFamily)
      ? DOCUMENT_PDF_FONT_MAPPINGS[requestedDocumentFamily as keyof typeof DOCUMENT_PDF_FONT_MAPPINGS]
      : DOCUMENT_PDF_FONT_MAPPINGS[DEFAULT_PDF_DOCUMENT_FAMILY];
    primary = PDF_FONT_REGISTRY[mapping.familyId];
    label = requestedDocumentFamily;
  }
  const families = [...new Set([primary.id, ...FAMILY_ORDER[primary.category]])]
    .map((familyId) => PDF_FONT_REGISTRY[familyId as PdfFontFamilyId]);
  return { primary, families, label };
}

function resolveCluster(
  cluster: string,
  primary: PdfFontFamily,
  families: PdfFontFamily[],
  requestedVariant: PdfFontVariant,
  metadata: PdfFontCoverageMetadata,
): { run: ResolvedTextRun; stalePaths: string[] } {
  const stalePaths: string[] = [];
  const candidates = VARIANT_ORDER[requestedVariant].flatMap((variant) => families.map((family) => ({ family, variant })));
  // Line breaks are layout controls, not glyphs; retain them in the primary text stream.
  const isLineBreak = cluster === "\n" || cluster === "\r" || cluster === "\r\n";
  if (isLineBreak) {
    const availableVariant = VARIANT_ORDER[requestedVariant].find((variant) => primary.variants[variant]) ?? "regular";
    return {
      run: { text: cluster, familyId: primary.id, variant: availableVariant, fidelity: availableVariant === requestedVariant ? "exact" : "approximate" },
      stalePaths,
    };
  }
  if (requiresUnqualifiedSequenceHandling(cluster)) {
    return {
      run: {
        text: cluster,
        displayText: `[${codePoints(cluster).map(formatCodePoint).join("+")}]`,
        familyId: primary.id,
        variant: VARIANT_ORDER[requestedVariant].find((variant) => primary.variants[variant]) ?? "regular",
        fidelity: "unresolved",
        resolutionIssue: "unqualified-sequence",
      },
      stalePaths,
    };
  }
  if (requiresUnqualifiedDirection(cluster)) {
    return {
      run: {
        text: cluster,
        displayText: `[${codePoints(cluster).map(formatCodePoint).join("+")}]`,
        familyId: primary.id,
        variant: VARIANT_ORDER[requestedVariant].find((variant) => primary.variants[variant]) ?? "regular",
        fidelity: "unresolved",
        resolutionIssue: "unqualified-direction",
      },
      stalePaths,
    };
  }
  for (const { family, variant } of candidates) {
    const asset = family.variants[variant];
    if (!asset) continue;
    if (!getCurrentFontCoverage(asset, metadata)) {
      stalePaths.push(asset.path);
      continue;
    }
    if (fontAssetCoversText(asset, cluster, metadata)) {
      const onlyOneFace = new Set(Object.values(family.variants).map((face) => face.path)).size === 1;
      const styleApproximation = onlyOneFace && variant !== "regular";
      return {
        run: {
          text: cluster,
          familyId: family.id,
          variant,
          fidelity: family.id === primary.id && variant === requestedVariant && !styleApproximation ? "exact" : "approximate",
        },
        stalePaths,
      };
    }
  }
  const availableVariant = VARIANT_ORDER[requestedVariant].find((variant) => primary.variants[variant]) ?? "regular";
  return {
    run: {
      text: cluster,
      displayText: `[${codePoints(cluster).map(formatCodePoint).join("+")}]`,
      familyId: primary.id,
      variant: availableVariant,
      fidelity: "unresolved",
    },
    stalePaths,
  };
}

/** Resolve text by grapheme cluster without changing its code points or order. */
export function resolveTextToFontRuns(
  text: string,
  request: PdfFontRequest,
  metadata: PdfFontCoverageMetadata = GENERATED_FONT_COVERAGE,
): TextRunResolution {
  const { primary, families, label } = fontCandidates(request);
  const requestedVariant = request.variant ?? "regular";
  const runs: ResolvedTextRun[] = [];
  const diagnostics = new Set<string>();
  let diagnosticsTruncated = false;
  const addDiagnostic = (message: string) => {
    if (diagnostics.has(message)) return;
    if (diagnostics.size < 19) diagnostics.add(message);
    else diagnosticsTruncated = true;
  };
  const stalePaths = new Set<string>();
  for (const cluster of segmentGraphemes(text)) {
    const resolution = resolveCluster(cluster, primary, families, requestedVariant, metadata);
    resolution.stalePaths.forEach((path) => stalePaths.add(path));
    const { run } = resolution;
    runs.push(run);
    if (run.fidelity === "approximate" && run.familyId !== primary.id) {
      const fallbackFamily = PDF_FONT_REGISTRY[run.familyId as PdfFontFamilyId];
      const styleApproximation = new Set(Object.values(fallbackFamily.variants).map((face) => face.path)).size === 1 && requestedVariant !== "regular";
      addDiagnostic(`Unicode fallback uses ${fallbackFamily.displayName} for ${clusterLabel(cluster)} instead of the selected ${label} face.${styleApproximation ? ` Its single regular face approximates the requested ${requestedVariant} style.` : ""}`);
    } else if (run.fidelity === "approximate" && run.variant !== requestedVariant) {
      addDiagnostic(`${PDF_FONT_REGISTRY[run.familyId as PdfFontFamilyId].displayName} uses ${run.variant} for ${clusterLabel(cluster)} because the requested ${requestedVariant} face lacks coverage.`);
    }
    if (run.fidelity === "unresolved") {
      const reason = run.resolutionIssue === "unqualified-sequence"
        ? "No currently qualified shaping path supports this complete Unicode sequence"
        : run.resolutionIssue === "unqualified-direction"
          ? "Bidirectional ordering is not supported for this text"
        : "No configured native PDF font covers this grapheme";
      addDiagnostic(`${reason} ${clusterLabel(cluster)}. The PDF shows ${run.displayText} instead of the glyph; the semantic document and Markdown source are unchanged.`);
    }
  }
  for (const path of stalePaths) addDiagnostic(`Font coverage metadata is missing or stale for ${path}; fallback was not inferred from that face.`);
  if (diagnosticsTruncated) diagnostics.add("Additional font coverage diagnostics were omitted to keep the export warning list bounded.");
  return { runs: mergedRuns(runs), diagnostics: [...diagnostics] };
}

export function resolveTextForDocument(
  text: string,
  documentFamily: string,
  variant: PdfFontVariant = "regular",
  metadata: PdfFontCoverageMetadata = GENERATED_FONT_COVERAGE,
): TextRunResolution {
  return resolveTextToFontRuns(text, { documentFamily, variant }, metadata);
}
