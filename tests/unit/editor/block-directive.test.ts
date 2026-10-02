import { describe, expect, it } from "vitest";
import { createBlockDirectiveInsertion, PAGE_BREAK_DIRECTIVE, TOC_DIRECTIVE } from "@/lib/editor/block-directive";

function insert(source: string, position: number, directive: string, selectionTo = position) {
  const result = createBlockDirectiveInsertion(source, position, selectionTo, directive);
  return {
    source: `${source.slice(0, result.from)}${result.insert}${source.slice(result.from)}`,
    cursor: result.from + result.cursor,
  };
}

describe("block directive insertion", () => {
  it("uses the canonical source directives", () => {
    expect(TOC_DIRECTIVE).toBe(":::toc\n:::");
    expect(PAGE_BREAK_DIRECTIVE).toBe(":::pagebreak\n:::");
  });

  it.each([
    ["empty document", "", 0, TOC_DIRECTIVE, TOC_DIRECTIVE],
    ["beginning", "# Heading", 0, TOC_DIRECTIVE, `${TOC_DIRECTIVE}\n\n# Heading`],
    ["end", "# Heading\n\nText", 15, PAGE_BREAK_DIRECTIVE, `# Heading\n\nText\n\n${PAGE_BREAK_DIRECTIVE}\n`],
    ["between blocks", "Text\n\n# Heading", 6, TOC_DIRECTIVE, `Text\n\n${TOC_DIRECTIVE}\n\n# Heading`],
  ])("inserts at %s with clean block boundaries", (_name, source, position, directive, expected) => {
    expect(insert(source as string, position as number, directive as string).source).toBe(expected);
  });

  it.each([TOC_DIRECTIVE, PAGE_BREAK_DIRECTIVE])("inserts %s in an empty document without extra formatting", (directive) => {
    expect(insert("", 0, directive).source).toBe(directive);
  });

  it("splits a paragraph without deleting selected source and places the cursor after the directive", () => {
    const result = insert("ABCDEF", 2, PAGE_BREAK_DIRECTIVE, 4);
    expect(result.source).toBe(`ABCD\n\n${PAGE_BREAK_DIRECTIVE}\n\nEF`);
    expect(result.source.slice(result.cursor)).toBe("EF");
  });

  it("does not accumulate unnecessary existing blank lines or reformat unrelated text", () => {
    const source = "first  \n\n\n# Heading\n\nlast\t";
    const position = source.indexOf("# Heading");
    expect(insert(source, position, TOC_DIRECTIVE).source).toBe("first  \n\n\n:::toc\n:::\n\n# Heading\n\nlast\t");
  });

  it("uses nearby CRLF without converting the rest of the document", () => {
    const source = "one\r\n\r\ntwo\nthree";
    const position = source.indexOf("two") + 1;
    const result = insert(source, position, PAGE_BREAK_DIRECTIVE);
    expect(result.source).toBe("one\r\n\r\nt\r\n\r\n:::pagebreak\r\n:::\r\n\r\nwo\nthree");
    expect(result.source.endsWith("wo\nthree")).toBe(true);
  });
});
