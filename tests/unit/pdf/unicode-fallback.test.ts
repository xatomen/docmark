import { describe, expect, it } from "vitest";
import { createDocumentModel } from "@/lib/document-model";
import { buildPdfDefinition } from "@/lib/pdf/adapter";
import { findStaleCoveragePaths, fontAssetCovers, fontAssetCoversText, GENERATED_FONT_COVERAGE, getCurrentFontCoverage, isInCodePointRanges } from "@/lib/pdf/fonts/coverage";
import { PDF_FONT_REGISTRY } from "@/lib/pdf/fonts/registry";
import { resolveTextToFontRuns } from "@/lib/pdf/fonts/resolve-text-runs";
import { codePoints, segmentGraphemes } from "@/lib/pdf/fonts/unicode";
import type { PdfFontCoverageMetadata } from "@/lib/pdf/fonts/types";

describe("generated native PDF cmap coverage", () => {
  it("has current SHA-bound coverage for every distributed variant", () => {
    expect(findStaleCoveragePaths()).toEqual([]);
    for (const family of Object.values(PDF_FONT_REGISTRY)) {
      for (const asset of Object.values(family.variants)) {
        const coverage = getCurrentFontCoverage(asset);
        expect(coverage).not.toBeNull();
        expect(coverage?.sha256).toBe(asset.sha256);
        expect(coverage?.bytes).toBeGreaterThan(0);
        expect(coverage?.ranges.every(([start, end]) => start <= end && end <= 0x10FFFF && !(start <= 0xDFFF && end >= 0xD800))).toBe(true);
      }
    }
  });

  it("looks up inclusive compact range boundaries including supplementary code points", () => {
    const ranges: [number, number][] = [[0x20, 0x7E], [0x1F300, 0x1F30F]];
    expect(isInCodePointRanges(ranges, 0x20)).toBe(true);
    expect(isInCodePointRanges(ranges, 0x7E)).toBe(true);
    expect(isInCodePointRanges(ranges, 0x7F)).toBe(false);
    expect(isInCodePointRanges(ranges, 0x1F300)).toBe(true);
    expect(isInCodePointRanges(ranges, 0x1F30F)).toBe(true);
    expect(isInCodePointRanges(ranges, 0x1F310)).toBe(false);
  });

  it("uses actual variant-specific coverage rather than assuming faces match", () => {
    const serifItalic = PDF_FONT_REGISTRY.LiberationSerif.variants.italic;
    const serifBoldItalic = PDF_FONT_REGISTRY.LiberationSerif.variants.boldItalic;
    // The source font maps this private-use glyph only in the italic face.
    expect(fontAssetCovers(serifItalic, 0xF001)).toBe(true);
    expect(fontAssetCovers(serifBoldItalic, 0xF001)).toBe(false);
  });

  it("rejects missing or stale coverage instead of inferring that the face supports a glyph", () => {
    const asset = PDF_FONT_REGISTRY.LiberationSans.variants.regular;
    expect(getCurrentFontCoverage(asset, { ...GENERATED_FONT_COVERAGE, assets: {} })).toBeNull();
    const stale: PdfFontCoverageMetadata = {
      ...GENERATED_FONT_COVERAGE,
      assets: { ...GENERATED_FONT_COVERAGE.assets, [asset.path]: { ...GENERATED_FONT_COVERAGE.assets[asset.path], sha256: "0".repeat(64) } },
    };
    expect(getCurrentFontCoverage(asset, stale)).toBeNull();
    expect(fontAssetCoversText(asset, "A", stale)).toBe(false);
    const result = resolveTextToFontRuns("A", { documentFamily: "Arial" }, stale);
    expect(result.runs).toEqual([expect.objectContaining({ familyId: "DocmarkSignatureSans", fidelity: "approximate", text: "A" })]);
    expect(result.diagnostics.some((message) => message.includes("missing or stale"))).toBe(true);
  });
});

describe("grapheme segmentation without normalization", () => {
  it.each([
    ["ASCII", "plain text", ["p", "l", "a", "i", "n", " ", "t", "e", "x", "t"]],
    ["precomposed Spanish", "café", ["c", "a", "f", "é"]],
    ["decomposed Spanish", "cafe\u0301", ["c", "a", "f", "e\u0301"]],
    ["multiple marks", "a\u0308\u0304", ["a\u0308\u0304"]],
    ["supplementary character", "𝄞", ["𝄞"]],
    ["variation selector", "✈️", ["✈️"]],
    ["zero-width joiner sequence", "👩🏽‍💻", ["👩🏽‍💻"]],
    ["regional-indicator pair", "🇨🇱", ["🇨🇱"]],
    ["Hebrew word", "שלום", ["ש", "ל", "ו", "ם"]],
    ["Arabic word", "مرحبا", ["م", "ر", "ح", "ب", "ا"]],
    ["spaces and CRLF", "a \r\nb", ["a", " ", "\r\n", "b"]],
    ["empty input", "", []],
  ])("keeps %s grapheme boundaries intact", (_name, input, expected) => {
    expect(segmentGraphemes(input)).toEqual(expected);
  });

  it("does not split surrogate pairs while enumerating scalar values", () => {
    expect(codePoints("A𝄞😀")).toEqual([0x41, 0x1D11E, 0x1F600]);
  });
});

describe("deterministic coverage fallback and PDF text runs", () => {
  it("prefers the primary face for supported ASCII and merges adjacent compatible runs", () => {
    const result = resolveTextToFontRuns("Price: 123", { documentFamily: "Arial" });
    expect(result.runs).toEqual([{ text: "Price: 123", familyId: "LiberationSans", variant: "regular", fidelity: "exact" }]);
    expect(result.diagnostics).toEqual([]);
  });

  it("falls back based on actual cmap data for the ruble sign missing from Liberation Sans", () => {
    const primary = PDF_FONT_REGISTRY.LiberationSans.variants.regular;
    const fallback = PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.regular;
    expect(fontAssetCovers(primary, 0x20BD)).toBe(false);
    expect(fontAssetCovers(fallback, 0x20BD)).toBe(true);
    const result = resolveTextToFontRuns("A₽₽B", { documentFamily: "Arial" });
    expect(result.runs).toEqual([
      { text: "A", familyId: "LiberationSans", variant: "regular", fidelity: "exact" },
      { text: "₽₽", familyId: "DocmarkSignatureSans", variant: "regular", fidelity: "approximate" },
      { text: "B", familyId: "LiberationSans", variant: "regular", fidelity: "exact" },
    ]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toContain("U+20BD");
  });

  it.each([["∈", 0x2208], ["⇒", 0x21D2]] as const)("uses DejaVu Math TeX Gyre for measured mathematical gap %s", (symbol, codePoint) => {
    const primary = PDF_FONT_REGISTRY.LiberationSans.variants.regular;
    const fallback = PDF_FONT_REGISTRY.DejaVuMathTeXGyre.variants.regular;
    expect(fontAssetCovers(primary, codePoint)).toBe(false);
    expect(fontAssetCovers(fallback, codePoint)).toBe(true);
    const result = resolveTextToFontRuns(symbol, { documentFamily: "Arial" });
    expect(result.runs[0]).toMatchObject({ text: symbol, familyId: "DejaVuMathTeXGyre", fidelity: "approximate" });
    expect(result.diagnostics[0]).toContain("DejaVu Math TeX Gyre");
  });

  it.each([["🔒", 0x1F512], ["⚠", 0x26A0]] as const)("uses the qualified monochrome Noto glyph for standalone %s", (symbol, codePoint) => {
    const primary = PDF_FONT_REGISTRY.LiberationSans.variants.regular;
    const symbols = PDF_FONT_REGISTRY.NotoSansSymbols2.variants.regular;
    expect(fontAssetCovers(primary, codePoint)).toBe(false);
    expect(fontAssetCovers(symbols, codePoint)).toBe(true);
    const result = resolveTextToFontRuns(symbol, { documentFamily: "Arial" });
    expect(result.runs).toEqual([{ text: symbol, familyId: "NotoSansSymbols2", variant: "regular", fidelity: "approximate" }]);
    expect(result.diagnostics[0]).toContain("Noto Sans Symbols 2");
  });

  it("loads the single-face monochrome symbols asset only when a mapped glyph requires it", () => {
    const plain = resolveTextToFontRuns("plain", { documentFamily: "Arial" });
    const boldLock = resolveTextToFontRuns("🔒", { documentFamily: "Arial", variant: "bold" });
    expect(plain.runs[0].familyId).toBe("LiberationSans");
    expect(boldLock.runs[0]).toMatchObject({ familyId: "NotoSansSymbols2", variant: "regular", fidelity: "approximate" });
    expect(boldLock.diagnostics.some((message) => message.includes("requested bold, resolved regular") && message.includes("style approximation"))).toBe(true);
    const model = createDocumentModel("plain");
    const plan = buildPdfDefinition(model).fontPlan;
    expect(plan.assets.some(({ path }) => path === PDF_FONT_REGISTRY.NotoSansSymbols2.variants.regular.path)).toBe(false);
    const lockPlan = buildPdfDefinition(createDocumentModel("🔒")).fontPlan;
    expect(lockPlan.assets).toContainEqual(PDF_FONT_REGISTRY.NotoSansSymbols2.variants.regular);
  });

  it.each([
    ["emoji presentation selector", "⚠️", "[U+26A0+U+FE0F]"],
    ["skin tone and ZWJ", "👩🏽‍💻", "[U+1F469+U+1F3FD+U+200D+U+1F4BB]"],
    ["regional-indicator flag", "🇺🇳", "[U+1F1FA+U+1F1F3]"],
    ["keycap", "1️⃣", "[U+0031+U+FE0F+U+20E3]"],
  ])("does not infer rendering support for %s from individual cmap entries", (_label, sequence, marker) => {
    const result = resolveTextToFontRuns(sequence, { documentFamily: "Arial" });
    expect(result.runs).toEqual([expect.objectContaining({ text: sequence, displayText: marker, fidelity: "unresolved", resolutionIssue: "unqualified-sequence" })]);
    expect(result.diagnostics.join(" ")).toContain("Qualified shaping is unsupported");
    expect(result.runs.map(({ text }) => text).join("")).toBe(sequence);
  });

  it.each([
    ["Hebrew", "שלום", ["U+05E9", "U+05DC", "U+05D5", "U+05DD"]],
    ["Arabic", "مرحبا", ["U+0645", "U+0631", "U+062D", "U+0628", "U+0627"]],
    ["mixed Latin and Hebrew", "Hello (שלום), 123", ["U+05E9", "U+05DC", "U+05D5", "U+05DD"]],
    ["explicit bidi controls", "A\u202eB", ["U+202E"]],
  ])("uses visible code point markers for unqualified direction in %s", (_label, source, codePoints) => {
    const result = resolveTextToFontRuns(source, { documentFamily: "Arial" });
    expect(result.runs.map(({ text }) => text).join("")).toBe(source);
    expect(result.runs.filter(({ resolutionIssue }) => resolutionIssue === "unqualified-direction").length).toBeGreaterThan(0);
    const diagnostic = result.diagnostics.join(" ");
    expect(diagnostic).toContain(codePoints[0]);
    if (codePoints.length > 8) expect(diagnostic).toContain("…");
    const visibleMarkers = result.runs.filter(({ resolutionIssue }) => resolutionIssue === "unqualified-direction").map(({ displayText }) => displayText).join("");
    for (const codePoint of codePoints) expect(visibleMarkers).toContain(codePoint);
    expect(diagnostic).toContain("Bidirectional ordering is not supported");
    expect(result.runs.filter(({ resolutionIssue }) => resolutionIssue === "unqualified-direction")
      .every(({ displayText }) => /^(?:\[U\+[0-9A-F+]+\])+$/u.test(displayText ?? ""))).toBe(true);
  });

  it("rejects an unqualified ZWJ grapheme even if synthetic cmap metadata maps every scalar", () => {
    const sequence = "👩🏽‍💻";
    const asset = PDF_FONT_REGISTRY.NotoSansSymbols2.variants.regular;
    const actual = GENERATED_FONT_COVERAGE.assets[asset.path];
    const points = [...actual.ranges.flatMap(([start, end]) => Array.from({ length: end - start + 1 }, (_, index) => start + index)), ...codePoints(sequence)];
    const merged: [number, number][] = [];
    for (const point of [...new Set(points)].sort((left, right) => left - right)) {
      const previous = merged.at(-1);
      if (previous && point <= previous[1] + 1) previous[1] = point;
      else merged.push([point, point]);
    }
    const metadata: PdfFontCoverageMetadata = {
      ...GENERATED_FONT_COVERAGE,
      assets: { ...GENERATED_FONT_COVERAGE.assets, [asset.path]: { ...actual, ranges: merged } },
    };
    expect(fontAssetCoversText(asset, sequence, metadata)).toBe(true);
    const result = resolveTextToFontRuns(sequence, { documentFamily: "Arial" }, metadata);
    expect(result.runs[0]).toMatchObject({ fidelity: "unresolved", resolutionIssue: "unqualified-sequence" });
    expect(result.runs[0].displayText).toBe("[U+1F469+U+1F3FD+U+200D+U+1F4BB]");
  });

  it("keeps the monospace face primary and chooses a deterministic fallback only for its missing cluster", () => {
    const result = resolveTextToFontRuns("code ₽", { familyId: "LiberationMono" });
    expect(result.runs).toEqual([
      { text: "code ", familyId: "LiberationMono", variant: "regular", fidelity: "exact" },
      { text: "₽", familyId: "DocmarkSignatureSans", variant: "regular", fidelity: "approximate" },
    ]);
    expect(result.diagnostics[0]).toContain("monospace code face");
  });

  it("preserves requested emphasis while selecting a supporting variant where available", () => {
    const result = resolveTextToFontRuns("₽", { documentFamily: "Arial", variant: "boldItalic" });
    expect(result.runs[0]).toMatchObject({ familyId: "DocmarkSignatureSans", variant: "boldItalic", fidelity: "approximate" });
  });

  it("keeps CR, LF and CRLF as layout text rather than unresolved glyphs", () => {
    for (const newline of ["\n", "\r", "\r\n"]) {
      const result = resolveTextToFontRuns(`a${newline}b`, { documentFamily: "Arial" });
      expect(result.runs.map(({ text }) => text).join("")).toBe(`a${newline}b`);
      expect(result.runs.some(({ displayText }) => displayText)).toBe(false);
      expect(result.diagnostics).toEqual([]);
    }
  });

  it("uses actual variant coverage and reports an approximate style when no face supports it", () => {
    const glyph = String.fromCodePoint(0xF001);
    const result = resolveTextToFontRuns(glyph, { familyId: "LiberationSerif", variant: "boldItalic" });
    expect(result.runs[0]).toMatchObject({ familyId: "LiberationSerif", variant: "italic", fidelity: "approximate" });
    expect(result.diagnostics[0]).toContain("requested boldItalic, resolved italic");
    expect(fontAssetCovers(PDF_FONT_REGISTRY.LiberationSans.variants.boldItalic, 0xF001)).toBe(false);
    expect(fontAssetCovers(PDF_FONT_REGISTRY.LiberationSerif.variants.italic, 0xF001)).toBe(true);
  });

  it("never borrows a private-use glyph from an unrelated family", () => {
    const glyph = String.fromCodePoint(0xF001);
    const result = resolveTextToFontRuns(glyph, { documentFamily: "Arial", variant: "boldItalic" });
    expect(result.runs[0]).toMatchObject({
      familyId: "LiberationSans",
      fidelity: "unresolved",
      resolutionIssue: "private-use",
      displayText: "[U+F001]",
    });
    expect(result.diagnostics.join(" ")).toContain("Private-use fallback from unrelated font families is disabled");
  });

  it("reports the regular-face approximation for single-face fallback fonts", () => {
    const result = resolveTextToFontRuns("🔒", { familyId: "NotoSansSymbols2", variant: "bold" });
    expect(result.runs[0]).toMatchObject({ familyId: "NotoSansSymbols2", variant: "regular", fidelity: "approximate" });
    expect(result.diagnostics.join(" ")).toContain("requested bold, resolved regular");
    expect(result.diagnostics.join(" ")).toContain("style approximation");
  });

  it("does not break a grapheme cluster when the fallback lacks one combining mark", () => {
    const result = resolveTextToFontRuns("a\u0338", { documentFamily: "Arial" });
    expect(result.runs.map(({ text }) => text).join("")).toBe("a\u0338");
    expect(result.runs).toHaveLength(1);
  });

  it("passes decomposed source code points to the renderer without normalization", () => {
    const original = "cafe\u0301";
    const result = resolveTextToFontRuns(original, { documentFamily: "Arial" });
    expect(result.runs.map(({ text }) => text).join("")).toBe(original);
    expect(result.runs.map(({ text }) => text).join("").normalize("NFC")).not.toBe(original);
  });

  it("keeps source and semantic inline/code text unchanged through adapter generation", () => {
    const source = "Plain cafe\u0301; inline `cafe\u0301`.\n\n```txt\n    cafe\u0301\n```";
    const model = createDocumentModel(source);
    const before = structuredClone(model);
    const definition = buildPdfDefinition(model).definition;
    expect(model).toEqual(before);
    expect(JSON.stringify(definition)).toContain("cafe\u0301");
  });

  it("warns that NFD extraction may be canonically equivalent rather than exact, including code", () => {
    const model = createDocumentModel("NFC café; NFD cafe\u0301; code `cafe\u0301`.");
    const { diagnostics, definition } = buildPdfDefinition(model);
    const fidelity = diagnostics.filter(({ kind }) => kind === "fidelity");
    expect(fidelity).toHaveLength(1);
    expect(fidelity[0].message).toContain("code-point-identical");
    expect(fidelity[0].message).toContain("source Markdown for exact code retrieval");
    expect(JSON.stringify(definition)).toContain("cafe\u0301");
    expect(buildPdfDefinition(createDocumentModel("NFC café only")).diagnostics.some(({ kind }) => kind === "fidelity")).toBe(false);
  });

  it("bounds export diagnostics across many separate Markdown text nodes", () => {
    const source = Array.from({ length: 50 }, (_, index) => `${String.fromCodePoint(0x1F600 + index)} word${index}`).join(" ");
    const diagnostics = buildPdfDefinition(createDocumentModel(source)).diagnostics;
    expect(diagnostics.length).toBeLessThanOrEqual(20);
    expect(diagnostics.every(({ message }) => message.length <= 240)).toBe(true);
    expect(diagnostics.some(({ message }) => message.includes("maximum 20") || message.includes("50 occurrence(s)"))).toBe(true);
  });

  it("keeps an unsupported marker visible after more than twenty resolved fallback characters", () => {
    const fallbackText = "ԤԥԦԧԨԩԮԯ⁒⁰ⁱ₸₹₺₼₽KÅ⅄Ↄ∅▷◁ⱮⱯ";
    const fallbackCodePoints = codePoints(fallbackText);
    expect(fallbackCodePoints.length).toBeGreaterThan(20);
    for (const point of fallbackCodePoints) {
      expect(fontAssetCovers(PDF_FONT_REGISTRY.LiberationSans.variants.regular, point)).toBe(false);
      expect(fontAssetCovers(PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.regular, point)).toBe(true);
    }
    const { definition, diagnostics } = buildPdfDefinition(createDocumentModel(`${fallbackText}😀`));
    expect(JSON.stringify(definition)).toContain("[U+1F600]");
    expect(diagnostics.length).toBeLessThanOrEqual(20);
    expect(diagnostics.some(({ message }) => message.includes("U+1F600"))).toBe(true);
    expect(diagnostics.some(({ message }) => message.includes("Unicode fallback uses Docmark Signature Sans"))).toBe(true);
  });

  it("marks unqualified RTL text visibly in an actual Markdown adapter document", () => {
    const source = "Mixed: Hello (שלום), 123; Arabic: مرحبا.";
    const model = createDocumentModel(source);
    const before = structuredClone(model);
    const { diagnostics, definition } = buildPdfDefinition(model);
    const renderedText = JSON.stringify(definition);
    expect(model).toEqual(before);
    expect(renderedText).toContain("Hello");
    expect(renderedText).toContain("123");
    expect(renderedText).not.toContain("שלום");
    expect(renderedText).not.toContain("مرحبا");
    expect(renderedText).toContain("U+05E9");
    expect(renderedText).toContain("U+0645");
    expect(diagnostics.some(({ message }) => message.includes("Bidirectional ordering is not supported"))).toBe(true);
  });

  it("retains an unsupported cluster and reports its code point instead of deleting it", () => {
    const result = resolveTextToFontRuns("A∈😀B", { documentFamily: "Arial" });
    expect(result.runs.map(({ text }) => text).join("")).toBe("A∈😀B");
    expect(result.runs.filter(({ fidelity }) => fidelity === "unresolved").map(({ text }) => text).join("")).toBe("😀");
    expect(result.runs.find(({ fidelity }) => fidelity === "unresolved")?.displayText).toBe("[U+1F600]");
    expect(result.runs.some(({ text, familyId }) => text === "∈" && familyId === "DejaVuMathTeXGyre")).toBe(true);
    expect(result.diagnostics.some((message) => message.includes("No configured native PDF font covers") && message.includes("U+2208"))).toBe(false);
    expect(result.diagnostics.some((message) => message.includes("U+1F600"))).toBe(true);
    expect(result.diagnostics.filter((message) => message.includes("code-point markers")).every((message) => message.includes("source is unchanged"))).toBe(true);
  });

  it("keeps diagnostic output bounded for many unique missing clusters", () => {
    const symbols = String.fromCodePoint(...Array.from({ length: 80 }, (_, index) => 0x1F600 + index));
    const result = resolveTextToFontRuns(symbols, { documentFamily: "Arial" });
    expect(result.runs.map(({ text }) => text).join("")).toBe(symbols);
    expect(result.diagnostics.length).toBeLessThanOrEqual(20);
    expect(result.diagnostics.join(" ")).toContain("80 occurrence(s)");
    expect(result.diagnostics.join(" ")).toContain("U+1F600");
  });

  it("groups repeated fallback graphemes and retains a later unsupported-cluster warning", () => {
    const result = resolveTextToFontRuns("₽₽₽" + String.fromCodePoint(0x1F600), { documentFamily: "Arial" });
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]).toContain("No configured native PDF font covers");
    expect(result.diagnostics[0]).toContain("U+1F600");
    expect(result.diagnostics[1]).toContain("3 occurrence(s)");
    expect(result.diagnostics[1]).toContain("Docmark Signature Sans");
  });

  it("preserves bold, links, code whitespace and source text through the adapter", () => {
    const source = "[**Price ₽**](https://example.test/café) and `café`\n\n```txt\n    code café\n```";
    const model = createDocumentModel(source);
    model.settings.typography.fontFamily = "Arial";
    const before = structuredClone(model);
    const { definition } = buildPdfDefinition(model);
    expect(model).toEqual(before);
    const paragraph = definition.content[0] as { text: Record<string, unknown>[] };
    expect(paragraph.text).toContainEqual(expect.objectContaining({ text: "₽", font: "DocmarkSignatureSans", bold: true, link: "https://example.test/cafe%CC%81" }));
    expect(paragraph.text).toContainEqual(expect.objectContaining({ text: "Price ", font: "LiberationSans", bold: true, link: "https://example.test/cafe%CC%81" }));
    expect(paragraph.text.some(({ text }) => String(text).includes("cafe\u0301"))).toBe(true);
    const code = definition.content.find((block) => "preserveLeadingSpaces" in block) as { text: Record<string, unknown>[]; preserveLeadingSpaces: boolean };
    expect(code.preserveLeadingSpaces).toBe(true);
    expect(code.text.map(({ text }) => text).join("")).toBe("    code café");
    expect(code.text.every(({ font }) => ["LiberationMono", "DocmarkSignatureSans"].includes(String(font)))).toBe(true);
  });

  it("reports unavailable glyphs from actual semantic Markdown without changing the model", () => {
    const model = createDocumentModel("Unsupported: 😀 漢");
    const sourceBefore = structuredClone(model);
    const { diagnostics } = buildPdfDefinition(model);
    expect(model).toEqual(sourceBefore);
    expect(diagnostics.some(({ message }) => message.includes("U+1F600"))).toBe(true);
    const paragraph = buildPdfDefinition(model).definition.content[0] as { text: Record<string, unknown>[] };
    expect(diagnostics.some(({ message }) => message.includes("U+6F22"))).toBe(true);
    expect(paragraph.text.map(({ text }) => text).join("")).toContain("[U+1F600] [U+6F22]");
  });
});
