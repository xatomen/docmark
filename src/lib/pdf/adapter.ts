import type { Block, Inline, SemanticDocument } from "@/lib/document-model";

export type ExportDiagnostic = {
  kind: "unsupported" | "unsafe" | "approximation";
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
} {
  const diagnostics: ExportDiagnostic[] = document.diagnostics.map((diagnostic) => ({
    kind: diagnostic.type === "link" ? "unsafe" : "unsupported",
    message: diagnostic.message,
  }));
  const reported = new Set(diagnostics.map(({ message }) => message));
  const warn = (message: string, kind: ExportDiagnostic["kind"] = "unsupported") => {
    if (reported.has(message)) return;
    reported.add(message);
    diagnostics.push({ kind, message });
  };
  const settings = document.settings;
  const inline = (
    items: Inline[],
    inherited: { bold?: boolean; italics?: boolean; decoration?: string; link?: string } = {},
  ): object[] => items.flatMap((item): object[] => {
    if (item.type === "text") return [{ text: item.value, ...inherited }];
    if (item.type === "code") {
      return [{
        text: item.value,
        ...inherited,
        fontSize: Math.max(8, settings.typography.fontSize - 1),
        color: "#7c2d12",
        background: "#fff7ed",
      }];
    }
    if (item.type === "break") return [{ text: "\n", ...inherited }];
    if (item.type === "image") {
      warn("Image replaced with alternative text");
      return [{ text: `[Image: ${item.alt}]`, ...inherited }];
    }
    if (item.type === "link") {
      const target = normalizePdfLinkDestination(item.url);
      if (!target) {
        warn(
          `Link destination omitted (${item.destination === "external" ? "unsafe or unsupported URL" : "non-absolute URL"})`,
          item.destination === "external" ? "unsafe" : "unsupported",
        );
      }
      // Preserve the visible children while only attaching a link for validated targets.
      return inline(item.children, target ? { ...inherited, link: target } : inherited);
    }
    if (!("children" in item)) return [];
    return inline(item.children, {
      ...inherited,
      ...(item.type === "strong" ? { bold: true } : {}),
      ...(item.type === "emphasis" ? { italics: true } : {}),
      ...(item.type === "delete" ? { decoration: "lineThrough" } : {}),
    });
  });

  const convert = (block: Block): object => {
    switch (block.type) {
      case "paragraph":
        return { text: inline(block.children), margin: [0, 0, 0, 8] };
      case "heading":
        return { text: inline(block.children), bold: true, fontSize: Math.max(12, 22 - block.depth * 2), margin: [0, 8, 0, 6] };
      case "blockquote":
        return { stack: block.children.map(convert), margin: [16, 4, 0, 4] };
      case "list":
        return {
          [block.ordered ? "ol" : "ul"]: block.items.map((item) => ({
            stack: [
              ...(item.checked === null ? [] : [{ text: item.checked ? "[x]" : "[ ]" }]),
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
        return {
          text: block.value.replace(/\t/g, "    "),
          preserveLeadingSpaces: true,
          preserveTrailingSpaces: true,
          margin: [8, 4, 8, 4],
        };
      case "mermaid":
        warn("Mermaid shown as source text");
        return { text: `Mermaid diagram (source):\n${block.value}`, margin: [8, 4, 8, 4] };
      case "toc":
        warn("Table of contents is not generated");
        return { text: "[Table of contents unavailable]" };
      case "pageBreak":
        return { text: "", pageBreak: "after" };
      case "thematicBreak":
        return { text: "────────────────", margin: [0, 4] };
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
  warn(`Font family is approximated with embedded Liberation Sans instead of selected ${settings.typography.fontFamily}`, "approximation");
  if (settings.typography.alignment !== "left") warn(`Text alignment “${settings.typography.alignment}” is not applied`);
  warn("Unicode coverage is limited to Liberation Sans; emoji and some glyphs may be missing", "approximation");

  return {
    definition: {
      pageSize: settings.pageSize.toUpperCase(),
      pageOrientation: settings.orientation,
      pageMargins: [pt(settings.margins.left), pt(settings.margins.top), pt(settings.margins.right), pt(settings.margins.bottom)],
      defaultStyle: {
        font: "Liberation",
        fontSize: settings.typography.fontSize,
        lineHeight: settings.typography.lineHeight,
      },
      content: document.blocks.reduce<object[]>((content, block) => {
        if (block.type === "pageBreak") {
          const previous = content.at(-1) as { pageBreak?: string } | undefined;
          // Match Docmark's break directive semantics: ignore leading and
          // repeated markers, while a final marker still leaves a blank page.
          if (content.length && previous?.pageBreak !== "after") content.push(convert(block));
          return content;
        }
        content.push(convert(block));
        return content;
      }, []),
    },
    diagnostics,
  };
}
