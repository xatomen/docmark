import type { Block, Inline, SemanticDocument } from "@/lib/document-model";
import { DEFAULT_PDF_DOCUMENT_FAMILY, DEFAULT_PDF_MONOSPACE_FAMILY, PDF_FONT_REGISTRY } from "./fonts/registry";
import { resolvePdfFont } from "./fonts/resolve-font";
import { resolveTextToFontRuns } from "./fonts/resolve-text-runs";
import type { FontResolutionPlan, PdfFontAsset, PdfFontVariant } from "./fonts/types";
import type { PdfFontFamilyId } from "./fonts/registry";

export type ExportDiagnostic = {
  kind: "unsupported" | "unsafe" | "approximation" | "fidelity";
  message: string;
};

export type PdfDefinition = {
  pageSize: string;
  pageOrientation: "portrait" | "landscape";
  pageMargins: number[];
  defaultStyle: { font: string; fontSize: number; lineHeight: number };
  content: object[];
};

const pt = (mm: number) => mm * 72 / 25.4;
const URL_CONTROL_OR_SPACE = /[\u0000-\u0020\u007f\\]/;

/** Accept only explicit absolute HTTP(S) URLs and return pdfmake's normalized target. */
export function normalizePdfLinkDestination(value: string): string | null {
  if (URL_CONTROL_OR_SPACE.test(value) || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    if (!(["http:", "https:"].includes(url.protocol) && url.hostname && url.origin !== "null")) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Build a document definition without executing a renderer or fetching assets. */
export function buildPdfDefinition(document: SemanticDocument): {
  definition: PdfDefinition;
  diagnostics: ExportDiagnostic[];
  fontPlan: FontResolutionPlan;
} {
  const diagnostics: ExportDiagnostic[] = [];
  const selectedFamily = document.settings.typography.fontFamily || DEFAULT_PDF_DOCUMENT_FAMILY;
  const primaryFamily = resolvePdfFont(selectedFamily);
  const fontUsage = new Map<string, Set<PdfFontVariant>>();
  const maxDiagnostics = 20;
  const maxDiagnosticLength = 240;
  const candidateLimit = 64;
  const candidates = new Map<string, { diagnostic: ExportDiagnostic; priority: number; sequence: number }>();
  const omittedByKind: Record<ExportDiagnostic["kind"], number> = {
    unsupported: 0,
    unsafe: 0,
    approximation: 0,
    fidelity: 0,
  };
  let sequence = 0;
  const diagnosticPriority = (kind: ExportDiagnostic["kind"], message: string) => {
    if (kind === "unsafe") return 0;
    if (kind === "unsupported" && /U\+[0-9A-F]+|replaced|unresolved|unsupported text|Private-use/i.test(message)) return 0;
    if (kind === "fidelity") return 1;
    if (kind === "unsupported") return 2;
    return 3;
  };
  const warn = (message: string, kind: ExportDiagnostic["kind"] = "unsupported") => {
    const boundedMessage = message.length > maxDiagnosticLength
      ? `${message.slice(0, maxDiagnosticLength - 1)}…`
      : message;
    if (candidates.has(boundedMessage)) return;
    const priority = diagnosticPriority(kind, boundedMessage);
    if (candidates.size >= candidateLimit) {
      const worst = [...candidates.entries()].sort((left, right) => right[1].priority - left[1].priority || right[1].sequence - left[1].sequence)[0];
      if (!worst || priority >= worst[1].priority) {
        omittedByKind[kind] += 1;
        return;
      }
      candidates.delete(worst[0]);
      omittedByKind[worst[1].diagnostic.kind] += 1;
    }
    candidates.set(boundedMessage, { diagnostic: { kind, message: boundedMessage }, priority, sequence: sequence++ });
  };
  const finishDiagnostics = () => {
    const ordered = [...candidates.values()].sort((left, right) => left.priority - right.priority || left.sequence - right.sequence);
    const omittedCount = Object.values(omittedByKind).reduce((sum, count) => sum + count, 0);
    const slots = omittedCount > 0 ? maxDiagnostics - 1 : maxDiagnostics;
    diagnostics.push(...ordered.slice(0, slots).map(({ diagnostic }) => diagnostic));
    const unshown = ordered.slice(slots);
    for (const { diagnostic } of unshown) omittedByKind[diagnostic.kind] += 1;
    const finalOmittedCount = Object.values(omittedByKind).reduce((sum, count) => sum + count, 0);
    if (finalOmittedCount > 0) {
      const summary = Object.entries(omittedByKind).filter(([, count]) => count > 0).map(([kind, count]) => `${kind}: ${count}`).join(", ");
      diagnostics.push({
        kind: "unsupported",
        message: `Additional export diagnostics were omitted to keep the warning list bounded (maximum ${maxDiagnostics}; ${summary}).`,
      });
    }
  };
  for (const diagnostic of document.diagnostics) {
    warn(diagnostic.message, diagnostic.type === "link" ? "unsafe" : "unsupported");
  }
  const settings = document.settings;
  const addFontUse = (familyId: string, variant: PdfFontVariant) => {
    const variants = fontUsage.get(familyId) ?? new Set<PdfFontVariant>();
    variants.add(variant);
    fontUsage.set(familyId, variants);
  };
  const appendRuns = (target: object[], runs: object[]) => {
    for (const run of runs) {
      const current = run as Record<string, unknown>;
      const previous = target.at(-1) as Record<string, unknown> | undefined;
      if (previous && typeof previous.text === "string" && typeof current.text === "string") {
        const previousKeys = Object.keys(previous).filter((key) => key !== "text").sort();
        const currentKeys = Object.keys(current).filter((key) => key !== "text").sort();
        if (previousKeys.length === currentKeys.length
          && previousKeys.every((key, index) => key === currentKeys[index] && previous[key] === current[key])) {
          previous.text += current.text;
          continue;
        }
      }
      target.push(run);
    }
  };
  const textRuns = (
    value: string,
    inherited: { bold?: boolean; italics?: boolean; decoration?: string; link?: string; fontSize?: number; color?: string; background?: string } = {},
    code = false,
  ): object[] => {
    if (!value) return [];
    const requestedVariant: PdfFontVariant = inherited.bold && inherited.italics ? "boldItalic"
      : inherited.bold ? "bold" : inherited.italics ? "italic" : "regular";
    const resolved = resolveTextToFontRuns(value, code
      ? { familyId: DEFAULT_PDF_MONOSPACE_FAMILY, variant: requestedVariant }
      : { documentFamily: selectedFamily, variant: requestedVariant });
    if (!code && primaryFamily.diagnostic) warn(primaryFamily.diagnostic, "approximation");
    if (value.normalize("NFC") !== value) {
      warn(
        "Decomposed Unicode (including code) may be composed by pdfmake/fontkit; extracted text may be canonically equivalent but not code-point-identical. Use source Markdown for exact code retrieval (M7.8 attachments); source is unchanged.",
        "fidelity",
      );
    }
    const result: object[] = [];
    for (const run of resolved.runs) {
      const style: PdfFontVariant = run.variant;
      addFontUse(run.familyId, style);
      for (const message of resolved.diagnostics) {
        const kind = message.includes("Bidirectional ordering is not supported")
          || message.startsWith("No currently qualified")
          || message.startsWith("No configured native PDF font")
          || message.startsWith("Font coverage metadata")
          ? "unsupported"
          : "approximation";
        warn(message, kind);
      }
      appendRuns(result, [{
        text: run.displayText ?? run.text,
        ...inherited,
        font: run.familyId,
        bold: style === "bold" || style === "boldItalic",
        italics: style === "italic" || style === "boldItalic",
      }]);
    }
    return result;
  };
  const inline = (
    items: Inline[],
    inherited: { bold?: boolean; italics?: boolean; decoration?: string; link?: string } = {},
  ): object[] => {
    const result: object[] = [];
    for (const item of items) {
      if (item.type === "text") appendRuns(result, textRuns(item.value, inherited));
      else if (item.type === "code") appendRuns(result, textRuns(item.value, {
        ...inherited,
        fontSize: Math.max(8, settings.typography.fontSize - 1),
        color: "#7c2d12",
        background: "#fff7ed",
      }, true));
      else if (item.type === "break") appendRuns(result, textRuns("\n", inherited));
      else if (item.type === "image") {
        warn("Image replaced with alternative text");
        appendRuns(result, textRuns(`[Image: ${item.alt}]`, inherited));
      } else if (item.type === "link") {
        const target = normalizePdfLinkDestination(item.url);
        if (!target) {
          warn(
            `Link destination omitted (${item.destination === "external" ? "unsafe or unsupported URL" : "non-absolute URL"})`,
            item.destination === "external" ? "unsafe" : "unsupported",
          );
        }
        // Each resolved face remains a separate text run but shares the validated destination.
        appendRuns(result, inline(item.children, target ? { ...inherited, link: target } : inherited));
      } else if ("children" in item) {
        appendRuns(result, inline(item.children, {
          ...inherited,
          ...(item.type === "strong" ? { bold: true } : {}),
          ...(item.type === "emphasis" ? { italics: true } : {}),
          ...(item.type === "delete" ? { decoration: "lineThrough" } : {}),
        }));
      }
    }
    return result;
  };

  const convert = (block: Block): object => {
    switch (block.type) {
      case "paragraph":
        return { text: inline(block.children), margin: [0, 0, 0, 8] };
      case "heading":
        return { text: inline(block.children, { bold: true }), bold: true, fontSize: Math.max(12, 22 - block.depth * 2), margin: [0, 8, 0, 6] };
      case "blockquote":
        return { stack: block.children.map(convert), margin: [16, 4, 0, 4] };
      case "list":
        // pdfmake renders list markers using the document's default font.
        // Text-only blocks already register their resolved runs explicitly;
        // code-only documents should not fetch a sans face just for defaultStyle.
        addFontUse(primaryFamily.family.id, "regular");
        return {
          [block.ordered ? "ol" : "ul"]: block.items.map((item) => ({
            stack: [
              ...(item.checked === null ? [] : [{ text: textRuns(item.checked ? "[x]" : "[ ]") }]),
              ...item.children.map(convert),
            ],
          })),
          ...(block.ordered && block.start !== null ? { start: block.start } : {}),
        };
      case "table":
        return {
          table: {
            headerRows: 1,
            widths: block.align.map(() => "*"),
            body: [block.header, ...block.rows].map((row) => row.map((cell, index) => ({
              text: inline(cell),
              alignment: block.align[index] ?? "left",
            }))),
          },
        };
      case "code":
        if (!block.value) addFontUse(DEFAULT_PDF_MONOSPACE_FAMILY, "regular");
        return {
          text: textRuns(block.value.replace(/\t/g, "    "), {}, true),
          font: DEFAULT_PDF_MONOSPACE_FAMILY,
          preserveLeadingSpaces: true,
          preserveTrailingSpaces: true,
          margin: [8, 4, 8, 4],
        };
      case "mermaid":
        warn("Mermaid shown as source text");
        return { text: textRuns(`Mermaid diagram (source):\n${block.value}`), margin: [8, 4, 8, 4] };
      case "toc":
        warn("Table of contents is not generated");
        return { text: textRuns("[Table of contents unavailable]") };
      case "pageBreak":
        return { text: "", pageBreak: "after" };
      case "thematicBreak":
        return { text: textRuns("────────────────"), margin: [0, 4] };
    }
  };

  const ignoredDecorations = [
    settings.cover.enabled && "cover page",
    settings.header.enabled && "header",
    settings.footer.enabled && "footer",
    settings.pageNumbers.enabled && "page numbers",
    settings.theme !== "default" && "document theme",
  ].filter(Boolean);
  if (ignoredDecorations.length) warn(`Not applied by this export: ${ignoredDecorations.join(", ")}`);
  if (settings.typography.alignment !== "left") warn(`Text alignment “${settings.typography.alignment}” is not applied`);

  const content = document.blocks.reduce<object[]>((output, block) => {
    if (block.type === "pageBreak") {
      const previous = output.at(-1) as { pageBreak?: string } | undefined;
      // Match Docmark's break directive semantics: ignore leading and
      // repeated markers, while a final marker still leaves a blank page.
      if (output.length && previous?.pageBreak !== "after") output.push(convert(block));
      return output;
    }
    output.push(convert(block));
    return output;
  }, []);
  if (fontUsage.has(DEFAULT_PDF_MONOSPACE_FAMILY) && primaryFamily.family.id !== DEFAULT_PDF_MONOSPACE_FAMILY) {
    warn("Code uses the local Liberation Mono typeface; HTML preview and print keep their Cascadia Code/Consolas stack.", "approximation");
  }
  finishDiagnostics();

  const fontDescriptors: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }> = {};
  const assetsByPath = new Map<string, PdfFontAsset>();
  for (const [familyId, variants] of fontUsage) {
    const family = PDF_FONT_REGISTRY[familyId as PdfFontFamilyId];
    if (!family) throw new Error(`Resolved unknown native PDF family: ${familyId}`);
    const used = [...variants];
    const defaultAsset = family.variants.regular && variants.has("regular")
      ? family.variants.regular
      : family.variants[used[0]];
    const descriptor = {
      normal: defaultAsset.fileName,
      bold: defaultAsset.fileName,
      italics: defaultAsset.fileName,
      bolditalics: defaultAsset.fileName,
    };
    const keys: Record<PdfFontVariant, keyof typeof descriptor> = {
      regular: "normal", bold: "bold", italic: "italics", boldItalic: "bolditalics",
    };
    for (const variant of variants) {
      const asset = family.variants[variant];
      descriptor[keys[variant]] = asset.fileName;
      assetsByPath.set(asset.path, asset);
    }
    fontDescriptors[family.id] = descriptor;
  }

  return {
    definition: {
      pageSize: settings.pageSize.toUpperCase(),
      pageOrientation: settings.orientation,
      pageMargins: [pt(settings.margins.left), pt(settings.margins.top), pt(settings.margins.right), pt(settings.margins.bottom)],
      defaultStyle: {
        font: primaryFamily.family.id,
        fontSize: settings.typography.fontSize,
        lineHeight: settings.typography.lineHeight,
      },
      content,
    },
    diagnostics,
    fontPlan: {
      assets: [...assetsByPath.values()],
      fonts: fontDescriptors,
    },
  };
}
