import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDocumentModel } from "@/lib/document-model";
import { DOCUMENT_FONT_FAMILIES } from "@/lib/document/settings";
import { createPdfFontAssetLoader } from "@/lib/pdf/fonts/load-fonts";
import { buildPdfDefinition } from "@/lib/pdf/adapter";
import {
  DEFAULT_PDF_DOCUMENT_FAMILY,
  DOCUMENT_PDF_FONT_MAPPINGS,
  PDF_FONT_REGISTRY,
} from "@/lib/pdf/fonts/registry";
import { resolvePdfFont } from "@/lib/pdf/fonts/resolve-font";
import type { PdfFontAsset, PdfFontFamily } from "@/lib/pdf/fonts/types";

describe("native PDF font registry and resolution", () => {
  it("verifies the specific license attribution and notice path for every registered PDF family", () => {
    for (const family of Object.values(PDF_FONT_REGISTRY)) {
      const licenseText = readFileSync(join(process.cwd(), "public", family.license.path.slice(1)), "utf8");
      expect(licenseText).toContain(family.license.attribution);
      if (family.license.id === "SIL-OFL-1.1") {
        expect(licenseText).toContain("SIL OPEN FONT LICENSE Version 1.1");
      } else {
        expect(family.license.id).toBe("Bitstream-Vera");
        expect(licenseText).toContain("Bitstream, Inc.");
        expect(licenseText).toContain("Permission is hereby granted");
      }
      expect(family.provenance.sourceUrl).toMatch(/^https:\/\//);
      expect(family.provenance.version.length).toBeGreaterThan(0);
    }
  });

  it("has a deterministic licensed static TrueType face for every current document family", () => {
    expect(Object.keys(DOCUMENT_PDF_FONT_MAPPINGS).sort()).toEqual([...DOCUMENT_FONT_FAMILIES].sort());
    expect(DEFAULT_PDF_DOCUMENT_FAMILY).toBe("Arial");
    for (const documentFamily of DOCUMENT_FONT_FAMILIES) {
      const mapping = DOCUMENT_PDF_FONT_MAPPINGS[documentFamily];
      const family = PDF_FONT_REGISTRY[mapping.familyId];
      expect(family).toBeDefined();
      expect(family.internalFamilyName.length).toBeGreaterThan(0);
      expect(family.license.id).toBe("SIL-OFL-1.1");
      expect(family.license.path).toMatch(/^\/fonts\/.+OFL\.txt$/);
      const licenseText = readFileSync(join(process.cwd(), "public", family.license.path.slice(1)), "utf8");
      expect(licenseText).toContain(family.license.attribution);
      expect(licenseText).toContain("SIL OPEN FONT LICENSE Version 1.1");
      for (const asset of Object.values(family.variants)) {
        expect(asset.path).toMatch(/\.ttf$/);
        expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });

  it("checks the registered Noto attribution against the Noto font and Debian package notices", () => {
    const family = PDF_FONT_REGISTRY.NotoSansSymbols2;
    const license = readFileSync(join(process.cwd(), "public", family.license.path.slice(1)), "utf8");
    const packageNotice = readFileSync("public/fonts/pdf/noto-sans-symbols2/COPYRIGHT.txt", "utf8");
    expect(family.license.attribution).toBe("Copyright 2017 Google Inc. All Rights Reserved.");
    expect(license).toContain(family.license.attribution);
    expect(license).not.toContain("Montserrat");
    expect(packageNotice).toContain("2010,2012-2020, Google Inc.");
    expect(packageNotice).toContain("2015-2020, Google LLC.");
    expect(family.provenance.version).toContain("20201225-2");
  });

  it.each([
    ["Arial", "LiberationSans", "approximate"],
    ["Helvetica", "LiberationSans", "approximate"],
    ["Georgia", "LiberationSerif", "approximate"],
    ["Times New Roman", "LiberationSerif", "approximate"],
    ["Courier New", "LiberationMono", "approximate"],
    ["Montserrat", "DocmarkSignatureSans", "exact"],
  ] as const)("maps %s to %s (%s)", (documentFamily, expectedFamily, fidelity) => {
    const result = resolvePdfFont(documentFamily);
    expect(result.family.id).toBe(expectedFamily);
    expect(result.fidelity).toBe(fidelity);
    expect(result.variant).toBe("regular");
    expect(Boolean(result.diagnostic)).toBe(fidelity === "approximate");
    if (fidelity === "approximate") expect(result.diagnostic).toContain("embedded");
  });

  it.each([
    [{}, "regular"],
    [{ bold: true }, "bold"],
    [{ italic: true }, "italic"],
    [{ bold: true, italic: true }, "boldItalic"],
  ] as const)("resolves each regular and emphasized face", (style, variant) => {
    const result = resolvePdfFont("Montserrat", style);
    expect(result.requestedVariant).toBe(variant);
    expect(result.variant).toBe(variant);
    expect(result.family.variants[variant]).toEqual(result.asset);
    expect(result.diagnostic).toBeUndefined();
  });

  it("uses a deterministic explicit fallback when a requested face is absent", () => {
    const incomplete = {
      ...PDF_FONT_REGISTRY,
      DocmarkSignatureSans: {
        ...PDF_FONT_REGISTRY.DocmarkSignatureSans,
        variants: {
          regular: PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.regular,
          bold: PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.bold,
          italic: PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.italic,
        },
      },
    } as unknown as Record<string, PdfFontFamily>;
    const result = resolvePdfFont("Montserrat", { bold: true, italic: true }, incomplete);
    expect(result.requestedVariant).toBe("boldItalic");
    expect(result.variant).toBe("bold");
    expect(result.asset).toEqual(PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.bold);
    expect(result.diagnostic).toContain("boldItalic face");
  });

  it("falls back to the default document family for an unknown saved font value", () => {
    const result = resolvePdfFont("Unknown Family");
    expect(result.family.id).toBe("LiberationSans");
    expect(result.diagnostic).toContain("Unknown document font");
  });

  it("plans only actually used family variants and a dedicated mono face when code is present", () => {
    const model = createDocumentModel("# Título\n\nplain **bold**, *italic*, ***both*** and `inline`.\n\n```js\n  const code = true;\n```");
    model.settings.typography.fontFamily = "Montserrat";
    const { fontPlan: plan, diagnostics, definition } = buildPdfDefinition(model);
    expect(definition.defaultStyle.font).toBe("DocmarkSignatureSans");
    expect(Object.keys(plan.fonts).sort()).toEqual(["DocmarkSignatureSans", "LiberationMono"].sort());
    const loadedPaths = plan.assets.map(({ path }) => path).sort();
    expect(loadedPaths).toEqual([
      PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.regular.path,
      PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.bold.path,
      PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.italic.path,
      PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.boldItalic.path,
      PDF_FONT_REGISTRY.LiberationMono.variants.regular.path,
    ].sort());
    expect(diagnostics.some(({ message }) => message.includes("Code uses the local Liberation Mono typeface"))).toBe(true);
    expect(diagnostics.some(({ message }) => message.includes("Montserrat is approximated"))).toBe(false);
  });

  it("applies selected fonts to heading and inline runs, code to mono, and does not mutate settings", () => {
    const model = createDocumentModel("# Título\n\nNormal, **bold**, *italic*, ***both***, `inlineCode`.\n\n```txt\n  fencedCode\n```");
    model.settings.typography.fontFamily = "Georgia";
    const originalSettings = structuredClone(model.settings);
    const { definition, diagnostics } = buildPdfDefinition(model);
    expect(definition.defaultStyle.font).toBe("LiberationSerif");
    expect(definition.content[0]).toMatchObject({ bold: true });
    const paragraph = definition.content[1] as { text: Record<string, unknown>[] };
    expect(paragraph.text).toContainEqual(expect.objectContaining({ text: "bold", font: "LiberationSerif", bold: true }));
    expect(paragraph.text).toContainEqual(expect.objectContaining({ text: "italic", font: "LiberationSerif", italics: true }));
    expect(paragraph.text).toContainEqual(expect.objectContaining({ text: "both", font: "LiberationSerif", bold: true, italics: true }));
    expect(paragraph.text).toContainEqual(expect.objectContaining({ text: "inlineCode", font: "LiberationMono" }));
    expect(definition.content[2]).toMatchObject({ font: "LiberationMono", text: [{ text: "  fencedCode", font: "LiberationMono" }] });
    expect(diagnostics.some(({ message }) => message.includes("Selected Georgia is approximated with embedded Liberation Serif."))).toBe(true);
    expect(model.settings).toEqual(originalSettings);
  });

  it("does not request the mono files when the semantic document has no code", () => {
    const plan = buildPdfDefinition(createDocumentModel("Text only")).fontPlan;
    expect(plan.assets.every(({ path }) => !path.includes("LiberationMono"))).toBe(true);
    expect(Object.keys(plan.fonts)).toEqual(["LiberationSans"]);
  });

  it("plans only monospace for code-only documents while retaining the default face for list markers", () => {
    const codeOnly = buildPdfDefinition(createDocumentModel("```txt\nconst value = 1;\n```"));
    expect(codeOnly.fontPlan.assets.map(({ path }) => path)).toEqual([
      PDF_FONT_REGISTRY.LiberationMono.variants.regular.path,
    ]);
    expect(Object.keys(codeOnly.fontPlan.fonts)).toEqual(["LiberationMono"]);

    const listWithCode = buildPdfDefinition(createDocumentModel("- `monoToken`"));
    expect(listWithCode.fontPlan.assets.map(({ path }) => path).sort()).toEqual([
      PDF_FONT_REGISTRY.LiberationSans.variants.regular.path,
      PDF_FONT_REGISTRY.LiberationMono.variants.regular.path,
    ].sort());
  });

  it("derives exact required face assets from mixed fallback runs and source formatting", () => {
    const model = createDocumentModel("**bold ₽**, *italic ₽*, ***both ₽***; ∈ ⇒ 🔒.\n\n```txt\n  mono\n```");
    const { fontPlan, definition } = buildPdfDefinition(model);
    const paths = fontPlan.assets.map(({ path }) => path).sort();
    expect(paths).toEqual([
      PDF_FONT_REGISTRY.LiberationSans.variants.regular.path,
      PDF_FONT_REGISTRY.LiberationSans.variants.bold.path,
      PDF_FONT_REGISTRY.LiberationSans.variants.italic.path,
      PDF_FONT_REGISTRY.LiberationSans.variants.boldItalic.path,
      PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.bold.path,
      PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.italic.path,
      PDF_FONT_REGISTRY.DocmarkSignatureSans.variants.boldItalic.path,
      PDF_FONT_REGISTRY.DejaVuMathTeXGyre.variants.regular.path,
      PDF_FONT_REGISTRY.NotoSansSymbols2.variants.regular.path,
      PDF_FONT_REGISTRY.LiberationMono.variants.regular.path,
    ].sort());
    expect(Object.keys(fontPlan.fonts).sort()).toEqual([
      "LiberationSans", "DocmarkSignatureSans", "DejaVuMathTeXGyre", "NotoSansSymbols2", "LiberationMono",
    ].sort());
    expect(JSON.stringify(definition)).toContain('"bold":true');
    expect(JSON.stringify(definition)).toContain('"italics":true');
    expect(paths.some((path) => path.includes("liberation-serif"))).toBe(false);
  });
});

describe("origin-bound font asset loader", () => {
  const asset = PDF_FONT_REGISTRY.LiberationSans.variants.regular;
  const validFontBytes = new Uint8Array(readFileSync(join(process.cwd(), "public", asset.path.slice(1))));
  const freshResponse = (bytes: Uint8Array) => new Response(bytes.slice(), { status: 200 });

  it("validates actual registered font bytes once and deduplicates concurrent and repeated loads", async () => {
    const fetch = vi.fn(async () => freshResponse(validFontBytes));
    const loader = createPdfFontAssetLoader(fetch, () => "https://docmark.test");
    const first = loader.load(asset);
    const second = loader.load(asset);
    expect(second).toBe(first);
    await expect(first).resolves.toEqual(validFontBytes);
    await loader.load(asset);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(new URL(asset.path, "https://docmark.test"), {
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
    });
  });

  it.each([
    ["empty", new Uint8Array(), "response is empty"],
    ["malformed", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), "Malformed TrueType"],
    ["hash-mismatched", new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "integrity check failed"],
  ])("rejects %s HTTP 200 font response", async (_label, bytes, message) => {
    const fetch = vi.fn(async () => freshResponse(bytes));
    const loader = createPdfFontAssetLoader(fetch, () => "https://docmark.test");
    await expect(loader.load(asset)).rejects.toThrow(message);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("clears an invalid HTTP 200 from memory and bypasses browser cache on retry", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(freshResponse(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])))
      .mockResolvedValueOnce(freshResponse(validFontBytes));
    const loader = createPdfFontAssetLoader(fetch, () => "https://docmark.test");
    await expect(loader.load(asset)).rejects.toThrow("integrity check failed");
    await expect(loader.load(asset)).resolves.toEqual(validFontBytes);
    await loader.load(asset);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([, init]) => init.cache === "no-store")).toBe(true);
  });

  it("clears a failed HTTP request so the same font can be retried", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("offline", { status: 503 }))
      .mockResolvedValueOnce(freshResponse(validFontBytes));
    const loader = createPdfFontAssetLoader(fetch, () => "https://docmark.test");
    await expect(loader.load(asset)).rejects.toThrow("Unable to load PDF font (503)");
    await expect(loader.load(asset)).resolves.toEqual(validFontBytes);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects an asset path outside the local font directory without a network request", async () => {
    const fetch = vi.fn();
    const loader = createPdfFontAssetLoader(fetch, () => "https://docmark.test");
    const external = { ...asset, path: "https://attacker.test/font.ttf" } as unknown as PdfFontAsset;
    await expect(loader.load(external)).rejects.toThrow("application origin");
    expect(fetch).not.toHaveBeenCalled();
  });
});
