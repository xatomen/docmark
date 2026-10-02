import { describe, expect, it } from "vitest";
import { createDocmarkDocument } from "@/lib/document/model";
import { DEFAULT_DOCUMENT_SETTINGS } from "@/lib/document/settings";
import {
  parseMarkdownFile,
  serializeMarkdownFile,
} from "@/lib/files/markdown-front-matter";

function asDocument(source: string) {
  const parsed = parseMarkdownFile(source);
  return {
    ...createDocmarkDocument(parsed.markdown, parsed.settings, "Fixture"),
    portableMarkdown: parsed.portableMarkdown,
  };
}

describe("portable Markdown front matter", () => {
  it("leaves plain Markdown body and default settings unchanged", () => {
    const source = "# Hello\r\n\r\nNormal Markdown.\r\n";
    const parsed = parseMarkdownFile(source);

    expect(parsed.markdown).toBe(source);
    expect(parsed.settings).toEqual(DEFAULT_DOCUMENT_SETTINGS);
    expect(parsed.portableMarkdown).toMatchObject({
      rawFrontMatter: null,
      includeDocmarkSettings: false,
      status: "valid",
    });
    expect(serializeMarkdownFile(asDocument(source))).toBe(source);
  });

  it("recognizes front matter only at the beginning and handles a UTF-8 BOM", () => {
    const source = "\uFEFF---\r\ntitle: Example\r\n---\r\n\r\n# Heading\r\n---\r\n";
    const parsed = parseMarkdownFile(source);

    expect(parsed.markdown).toBe("\r\n# Heading\r\n---\r\n");
    expect(parsed.portableMarkdown.includeDocmarkSettings).toBe(false);
    expect(serializeMarkdownFile(asDocument(source))).toBe(source);
  });

  it("preserves external YAML and its comments when the body changes", () => {
    const source = [
      "---",
      "# Owned by the source document",
      'title: "External title"',
      "tags:",
      "  - docs",
      "custom:",
      "  nested: true",
      "---",
      "",
      "# Original body",
    ].join("\n");
    const parsed = parseMarkdownFile(source);
    const document = asDocument(source);
    document.markdown = "# Edited body";
    const serialized = serializeMarkdownFile(document);

    expect(parsed.markdown).toBe("\n# Original body");
    expect(parsed.portableMarkdown.includeDocmarkSettings).toBe(false);
    expect(serialized).toBe(
      parsed.portableMarkdown.rawFrontMatter + document.markdown,
    );
    expect(serialized).not.toContain("docmark:");
  });

  it("restores v1 page settings while isolating invalid fields", () => {
    const parsed = parseMarkdownFile([
      "---",
      "docmark:",
      "  version: 1",
      "  page:",
      "    size: Letter",
      "    orientation: upside-down",
      "    margins:",
      "      top: 15",
      "      right: -20",
      "      bottom: 101",
      "      left: 20",
      "---",
      "# Report",
    ].join("\n"));

    expect(parsed.settings).toEqual({
      pageSize: "letter",
      orientation: "portrait",
      margins: { top: 15, right: 20, bottom: 20, left: 20 },
      pageNumbers: { enabled: false, position: "bottom-center", startAt: 1 },
    });
    expect(parsed.markdown).toBe("# Report");
    expect(parsed.portableMarkdown.includeDocmarkSettings).toBe(true);
    expect(parsed.portableMarkdown.status).toBe("invalid-settings");
    expect(parsed.warning).toMatch(/safe defaults/i);

    const invalidSource = [
      "---",
      "docmark:",
      "  version: 1",
      "  page:",
      "    size: Letter",
      "    orientation: upside-down",
      "    margins:",
      "      top: 15",
      "      right: -20",
      "      bottom: 101",
      "      left: 20",
      "---",
      "# Report",
    ].join("\n");
    const document = asDocument(invalidSource);
    expect(serializeMarkdownFile(document)).toBe(
      document.portableMarkdown.rawFrontMatter + document.markdown,
    );
    document.settings.orientation = "landscape";
    const repaired = serializeMarkdownFile(document);
    expect(repaired).toContain("orientation: landscape");
    expect(repaired).not.toContain("upside-down");
    expect(repaired).not.toContain("right: -20");
    expect(repaired).not.toContain("bottom: 101");
  });

  it("uses defaults for partial v1 metadata", () => {
    const parsed = parseMarkdownFile("---\ndocmark:\n  version: 1\n  page:\n    size: Letter\n---\n\n# Partial");

    expect(parsed.settings).toEqual({
      ...DEFAULT_DOCUMENT_SETTINGS,
      pageSize: "letter",
      margins: { ...DEFAULT_DOCUMENT_SETTINGS.margins },
    });
  });

  it("restores page numbers from v1 metadata and defaults partial fields", () => {
    const complete = parseMarkdownFile([
      "---",
      "docmark:",
      "  version: 1",
      "  pageNumbers:",
      "    enabled: true",
      "    position: bottom-right",
      "    startAt: 5",
      "---",
      "# Numbered",
    ].join("\n"));
    expect(complete.settings.pageNumbers).toEqual({
      enabled: true,
      position: "bottom-right",
      startAt: 5,
    });

    const partial = parseMarkdownFile("---\ndocmark:\n  version: 1\n  pageNumbers:\n    enabled: true\n---\n# Partial");
    expect(partial.settings.pageNumbers).toEqual({
      enabled: true,
      position: "bottom-center",
      startAt: 1,
    });
  });

  it("falls back per invalid page number field and preserves unknown fields", () => {
    const source = [
      "---",
      "docmark:",
      "  version: 1",
      "  pageNumbers:",
      "    enabled: true",
      "    position: sideways",
      "    startAt: -100",
      "    futureStyle: roman",
      "  page:",
      "    size: Letter",
      "---",
      "# Content",
    ].join("\n");
    const parsed = parseMarkdownFile(source);
    expect(parsed.settings.pageSize).toBe("letter");
    expect(parsed.settings.pageNumbers).toEqual({
      enabled: true,
      position: "bottom-center",
      startAt: 1,
    });
    expect(parsed.portableMarkdown.status).toBe("invalid-settings");

    const document = asDocument(source);
    document.settings.pageNumbers = { enabled: true, position: "bottom-left", startAt: 999999 };
    const saved = serializeMarkdownFile(document);
    expect(saved).toContain("futureStyle: roman");
    expect(saved).toContain("position: bottom-left");
    expect(saved).toContain("startAt: 999999");

    const invalidToggle = parseMarkdownFile([
      "---",
      "docmark:",
      "  version: 1",
      "  page:",
      "    size: Letter",
      "  pageNumbers:",
      "    enabled: banana",
      "    position: bottom-right",
      "    startAt: 3",
      "---",
      "# Safe fallback",
    ].join("\n"));
    expect(invalidToggle.settings.pageSize).toBe("letter");
    expect(invalidToggle.settings.pageNumbers).toEqual({
      enabled: false,
      position: "bottom-right",
      startAt: 3,
    });
  });

  it("serializes page number settings only when portable metadata is enabled", () => {
    const document = asDocument("# Body");
    document.settings.pageNumbers = { enabled: true, position: "bottom-right", startAt: 5 };
    expect(serializeMarkdownFile(document)).toBe("# Body");

    document.portableMarkdown.includeDocmarkSettings = true;
    const saved = serializeMarkdownFile(document);
    expect(saved).toContain("pageNumbers:");
    expect(saved).toContain("enabled: true");
    expect(saved).toContain("position: bottom-right");
    expect(saved).toContain("startAt: 5");
  });

  it.each([
    ["missing version", "docmark:\n  page:\n    size: Letter", "missing-version"],
    ["future version", "docmark:\n  version: 99\n  futuristic: true", "unsupported-version"],
    ["invalid version", "docmark:\n  version: nope", "invalid-docmark"],
  ] as const)("preserves %s without interpreting it", (_label, yaml, status) => {
    const source = `---\n${yaml}\n---\n\n# Keep settings local`;
    const document = asDocument(source);

    expect(document.settings).toEqual(DEFAULT_DOCUMENT_SETTINGS);
    expect(document.portableMarkdown.status).toBe(status);
    expect(document.portableMarkdown.includeDocmarkSettings).toBe(true);
    expect(serializeMarkdownFile(document)).toBe(source);
  });

  it("keeps malformed YAML and permits safe body editing", () => {
    const source = "---\ndocmark:\n  page:\n    size: [\n---\n\n# Keep me";
    const document = asDocument(source);
    document.markdown = "\n# Edited safely";

    expect(document.portableMarkdown.status).toBe("malformed");
    expect(document.settings).toEqual(DEFAULT_DOCUMENT_SETTINGS);
    expect(serializeMarkdownFile(document)).toBe(source.slice(0, source.indexOf("# Keep me")) + "# Edited safely");
  });

  it("adds and removes only Docmark's namespace", () => {
    const source = "---\n# External formatting is retained\ntitle: External\ncustom: kept\n---\n\n# Body";
    const document = asDocument(source);
    document.portableMarkdown.includeDocmarkSettings = true;
    document.settings = {
      pageSize: "letter",
      orientation: "landscape",
      margins: { top: 15, right: 20, bottom: 15, left: 20 },
      pageNumbers: { enabled: false, position: "bottom-center", startAt: 1 },
    };
    const portable = serializeMarkdownFile(document);

    expect(portable).toContain("title: External");
    expect(portable).toContain("# External formatting is retained");
    expect(portable).toContain("custom: kept");
    expect(portable).toContain("version: 1");
    expect(portable).toContain("size: Letter");
    expect(portable).toContain("orientation: landscape");
    expect(portable).toContain("top: 15");
    expect(portable).toContain("# Body");
    document.portableMarkdown.includeDocmarkSettings = false;
    const externalOnly = serializeMarkdownFile(document);
    expect(externalOnly).toContain("title: External");
    expect(externalOnly).toContain("custom: kept");
    expect(externalOnly).not.toContain("docmark:");
    expect(externalOnly).toContain("# Body");
  });

  it("removes an empty front matter block and preserves unknown Docmark fields", () => {
    const onlyDocmark = asDocument("---\ndocmark:\n  version: 1\n  page:\n    size: A4\n---\n\n# Body");
    onlyDocmark.portableMarkdown.includeDocmarkSettings = false;
    expect(serializeMarkdownFile(onlyDocmark)).toBe("\n# Body");

    const futureField = asDocument("---\ndocmark:\n  version: 1\n  futureFeature:\n    enabled: true\n  page:\n    size: A4\n---\n# Body");
    futureField.settings.pageSize = "letter";
    const serialized = serializeMarkdownFile(futureField);
    expect(serialized).toContain("futureFeature:");
    expect(serialized).toContain("enabled: true");
    expect(serialized).toContain("size: Letter");
  });

  it("round-trips page-break directives in the body", () => {
    const source = "---\ndocmark:\n  version: 1\n---\n\n# Page 1\n\n:::pagebreak\n:::\n\n# Page 2";
    const document = asDocument(source);
    const saved = serializeMarkdownFile(document);
    const reopened = parseMarkdownFile(saved);

    expect(reopened.markdown).toBe(document.markdown);
    expect(reopened.markdown).toContain(":::pagebreak\n:::");
    expect(reopened.portableMarkdown.includeDocmarkSettings).toBe(true);
  });
});
