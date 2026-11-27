import { describe, expect, it } from "vitest";
import { createDocumentModel } from "@/lib/document-model";
import { buildPdfDefinition } from "@/lib/pdf/adapter";

describe("native PDF adapter", () => {
  it("maps settings, formatted text, lists, tables and explicit breaks deterministically", () => {
    const model = createDocumentModel('# Título\n\n**bold** and *italic*\n\n- uno\n- dos\n\n| A | B |\n|---|---|\n| x | y |\n\n:::pagebreak\n:::\n\nFinal');
    const result = buildPdfDefinition(model);
    expect(result).toEqual(buildPdfDefinition(model));
    expect(result.definition.pageSize).toBe("A4");
    expect(result.definition.pageMargins[0]).toBeCloseTo(20 * 72 / 25.4);
    expect(JSON.stringify(result.definition)).toContain('"pageBreak":"after"');
    expect(JSON.stringify(result.definition)).toContain('"headerRows":1');
  });
  it("reports unsupported content and refuses relative links", () => {
    const model = createDocumentModel('[local](/page)\n\n:::toc\n:::\n\n```mermaid\ngraph TD\n```');
    const result = buildPdfDefinition(model);
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(result.definition)).not.toContain('"link"');
  });
});

describe("adapter edge cases", () => {
  it("maps nested formatting, list start, task state and code whitespace", () => {
    const model = createDocumentModel('5. **bold *italic***\n6. next\n   - [x] done\n\n```js\na\t b\n```');
    const output = JSON.stringify(buildPdfDefinition(model).definition);
    expect(output).toContain('"start":5');
    expect(output).toContain('"bold":true');
    expect(output).toContain('"italics":true');
    expect(output).toContain('[x]');
    expect(output).toContain('a     b');
  });
  it("handles empty content and reports decorations", () => {
    const model = createDocumentModel('');
    model.settings.header.enabled = true;
    const result = buildPdfDefinition(model);
    expect(result.definition.content).toEqual([]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "unsupported" })]));
  });
  it("preserves task states, aligned table content, nested styles, and tabs while warning on images", () => {
    const model = createDocumentModel('**bold _italic_** and ***both***\n\n- [x] complete\n- [ ] pending\n\n| left | center | right |\n|:---|:---:|---:|\n| uno | dos | tres |\n\n```txt\na\t\tb\n```\n\n![alt](https://example.test/image.png)');
    const result = buildPdfDefinition(model);
    const serialized = JSON.stringify(result.definition);
    expect(serialized).toContain('"bold":true');
    expect(serialized).toContain('"italics":true');
    expect(serialized).toContain("[x]");
    expect(serialized).toContain("[ ]");
    expect(serialized).toContain('"alignment":"center"');
    expect(serialized).toContain("uno");
    expect(serialized).toContain("dos");
    expect(serialized).toContain("tres");
    expect(serialized).toContain("a        b");
    expect(serialized).toContain("[Image: alt]");
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ message: "Image replaced with alternative text" })]));
  });
  it("reports typography settings that the experimental renderer does not preserve", () => {
    const model = createDocumentModel("text");
    model.settings.typography.fontFamily = "Georgia";
    model.settings.typography.alignment = "justify";
    model.settings.typography.lineHeight = 1.2;
    const result = buildPdfDefinition(model);
    expect(result.diagnostics.map(({ message }) => message)).toEqual(expect.arrayContaining([
      expect.stringContaining("font is not embedded"),
      expect.stringContaining("alignment"),
      expect.stringContaining("line height"),
    ]));
  });
});
