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
  it("parses and serializes stable document theme IDs in v1 metadata", () => {
    const source = "---\ndocmark:\n  version: 1\n  theme: technical\n---\n# Theme";
    const parsed = parseMarkdownFile(source);
    expect(parsed.settings.theme).toBe("technical");
    expect(parsed.portableMarkdown.status).toBe("valid");

    const document = asDocument(source);
    document.settings.theme = "academic";
    expect(serializeMarkdownFile(document)).toContain("theme: academic");

    const unknown = parseMarkdownFile(source.replace("technical", "custom-theme"));
    expect(unknown.settings.theme).toBe("default");
    expect(unknown.portableMarkdown.status).toBe("invalid-settings");
    expect(serializeMarkdownFile(asDocument(source.replace("technical", "custom-theme")))).toBe(source.replace("technical", "custom-theme"));
  });

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
      theme: "default",
      pageSize: "letter",
      orientation: "portrait",
      margins: { top: 15, right: 20, bottom: 20, left: 20 },
      pageNumbers: { enabled: false, position: "bottom-center", startAt: 1 },
      header: { enabled: false, text: "", alignment: "left" },
      footer: { enabled: false, text: "", alignment: "left" },
      typography: { ...DEFAULT_DOCUMENT_SETTINGS.typography },
      cover: { ...DEFAULT_DOCUMENT_SETTINGS.cover },
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

  it("parses, validates, and serializes header/footer settings as portable v1 metadata", () => {
    const source = [
      "---", "docmark:", "  version: 1", "  header:", "    enabled: true",
      "    text: Architecture Report", "    alignment: center", "    futureStyle: compact",
      "  footer:", "    enabled: true", "    text: Internal use only", "    alignment: right",
      "---", "# Body",
    ].join("\n");
    const parsed = parseMarkdownFile(source);
    expect(parsed.settings.header).toEqual({ enabled: true, text: "Architecture Report", alignment: "center" });
    expect(parsed.settings.footer).toEqual({ enabled: true, text: "Internal use only", alignment: "right" });
    const document = asDocument(source);
    document.settings.footer.text = "Confidential";
    const saved = serializeMarkdownFile(document);
    expect(saved).toContain("futureStyle: compact");
    expect(saved).toContain("text: Confidential");
    expect(saved).toContain("version: 1");

    document.portableMarkdown.includeDocmarkSettings = false;
    expect(serializeMarkdownFile(document)).not.toContain("header:");
    expect(serializeMarkdownFile(document)).not.toContain("footer:");
  });

  it("defaults partial decoration metadata and validates each field independently", () => {
    const partial = parseMarkdownFile("---\ndocmark:\n  version: 1\n  header:\n    enabled: true\n    text: Architecture Report\n---\n# Body");
    expect(partial.settings.header).toEqual({ enabled: true, text: "Architecture Report", alignment: "left" });
    expect(partial.settings.footer).toEqual(DEFAULT_DOCUMENT_SETTINGS.footer);
    const invalid = parseMarkdownFile("---\ndocmark:\n  version: 1\n  header:\n    enabled: banana\n    text:\n      object: invalid\n    alignment: sideways\n  footer:\n    enabled: true\n    text: Kept\n    alignment: right\n---\n# Body");
    expect(invalid.settings.header).toEqual(DEFAULT_DOCUMENT_SETTINGS.header);
    expect(invalid.settings.footer).toEqual({ enabled: true, text: "Kept", alignment: "right" });
    expect(invalid.portableMarkdown.status).toBe("invalid-settings");
  });

  it("parses, validates, and serializes typography in v1 while preserving unknown settings", () => {
    const source = [
      "---", "docmark:", "  version: 1", "  typography:", "    fontFamily: Georgia",
      "    fontSize: 12", "    lineHeight: 1.6", "    alignment: justify", "    futureKerning: optical",
      "---", "# Body",
    ].join("\n");
    const parsed = parseMarkdownFile(source);
    expect(parsed.settings.typography).toEqual({ fontFamily: "Georgia", fontSize: 12, lineHeight: 1.6, alignment: "justify" });
    const document = asDocument(source);
    document.settings.typography.fontSize = 14;
    const saved = serializeMarkdownFile(document);
    expect(saved).toContain("futureKerning: optical");
    expect(saved).toContain("fontSize: 14");
    expect(saved).toContain("version: 1");

    const partial = parseMarkdownFile("---\ndocmark:\n  version: 1\n  typography:\n    fontFamily: Georgia\n    alignment: right\n---\n# Partial");
    expect(partial.settings.typography).toEqual({ ...DEFAULT_DOCUMENT_SETTINGS.typography, fontFamily: "Georgia", alignment: "right" });
    const invalid = parseMarkdownFile("---\ndocmark:\n  version: 1\n  typography:\n    fontFamily: Comic Sans Banana\n    fontSize: huge\n    lineHeight: -100\n    alignment: diagonal\n---\n# Invalid");
    expect(invalid.settings.typography).toEqual(DEFAULT_DOCUMENT_SETTINGS.typography);
    expect(invalid.portableMarkdown.status).toBe("invalid-settings");
    document.portableMarkdown.includeDocmarkSettings = false;
    expect(serializeMarkdownFile(document)).not.toContain("typography:");
  });

  it("accepts and round-trips the bundled Montserrat font in Front Matter v1", () => {
    const source = [
      "---", "docmark:", "  version: 1", "  typography:",
      "    fontFamily: Montserrat", "    fontSize: 11", "    lineHeight: 1.75",
      "    alignment: left", "---", "# Local typography",
    ].join("\n");
    const parsed = parseMarkdownFile(source);

    expect(parsed.settings.typography).toEqual({
      fontFamily: "Montserrat", fontSize: 11, lineHeight: 1.75, alignment: "left",
    });
    expect(parsed.portableMarkdown.status).toBe("valid");
    expect(serializeMarkdownFile(parsed)).toContain("fontFamily: Montserrat");
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
      theme: "default",
      pageSize: "letter",
      orientation: "landscape",
      margins: { top: 15, right: 20, bottom: 15, left: 20 },
      pageNumbers: { enabled: false, position: "bottom-center", startAt: 1 },
      header: { enabled: false, text: "", alignment: "left" },
      footer: { enabled: false, text: "", alignment: "left" },
      typography: { ...DEFAULT_DOCUMENT_SETTINGS.typography },
      cover: { ...DEFAULT_DOCUMENT_SETTINGS.cover },
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

  it("validates cover fields independently and round-trips portable cover settings", () => {
    const source = [
      "---", "custom: retained", "docmark:", "  version: 1", "  cover:",
      "    enabled: true", "    title: 'Architecture Report'", "    subtitle: 4",
      "    author: Jorge", "    organization: Example", "    date: '2026-10-02'",
      "    futureField: kept", "---", "# Body",
    ].join("\n");
    const parsed = parseMarkdownFile(source);
    expect(parsed.settings.cover).toEqual({
      enabled: true, title: "Architecture Report", subtitle: "", author: "Jorge",
      organization: "Example", date: "2026-10-02",
    });
    expect(parsed.portableMarkdown.status).toBe("invalid-settings");
    parsed.settings.cover.subtitle = "Cloud platform";
    const saved = serializeMarkdownFile(parsed);
    expect(saved).toContain("futureField: kept");
    expect(saved).toContain("subtitle: Cloud platform");
    expect(saved).toContain("custom: retained");
    expect(parseMarkdownFile(saved).settings.cover.subtitle).toBe("Cloud platform");
  });

  it("keeps cover settings local when portable metadata is off", () => {
    const document = asDocument("# Local cover");
    document.settings.cover = { enabled: true, title: "Local", subtitle: "", author: "", organization: "", date: "" };
    expect(serializeMarkdownFile(document)).toBe("# Local cover");
  });
});
