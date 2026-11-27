import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDocumentModel } from "@/lib/document-model";

describe("semantic document model", () => {
  it("preserves the M7.0 fixture and produces deterministic serializable output", () => {
    const source = readFileSync("tests/fixtures/pdf-engine-comparison.md", "utf8");
    const model = createDocumentModel(source);
    expect(JSON.parse(JSON.stringify(model))).toEqual(createDocumentModel(source));
    expect(model.blocks.some(block => block.type === "toc")).toBe(true);
    expect(model.blocks.some(block => block.type === "pageBreak")).toBe(true);
    expect(model.blocks.some(block => block.type === "table" && block.rows.length === 2)).toBe(true);
    expect(JSON.stringify(model)).toContain("pingüino");
    expect(JSON.stringify(model)).toContain("Anidado");
    expect(JSON.stringify(model)).toContain("value !== null");
  });
  it("retains nested lists, styles and parser code whitespace", () => {
    const model = createDocumentModel("3. **uno**\n   - dos\n\n```js\na\n\t b\n\n c\n```");
    expect(model.blocks[0]).toMatchObject({ type: "list", ordered: true, start: 3, items: [{ children: [{ type: "paragraph" }, { type: "list" }] }] });
    expect(model.blocks[1]).toMatchObject({ type: "code", value: "a\n\t b\n\n c", lang: "js" });
  });
  it("diagnoses raw HTML and keeps Mermaid as source", () => {
    const model = createDocumentModel("<script>alert(1)</script>\n\n```mermaid\ngraph TD\n```");
    expect(model.diagnostics[0].type).toBe("html");
    expect(model.blocks[0]).toMatchObject({ type: "mermaid", value: "graph TD" });
  });
});

describe("references and security", () => {
  it("resolves definitions and rejects unsafe protocols", () => {
    const model = createDocumentModel('[**Guide**][DOCS] [relative](./path) [bad](javascript:alert(1)) ![bad](javascript:x)\n\n[docs]: https://example.com "Title"');
    const paragraph = model.blocks[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type !== "paragraph") throw new Error("Expected paragraph");
    expect(paragraph.children[0]).toMatchObject({ type: "link", url: "https://example.com", title: "Title", destination: "external", children: [{ type: "strong" }] });
    expect(JSON.stringify(model.blocks)).not.toContain('javascript:');
    expect(model.diagnostics.filter(d => d.message.includes('unsafe'))).toHaveLength(2);
  });
  it("resolves a forward internal anchor after headings are collected", () => {
    const model = createDocumentModel('[target](#docmark-heading-0)\n\n:::toc\n:::\n\n# Later');
    expect(model.blocks[0]).toMatchObject({ type: "paragraph", children: [{ type: "link", targetId: "heading-0", destination: "fragment" }] });
  });
  it("distinguishes table headers and alignment", () => {
    const model = createDocumentModel('| Name | Value |\n| :--- | ---: |\n| **a** | b |');
    expect(model.blocks[0]).toMatchObject({ type: "table", align: ["left", "right"], header: [[{ value: "Name" }], [{ value: "Value" }]], rows: [[[{ type: "strong" }], [{ value: "b" }]]] });
  });
});

describe("heading compatibility", () => {
  it("matches preview heading identifiers when a TOC exists", async () => {
    const { renderMarkdown } = await import("@/lib/markdown/render-markdown");
    const source = ":::toc\n:::\n\n# Á **uno**\n\n## Á uno\n\n###\n\n#### four\n\n# 終";
    const model = createDocumentModel(source);
    const ids = model.blocks.flatMap(b => b.type === "heading" && b.anchorId ? [b.anchorId] : []);
    const html = await renderMarkdown(source);
    expect([...html.matchAll(/data-docmark-heading-id=\"([^\"]+)\"/g)].map(m => m[1])).toEqual(ids);
    expect(ids).toEqual(["docmark-heading-0", "docmark-heading-1", "docmark-heading-2"]);
  });
  it("keeps semantic IDs without adding preview anchors when no TOC exists", () => {
    expect(createDocumentModel("# A\n\n# A").blocks).toMatchObject([{ id: "heading-0", anchorId: null, tocEligible: true }, { id: "heading-1", anchorId: null, tocEligible: true }]);
  });
  it("preserves undefined reference syntax as literal text", () => {
    const model = createDocumentModel("[missing][unknown]");
    expect(model.blocks).toMatchObject([{ type: "paragraph", children: [{ type: "text", value: "[missing][unknown]" }] }]);
    expect(model.diagnostics).toEqual([]);
  });
});

describe("URL policy through Markdown", () => {
  it.each([
    ["javascript:alert", false, false], ["JaVaScRiPt:alert", false, false],
    ["vbscript:msgbox", false, false], ["VbScRiPt:msgbox", false, false],
    ["data:text/html,evil", false, false], ["java&#x09;script:alert", false, false],
    ["java&#x0a;script:alert", false, false], ["java&#x0d;script:alert", false, false],
    ["java&#x01;script:alert", false, false], ["&#x20;javascript:alert", false, false],
    ["javascript:alert&#x20;", false, false], ["https://example.com&#x5c;evil", false, false],
    ["https://example.com", true, true], ["http://example.com/a", true, true],
    ["mailto:user@example.com", true, false], ["./relative", true, true],
    ["/root/path", true, true], ["//example.com/file", true, true],
    ["#docmark-heading-0", true, true], ["/caf%C3%A9?q=%20", true, true],
    ["/文档", true, true], ["%6a%61vascript:alert", false, false],
  ])("validates %s for links and images", (destination, linkAllowed, imageAllowed) => {
    for (const [prefix, type, allowed] of [["", "link", linkAllowed], ["!", "image", imageAllowed]] as const) {
      const model = createDocumentModel(`${prefix}[label](<${destination}>)`);
      const paragraph = model.blocks[0];
      expect(paragraph.type).toBe("paragraph");
      if (paragraph.type !== "paragraph") throw new Error("expected paragraph");
      expect(paragraph.children.some(child => child.type === type)).toBe(allowed);
    }
  });
});

describe("heading and TOC matrix", () => {
  it.each(["", ":::toc\n:::\n\n", ":::toc\n:::\n\n:::toc\n:::\n\n"])("matches renderer with TOC prefix %j", async prefix => {
    const { renderMarkdown } = await import("@/lib/markdown/render-markdown");
    const source = `${prefix}[ahead](#docmark-heading-1) [missing](#missing)\n\n# Á **nested *emphasis***!\n\n## 重复\n\n### 重复\n\n###\n\n#### Four\n\n##### Five\n\n###### Six`;
    const model = createDocumentModel(source);
    const headings = model.blocks.filter(block => block.type === "heading");
    expect(headings.map(h => h.id)).toEqual(headings.map((_, index) => `heading-${index}`));
    expect(headings.map(h => h.tocEligible)).toEqual([true, true, true, false, false, false, false]);
    const anchors = headings.flatMap(h => h.anchorId ? [h.anchorId] : []);
    const html = await renderMarkdown(source);
    expect(anchors).toEqual([...html.matchAll(/data-docmark-heading-id="([^"]+)"/g)].map(match => match[1]));
    expect(anchors).toEqual(prefix ? ["docmark-heading-0", "docmark-heading-1", "docmark-heading-2"] : []);
    const paragraph = model.blocks.find(block => block.type === "paragraph");
    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type !== "paragraph") throw new Error("expected paragraph");
    expect(paragraph.children[0]).toMatchObject({ type: "link", targetId: prefix ? "heading-1" : null });
    expect(model.diagnostics.filter(d => d.type === "anchor").length).toBe(prefix ? 1 : 2);
    expect(JSON.parse(JSON.stringify(model))).toEqual(createDocumentModel(source));
  });
});

describe("review corrections", () => {
  it("collects nested definitions and uses the first definition", () => {
    const model = createDocumentModel('[one][ref] ![image][ref]\n\n> [ref]: https://first.example "First"\n\n[ref]: https://second.example');
    const first = model.blocks[0];
    expect(first.type).toBe("paragraph");
    if (first.type !== "paragraph") throw new Error("expected paragraph");
    expect(first.children[0]).toMatchObject({ type: "link", url: "https://first.example", title: "First" });
    expect(first.children[2]).toMatchObject({ type: "image", url: "https://first.example" });
  });
  it("pads short rows and discards surplus cells to match header width", () => {
    const model = createDocumentModel('| A | B |\n| - | - |\n| x |\n| a | b | c |');
    const table = model.blocks[0];
    expect(table.type).toBe("table");
    if (table.type !== "table") throw new Error("expected table");
    expect(table.rows).toHaveLength(2);
    expect(table.rows.map(row => row.length)).toEqual([2, 2]);
    expect(table.rows[0][1]).toEqual([]);
    expect(JSON.stringify(table)).not.toContain('"value":"c"');
  });
  it("reports existing front matter warnings when parsing is enabled", () => {
    const source = '---\ndocmark:\n  version: 99\n---\n\n# Body';
    expect(createDocumentModel(source, { parseFrontMatter: true }).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ type: "frontMatter" })]));
    expect(createDocumentModel(source).diagnostics.some(d => d.type === "frontMatter")).toBe(false);
  });
  it("resolves legacy anchor URLs to semantic IDs", () => {
    const model = createDocumentModel('[go](#docmark-heading-0)\n\n:::toc\n:::\n\n# Target');
    expect(model.blocks[0]).toMatchObject({ type: "paragraph", children: [{ type: "link", url: "#docmark-heading-0", targetId: "heading-0" }] });
  });
});
