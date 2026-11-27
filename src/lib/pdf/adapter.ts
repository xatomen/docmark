import type { Block, Inline, SemanticDocument } from "@/lib/document-model";

export type ExportDiagnostic = { kind: "unsupported" | "unsafe"; message: string };
export type PdfDefinition = { pageSize: string; pageOrientation: "portrait" | "landscape"; pageMargins: number[]; defaultStyle: { font: string; fontSize: number; lineHeight: number }; content: object[] };
const pt = (mm: number) => mm * 72 / 25.4;

/** Build a document definition without executing a renderer or fetching assets. */
export function buildPdfDefinition(document: SemanticDocument): { definition: PdfDefinition; diagnostics: ExportDiagnostic[] } {
  const diagnostics: ExportDiagnostic[] = document.diagnostics.map(d => ({ kind: "unsupported", message: d.message }));
  const warn = (message: string, kind: ExportDiagnostic["kind"] = "unsupported") => diagnostics.push({ kind, message });
  const inlines = (items: Inline[], style: { bold?: boolean; italics?: boolean; decoration?: string; link?: string } = {}): object[] => items.flatMap((item): object[] => {
    if (item.type === "text" || item.type === "code") return [{ text: item.value, ...style }];
    if (item.type === "break") return [{ text: "\n", ...style }];
    if (item.type === "image") { warn("Image replaced with alternative text"); return [{ text: `[Image: ${item.alt}]`, ...style }]; }
    if (item.type === "link") {
      let safe = false;
      try { const url = new URL(item.url); safe = ["http:", "https:"].includes(url.protocol) && !/[\u0000-\u0020\u007f\\]/.test(item.url); } catch { /* Relative and fragment links are unsupported. */ }
      if (!safe) warn(`Link omitted: ${item.url}`, item.destination === "external" ? "unsafe" : "unsupported");
      return inlines(item.children, safe ? { ...style, link: item.url } : style);
    }
    if (!("children" in item)) return [];
    return inlines(item.children, { ...style, ...(item.type === "strong" ? { bold: true } : item.type === "emphasis" ? { italics: true } : { decoration: "lineThrough" }) });
  });
  const convert = (block: Block): object => {
    switch (block.type) {
      case "paragraph": return { text: inlines(block.children), margin: [0, 0, 0, 8] };
      case "heading": return { text: inlines(block.children), bold: true, fontSize: Math.max(12, 22 - block.depth * 2), margin: [0, 8, 0, 6] };
      case "blockquote": return { stack: block.children.map(convert), margin: [16, 4, 0, 4] };
      case "list": return { [block.ordered ? "ol" : "ul"]: block.items.map(item => ({ stack: [...(item.checked === null ? [] : [{ text: item.checked ? "[x]" : "[ ]" }]), ...item.children.map(convert)] })), ...(block.ordered && block.start !== null ? { start: block.start } : {}) };
      case "table": return { table: { headerRows: 1, widths: block.align.map(() => "*"), body: [block.header, ...block.rows].map(row => row.map((cell, i) => ({ text: inlines(cell), alignment: block.align[i] ?? "left" }))) } };
      case "code": return { text: block.value.replace(/\t/g, "    "), margin: [8, 4, 8, 4] };
      case "mermaid": warn("Mermaid shown as source"); return { text: `Mermaid diagram (source):\n${block.value}`, margin: [8, 4, 8, 4] };
      case "toc": warn("Table of contents is not generated"); return { text: "[Table of contents unavailable]" };
      case "pageBreak": return { text: "", pageBreak: "after" };
      case "thematicBreak": return { text: "────────────────", margin: [0, 4] };
    }
  };
  const settings = document.settings;
  if (settings.cover.enabled || settings.header.enabled || settings.footer.enabled || settings.pageNumbers.enabled || settings.theme !== "default") warn("Some document decorations or theme settings are not supported");
  if (settings.typography.fontFamily !== "Arial") warn(`The selected ${settings.typography.fontFamily} font is not embedded; Liberation Sans is used`);
  if (settings.typography.alignment !== "left") warn(`Text alignment “${settings.typography.alignment}” is not preserved`);
  if (settings.typography.lineHeight !== 1.75) warn(`The selected line height (${settings.typography.lineHeight}) is not preserved`);
  return { definition: { pageSize: settings.pageSize.toUpperCase(), pageOrientation: settings.orientation, pageMargins: [pt(settings.margins.left), pt(settings.margins.top), pt(settings.margins.right), pt(settings.margins.bottom)], defaultStyle: { font: "Liberation", fontSize: settings.typography.fontSize, lineHeight: settings.typography.lineHeight }, content: document.blocks.map(convert) }, diagnostics };
}
