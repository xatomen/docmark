import { describe, expect, it } from "vitest";
import { createDocumentModel } from "@/lib/document-model";
import { buildPdfDefinition } from "@/lib/pdf/adapter";
import { normalizePdfFilename } from "@/lib/pdf/filename";

describe("native PDF adapter", () => {
  it("maps settings, formatted text, lists, tables and explicit breaks deterministically", () => {
    const model = createDocumentModel('# Título\n\n**bold** and *italic*\n\n- uno\n- dos\n\n| A | B |\n|---|---|\n| x | y |\n\n:::pagebreak\n:::\n\nFinal');
    const result = buildPdfDefinition(model);
    expect(result).toEqual(buildPdfDefinition(model));
    expect(result.definition.pageSize).toBe("A4");
    expect(result.definition.pageMargins[0]).toBeCloseTo(20 * 72 / 25.4);
    expect(result.definition.content.at(-1)).toEqual({ text: [{ text: "Final" }], margin: [0, 0, 0, 8] });
    expect(result.definition.content).toContainEqual(expect.objectContaining({ pageBreak: "after" }));
    expect(result.definition.content).toContainEqual(expect.objectContaining({ table: expect.objectContaining({ headerRows: 1 }) }));
  });

  it("preserves combined styles, nested list blocks, tasks, inline code, and code whitespace", () => {
    const model = createDocumentModel('***both*** and `inline`\n\n- outer paragraph\n\n  second paragraph\n\n  - nested\n- next\n\n- [x] done\n- [ ] pending\n\n```js\na\t b\n```');
    const result = buildPdfDefinition(model);
    const paragraph = result.definition.content[0] as { text: Record<string, unknown>[] };
    expect(paragraph.text).toContainEqual(expect.objectContaining({ text: "both", bold: true, italics: true }));
    expect(paragraph.text).toContainEqual(expect.objectContaining({ text: "inline", background: "#fff7ed", color: "#7c2d12" }));
    const lists = result.definition.content.filter((item) => "ul" in item) as { ul: { stack: object[] }[] }[];
    expect(lists.length).toBeGreaterThan(0);
    const listItems = lists[0].ul;
    expect(listItems.length).toBe(4);
    expect(listItems[0].stack[0]).toMatchObject({ text: [{ text: "outer paragraph" }] });
    expect(listItems[0].stack[1]).toMatchObject({ text: [{ text: "second paragraph" }] });
    expect(listItems[0].stack[2]).toMatchObject({ ul: expect.any(Array) });
    expect(listItems[2].stack[0]).toEqual({ text: "[x]" });
    expect(listItems[3].stack[0]).toEqual({ text: "[ ]" });
    const code = result.definition.content.find((item) => "preserveLeadingSpaces" in item) as Record<string, unknown>;
    expect(code).toMatchObject({ text: "a     b", preserveLeadingSpaces: true, preserveTrailingSpaces: true });
  });

  it("maps all four margins, empty tables, alignments, and empty documents structurally", () => {
    const model = createDocumentModel("| left | center | right | empty |\n|:---|:---:|---:|---|\n| uno | dos | tres | |");
    model.settings.margins = { top: 13, right: 17, bottom: 19, left: 23 };
    const result = buildPdfDefinition(model);
    expect(result.definition.pageMargins).toEqual([23, 13, 17, 19].map((value) => value * 72 / 25.4));
    const table = result.definition.content[0] as { table: { body: { text: object[]; alignment: string }[][] } };
    expect(table.table.body[1]).toEqual([
      expect.objectContaining({ text: [{ text: "uno" }], alignment: "left" }),
      expect.objectContaining({ text: [{ text: "dos" }], alignment: "center" }),
      expect.objectContaining({ text: [{ text: "tres" }], alignment: "right" }),
      expect.objectContaining({ text: [], alignment: "left" }),
    ]);
    expect(buildPdfDefinition(createDocumentModel("")).definition.content).toEqual([]);
  });

  it("retains visible text and reports semantic diagnostics for unsupported content", () => {
    const model = createDocumentModel('[local](/page)\n\n:::toc\n:::\n\n```mermaid\ngraph TD\n```');
    const result = buildPdfDefinition(model);
    expect(result.definition.content[0]).toEqual({ text: [{ text: "local" }], margin: [0, 0, 0, 8] });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "unsupported", message: "Table of contents is not generated" }),
      expect.objectContaining({ kind: "unsupported", message: "Mermaid shown as source text" }),
      expect.objectContaining({ kind: "approximation", message: expect.stringContaining("Unicode coverage") }),
    ]));
  });

  it("distinguishes applied line height from approximated and ignored settings", () => {
    const model = createDocumentModel("text");
    model.settings.typography.fontFamily = "Georgia";
    model.settings.typography.alignment = "justify";
    model.settings.typography.lineHeight = 1.2;
    model.settings.cover.enabled = true;
    model.settings.header.enabled = true;
    const result = buildPdfDefinition(model);
    expect(result.definition.defaultStyle.lineHeight).toBe(1.2);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "approximation", message: expect.stringContaining("Font family") }),
      expect.objectContaining({ kind: "unsupported", message: expect.stringContaining("alignment") }),
      expect.objectContaining({ kind: "unsupported", message: expect.stringContaining("cover page, header") }),
    ]));
    expect(result.diagnostics.some(({ message }) => message.includes("line height"))).toBe(false);
  });
});

describe("PDF download filename normalization", () => {
  it.each([
    ["Report.md", "Report.pdf"],
    ["Report.MARKDOWN", "Report.pdf"],
    ["Report.pdf", "Report.pdf"],
    ["Report.PdF", "Report.pdf"],
    ["Report.pdf.md", "Report.pdf"],
    ["Report.pdf.PDF", "Report.pdf"],
    [" Report.pdf.md ", "Report.pdf"],
    ["two  spaces.md", "two  spaces.pdf"],
    ["RÉSUMÉ-日本語.md", "RÉSUMÉ-日本語.pdf"],
    ["café.md", "café.pdf"],
    ["A / B: ?.md", "A - B- -.pdf"],
    ["", "Untitled document.pdf"],
    ["CON.md", "_CON.pdf"],
    ["Lpt9.markdown", "_Lpt9.pdf"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizePdfFilename(input)).toBe(expected);
  });
});

describe("PDF renderer URL policy", () => {
  it.each([
    ["https://example.test/a?q=one#two", "https://example.test/a?q=one#two"],
    ["HTTP://Example.test/a/../b", "http://example.test/b"],
  ])("normalizes valid Markdown destination %s", (destination, normalized) => {
    const result = buildPdfDefinition(createDocumentModel(`[visible](${destination})`));
    const paragraph = result.definition.content[0] as { text: { text: string; link?: string }[] };
    expect(paragraph.text).toContainEqual({ text: "visible", link: normalized });
  });

  it.each([
    "https:example.com", "https:/example.com", "//example.com/path", "/path", "relative/path",
    "javascript:alert(1)", "data:text/html,hello", "https://example.com/a b", "https://example.com/a\\b",
    "https://example.com/\tpath", "https://user:pass@example.com/path",
  ])("omits ambiguous direct semantic destination %j while retaining its label", (url) => {
    const model = createDocumentModel("");
    model.blocks = [{ type: "paragraph", children: [{
      type: "link", url, title: null, destination: "external", targetId: null,
      children: [{ type: "text", value: "visible" }],
    }] }];
    const result = buildPdfDefinition(model);
    const paragraph = result.definition.content[0] as { text: { text: string; link?: string }[] };
    expect(paragraph.text).toContainEqual({ text: "visible" });
    expect(paragraph.text[0]).not.toHaveProperty("link");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ kind: "unsafe" }));
  });

  it.each([
    "[visible](https:example.com)", "[visible](https:/example.com)",
    "[visible](javascript:alert(1))", "[visible](https://example.com/a\\b)",
  ])("retains Markdown link text after Remark parsing for %s", (markdown) => {
    const result = buildPdfDefinition(createDocumentModel(markdown));
    const output = JSON.stringify(result.definition.content);
    expect(output).toContain("visible");
    expect(output).not.toContain('"link":"javascript:');
  });
});
