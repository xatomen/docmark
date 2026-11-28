import {
  DEFAULT_PDF_DOCUMENT_FAMILY,
  DEFAULT_PDF_MONOSPACE_FAMILY,
  DOCUMENT_PDF_FONT_MAPPINGS,
  PDF_FONT_REGISTRY,
  type PdfFontFamilyId,
} from "./registry";
import type { PdfFontCoverageMetadata, PdfFontFamily, PdfFontVariant, ResolvedTextRun, TextRunResolution } from "./types";
import { fontAssetCoversText, GENERATED_FONT_COVERAGE, getCurrentFontCoverage } from "./coverage";
import { codePoints, containsPrivateUseCodePoint, formatCodePoint, requiresUnqualifiedDirection, segmentGraphemes } from "./unicode";

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
  const printable = !containsPrivateUseCodePoint(cluster) && !requiresUnqualifiedDirection(cluster)
    && !requiresUnqualifiedSequenceHandling(cluster) && points.length <= 8 && [...cluster].every((character) => {
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
  const privateUse = containsPrivateUseCodePoint(cluster);
  const allowedFamilies = privateUse ? [primary] : families;
  const allowedCandidates = VARIANT_ORDER[requestedVariant].flatMap((variant) => allowedFamilies.map((family) => ({ family, variant })));
  for (const { family, variant } of allowedCandidates) {
    const asset = family.variants[variant];
    if (!asset) continue;
    if (!getCurrentFontCoverage(asset, metadata)) {
      stalePaths.push(asset.path);
      continue;
    }
    if (fontAssetCoversText(asset, cluster, metadata)) {
      const onlyOneFace = new Set(Object.values(family.variants).map((face) => face.path)).size === 1;
      const resolvedVariant = onlyOneFace ? "regular" : variant;
      const styleApproximation = resolvedVariant !== requestedVariant;
      return {
        run: {
          text: cluster,
          familyId: family.id,
          variant: resolvedVariant,
          fidelity: family.id === primary.id && resolvedVariant === requestedVariant && !styleApproximation ? "exact" : "approximate",
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
      ...(privateUse ? { resolutionIssue: "private-use" as const } : {}),
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
  type DiagnosticGroup = { count: number; samples: string[] };
  const unresolvedGroups = new Map<string, DiagnosticGroup>();
  const variantGroups = new Map<string, DiagnosticGroup>();
  const fallbackGroups = new Map<string, DiagnosticGroup>();
  const stalePaths = new Set<string>();
  const addGroup = (groups: Map<string, DiagnosticGroup>, key: string, sample: string) => {
    const group = groups.get(key) ?? { count: 0, samples: [] };
    group.count += 1;
    if (!group.samples.includes(sample) && group.samples.length < 8) group.samples.push(sample);
    groups.set(key, group);
  };
  for (const cluster of segmentGraphemes(text)) {
    const resolution = resolveCluster(cluster, primary, families, requestedVariant, metadata);
    resolution.stalePaths.forEach((path) => stalePaths.add(path));
    const { run } = resolution;
    runs.push(run);
    if (run.fidelity === "approximate" && run.familyId !== primary.id) {
      addGroup(fallbackGroups, `${run.familyId}:${requestedVariant}:${run.variant}`, clusterLabel(cluster));
    } else if (run.fidelity === "approximate" && run.variant !== requestedVariant) {
      addGroup(variantGroups, `${run.familyId}:${requestedVariant}:${run.variant}`, clusterLabel(cluster));
    }
    if (run.fidelity === "unresolved") {
      addGroup(unresolvedGroups, run.resolutionIssue ?? "no-font", clusterLabel(cluster));
    }
  }

  const diagnostics: { priority: number; category: string; message: string }[] = [];
  const samples = (group: DiagnosticGroup) => {
    let result = "";
    for (const sample of group.samples) {
      const next = result ? `${result}, ${sample}` : sample;
      if (next.length > 150) break;
      result = next;
    }
    return `${group.count} occurrence(s): ${result}${group.count > group.samples.length || result.split(", ").length < group.samples.length ? ", …" : ""}`;
  };
  for (const [reason, group] of unresolvedGroups) {
    const message = reason === "unqualified-sequence"
      ? `Qualified shaping is unsupported (${samples(group)}). PDF shows code-point markers; source is unchanged.`
      : reason === "unqualified-direction"
        ? `Bidirectional ordering is not supported (${samples(group)}). PDF shows code-point markers; source is unchanged.`
        : reason === "private-use"
          ? `Private-use fallback from unrelated font families is disabled (${samples(group)}). PDF shows code-point markers; source is unchanged.`
          : `No configured native PDF font covers ${samples(group)}. PDF shows code-point markers; source is unchanged.`;
    diagnostics.push({
      priority: 0,
      category: "unsupported text",
      message,
    });
  }
  for (const path of stalePaths) {
    diagnostics.push({
      priority: 1,
      category: "stale coverage",
      message: `Font coverage metadata is missing or stale for ${path}; fallback was not inferred from that face.`,
    });
  }
  for (const [key, group] of variantGroups) {
    const [familyId, requested, resolved] = key.split(":");
    const family = PDF_FONT_REGISTRY[familyId as PdfFontFamilyId];
    const singleFace = new Set(Object.values(family.variants).map((face) => face.path)).size === 1;
    diagnostics.push({
      priority: 2,
      category: "variant approximations",
      message: `${family.displayName} uses ${resolved} for ${samples(group)}; requested ${requested}, resolved ${resolved}. The requested variant lacks glyph coverage${singleFace ? "; its single regular face provides a style approximation" : ""}.`,
    });
  }
  for (const [key, group] of fallbackGroups) {
    const [familyId, requested, resolved] = key.split(":");
    const family = PDF_FONT_REGISTRY[familyId as PdfFontFamilyId];
    diagnostics.push({
      priority: 3,
      category: "successful font fallbacks",
      message: `Unicode fallback uses ${family.displayName} instead of the selected ${label} face for ${samples(group)}; requested ${requested}, resolved ${resolved}${resolved !== requested ? ` (style approximation)` : ""}.`,
    });
  }
  const bounded = diagnostics.slice(0, 19).map(({ message }) => message);
  const omitted = diagnostics.slice(19);
  if (omitted.length) {
    const categories = new Map<string, number>();
    for (const entry of omitted) categories.set(entry.category, (categories.get(entry.category) ?? 0) + 1);
    const summary = [...categories].map(([category, count]) => `${count} ${category}`).join(", ");
    bounded.push(`Additional font diagnostics omitted to keep the warning list bounded (maximum 20): ${summary}.`);
  }
  return { runs: mergedRuns(runs), diagnostics: bounded };
}

export function resolveTextForDocument(
  text: string,
  documentFamily: string,
  variant: PdfFontVariant = "regular",
  metadata: PdfFontCoverageMetadata = GENERATED_FONT_COVERAGE,
): TextRunResolution {
  return resolveTextToFontRuns(text, { documentFamily, variant }, metadata);
}
