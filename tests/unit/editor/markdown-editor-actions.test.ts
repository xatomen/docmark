import { describe, expect, it } from "vitest";
import {
  createHeadingChange,
  createLinkChange,
  createListChange,
  createMarkdownTable,
  createTableInsertionChange,
  createWrappedFormattingChange,
} from "@/lib/editor/markdown-editor-actions";

describe("Markdown editor formatting changes", () => {
  it.each([
    ["bold", "**", "**"],
    ["italic", "*", "*"],
    ["inline code", "`", "`"],
  ])("wraps selected text with %s", (_name, prefix, suffix) => {
    expect(createWrappedFormattingChange("Docmark", 0, 7, prefix, suffix)).toEqual({
      from: 0,
      to: 7,
      insert: `${prefix}Docmark${suffix}`,
      selection: { anchor: prefix.length, head: prefix.length + 7 },
    });
  });

  it("leaves the cursor between delimiters when formatting an empty selection", () => {
    expect(createWrappedFormattingChange("", 0, 0, "**", "**")).toEqual({
      from: 0,
      to: 0,
      insert: "****",
      selection: { anchor: 2, head: 2 },
    });
  });

  it.each([
    ["bold", "**", "**"],
    ["italic", "*", "*"],
    ["inline code", "`", "`"],
  ])("places the cursor inside empty %s markers", (_name, prefix, suffix) => {
    const change = createWrappedFormattingChange("", 0, 0, prefix, suffix);
    expect(change.insert).toBe(`${prefix}${suffix}`);
    expect(change.selection).toEqual({ anchor: prefix.length, head: prefix.length });
  });

  it("selects the URL after wrapping selected text in a link", () => {
    expect(createLinkChange("Docmark", 0, 7)).toEqual({
      from: 0,
      to: 7,
      insert: "[Docmark](url)",
      selection: { anchor: 10, head: 13 },
    });
  });

  it("creates a link and selects its URL with no selected text", () => {
    expect(createLinkChange("", 0, 0)).toEqual({
      from: 0,
      to: 0,
      insert: "[](url)",
      selection: { anchor: 3, head: 6 },
    });
  });
});

describe("Markdown editor heading changes", () => {
  it("adds H1 to a plain line and puts a cursor at the heading text", () => {
    expect(createHeadingChange("Architecture", 0, 0, 1)).toEqual({
      from: 0,
      to: 0,
      insert: "# ",
      selection: { anchor: 2, head: 2 },
    });
  });

  it("adds H2 to a plain line while preserving selection within the text", () => {
    expect(createHeadingChange("Architecture", 3, 7, 2)).toEqual({
      from: 0,
      to: 0,
      insert: "## ",
      selection: { anchor: 6, head: 10 },
    });
  });

  it("replaces an existing heading prefix without accumulating hashes", () => {
    expect(createHeadingChange("# Architecture", 5, 14, 3)).toEqual({
      from: 0,
      to: 2,
      insert: "### ",
      selection: { anchor: 7, head: 16 },
    });
  });

  it("keeps up to three leading spaces", () => {
    expect(createHeadingChange("  Architecture", 0, 0, 1)).toMatchObject({ insert: "  # ", selection: { anchor: 4 } });
  });
});

describe("Markdown editor list changes", () => {
  it("adds a bullet to the current line and keeps a useful cursor", () => {
    expect(createListChange("AWS", 1, 1, "bullet")).toEqual({
      from: 0,
      to: 3,
      insert: "- AWS",
      selection: { anchor: 3, head: 3 },
    });
  });

  it("adds bullets to selected lines while preserving CRLF line endings and indentation", () => {
    const source = "AWS\r\n  Azure\r\nGCP";
    expect(createListChange(source, 0, source.length, "bullet")).toEqual({
      from: 0,
      to: source.length,
      insert: "- AWS\r\n  - Azure\r\n- GCP",
      selection: { anchor: 2, head: 23 },
    });
  });

  it("numbers selected lines sequentially", () => {
    expect(createListChange("AWS\nAzure\nGCP", 0, 12, "numbered").insert).toBe("1. AWS\n2. Azure\n3. GCP");
  });

  it("inserts a marker on a blank line without placeholder text", () => {
    expect(createListChange("", 0, 0, "numbered")).toMatchObject({ insert: "1. ", selection: { anchor: 3, head: 3 } });
  });
});

describe("Markdown table generation and insertion", () => {
  it("generates a one-column, one-data-row table", () => {
    expect(createMarkdownTable(1, 1)).toBe("| Column 1 |\n| --- |\n|  |");
  });

  it("generates three columns and two data rows", () => {
    expect(createMarkdownTable(3, 2)).toBe([
      "| Column 1 | Column 2 | Column 3 |",
      "| --- | --- | --- |",
      "|  |  |  |",
      "|  |  |  |",
    ].join("\n"));
  });

  it("clamps dimensions to the supported bounds", () => {
    expect(createMarkdownTable(0, -1)).toBe("| Column 1 |\n| --- |\n|  |");
    expect(createMarkdownTable(80, 120).split("\n")).toHaveLength(14);
    expect(createMarkdownTable(80, 1).split("\n")[0].match(/Column \d+/g)).toHaveLength(8);
  });

  it("inserts into an empty document without leading line breaks and selects Column 1", () => {
    const change = createTableInsertionChange("", 0, 0, 3, 2);
    expect(change.insert.startsWith("|")).toBe(true);
    expect(change.selection).toEqual({ anchor: 2, head: 10 });
  });

  it("adds block separation around a table between paragraphs", () => {
    const source = "Before\n\nAfter";
    const change = createTableInsertionChange(source, 8, 8, 1, 1);
    expect(`${source.slice(0, change.from)}${change.insert}${source.slice(change.to)}`).toBe("Before\n\n| Column 1 |\n| --- |\n|  |\n\nAfter");
    expect(change.insert).toContain("Column 1");
  });

  it("preserves nearby CRLF line endings", () => {
    expect(createTableInsertionChange("Before\r\n\r\nAfter", 10, 10, 1, 1).insert).toContain("\r\n");
  });
});
