import { describe, expect, it } from "vitest";
import {
  createDocmarkDocument,
  createDefaultPortableMarkdownMetadata,
  duplicateDocmarkDocument,
  normalizeStoredDocument,
} from "@/lib/document/model";
import { DEFAULT_DOCUMENT_SETTINGS } from "@/lib/document/settings";
import { resolveDisplayPageNumbers } from "@/lib/document/page-numbering";

describe("DocmarkDocument model", () => {
  it("creates independent documents with stable identity and source fields", () => {
    const first = createDocmarkDocument("# One", undefined, "One");
    const second = createDocmarkDocument("# Two", undefined, "Two");

    expect(first.id).toBeTruthy();
    expect(second.id).not.toBe(first.id);
    expect(first).toMatchObject({ title: "One", markdown: "# One" });
    expect(first.settings).toEqual(DEFAULT_DOCUMENT_SETTINGS);
    expect(Date.parse(first.createdAt)).not.toBeNaN();
    expect(first.updatedAt).toBe(first.createdAt);
  });

  it("duplicates content and settings with a new ID, timestamps, and title", () => {
    const source = createDocmarkDocument(":::pagebreak\n:::", {
      theme: "technical",
      pageSize: "letter",
      orientation: "landscape",
      margins: { top: 17, right: 19, bottom: 21, left: 23 },
      pageNumbers: { enabled: true, position: "bottom-right", startAt: 5, excludeCover: false },
      header: { enabled: true, text: "Header", alignment: "center" },
      footer: { enabled: true, text: "Footer", alignment: "right" },
      typography: { fontFamily: "Georgia", fontSize: 14, lineHeight: 1.6, alignment: "justify" },
      cover: { enabled: true, title: "Report", subtitle: "Quarterly", author: "Jorge", organization: "Example", date: "2026" },
    }, "Quarterly report");
    source.createdAt = "2000-01-01T00:00:00.000Z";
    source.updatedAt = "2000-01-02T00:00:00.000Z";
    source.portableMarkdown = {
      rawFrontMatter: "---\ndocmark:\n  version: 1\n---\n",
      includeDocmarkSettings: true,
      status: "valid",
    };
    const duplicate = duplicateDocmarkDocument(source);

    expect(duplicate).toMatchObject({
      title: "Quarterly report copy",
      markdown: source.markdown,
      settings: source.settings,
    });
    expect(duplicate.id).not.toBe(source.id);
    expect(Date.parse(duplicate.createdAt)).toBeGreaterThan(Date.parse(source.updatedAt));
    expect(duplicate.updatedAt).toBe(duplicate.createdAt);
    expect(duplicate.settings).not.toBe(source.settings);
    expect(duplicate.settings.margins).not.toBe(source.settings.margins);
    expect(duplicate.settings.pageNumbers).toEqual(source.settings.pageNumbers);
    expect(duplicate.settings.pageNumbers).not.toBe(source.settings.pageNumbers);
    expect(duplicate.settings.header).toEqual(source.settings.header);
    expect(duplicate.settings.header).not.toBe(source.settings.header);
    expect(duplicate.settings.footer).toEqual(source.settings.footer);
    expect(duplicate.settings.footer).not.toBe(source.settings.footer);
    expect(duplicate.settings.typography).toEqual(source.settings.typography);
    expect(duplicate.settings.typography).not.toBe(source.settings.typography);
    expect(duplicate.settings.theme).toBe("technical");
    expect(duplicate.portableMarkdown).toEqual(source.portableMarkdown);
    expect(duplicate.portableMarkdown).not.toBe(source.portableMarkdown);
    expect("fileHandle" in duplicate).toBe(false);
  });

  it("normalizes legacy persisted records and excludes runtime-only fields", () => {
    const legacy = {
      id: "legacy-1",
      title: "Legacy",
      markdown: "# Still here",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
      fileHandle: { name: "private.md" },
    };

    const normalized = normalizeStoredDocument(legacy);
    expect(normalized).toMatchObject({
      id: "legacy-1",
      title: "Legacy",
      markdown: "# Still here",
      settings: {
        ...DEFAULT_DOCUMENT_SETTINGS,
        pageNumbers: { ...DEFAULT_DOCUMENT_SETTINGS.pageNumbers, excludeCover: false },
      },
    });
    expect(normalized && "fileHandle" in normalized).toBe(false);
    expect(normalized?.portableMarkdown).toEqual(createDefaultPortableMarkdownMetadata());
  });

  it("defaults page numbers for records persisted before M6.2", () => {
    const legacy = {
      id: "pre-page-numbers",
      title: "Legacy settings",
      markdown: "# Preserved",
      settings: {
        pageSize: "a4",
        orientation: "portrait",
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
      },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    };
    expect(normalizeStoredDocument(legacy)?.settings.pageNumbers).toEqual({
      enabled: false,
      position: "bottom-center",
      startAt: 1,
      excludeCover: false,
    });
  });

  it("preserves the old included-cover numbering for persisted M6.8 records", () => {
    const now = "2024-01-02T00:00:00.000Z";
    const legacy = normalizeStoredDocument({
      id: "pre-logical-numbering",
      title: "Legacy cover numbering",
      markdown: "# Body",
      createdAt: now,
      updatedAt: now,
      settings: {
        cover: { enabled: true, title: "Cover" },
        pageNumbers: { enabled: true, position: "bottom-center", startAt: 5 },
      },
    });
    expect(legacy?.settings.pageNumbers.excludeCover).toBe(false);
    expect(resolveDisplayPageNumbers([{ kind: "cover" }, { kind: "content" }], legacy!.settings.pageNumbers))
      .toEqual([5, 6]);
  });

  it("defaults missing and unknown stored themes to Default", () => {
    const now = "2024-01-02T00:00:00.000Z";
    const missing = normalizeStoredDocument({ id: "missing", title: "Old", markdown: "", createdAt: now, updatedAt: now });
    const unknown = normalizeStoredDocument({
      id: "unknown", title: "Unknown", markdown: "", createdAt: now, updatedAt: now,
      settings: { theme: "custom" },
    });
    expect(missing?.settings.theme).toBe("default");
    expect(unknown?.settings.theme).toBe("default");
  });

  it("defaults and validates decoration fields for older or malformed records", () => {
    const now = "2024-01-02T00:00:00.000Z";
    const old = normalizeStoredDocument({ id: "old", title: "Old", markdown: "# Old", createdAt: now, updatedAt: now });
    expect(old?.settings.header).toEqual(DEFAULT_DOCUMENT_SETTINGS.header);
    expect(old?.settings.footer).toEqual(DEFAULT_DOCUMENT_SETTINGS.footer);
    const malformed = normalizeStoredDocument({
      id: "partial", title: "Partial", markdown: "", createdAt: now, updatedAt: now,
      settings: { header: { enabled: true, text: { unsafe: true }, alignment: "sideways" }, footer: { enabled: "yes", text: "safe", alignment: "right" } },
    });
    expect(malformed?.settings.header).toEqual({ enabled: true, text: "", alignment: "left" });
    expect(malformed?.settings.footer).toEqual({ enabled: false, text: "safe", alignment: "right" });
  });

  it("normalizes invalid typography fields independently and defaults records from before M6.4", () => {
    const now = "2024-01-02T00:00:00.000Z";
    const old = normalizeStoredDocument({ id: "old-typography", title: "Old", markdown: "", createdAt: now, updatedAt: now });
    expect(old?.settings.typography).toEqual(DEFAULT_DOCUMENT_SETTINGS.typography);
    const malformed = normalizeStoredDocument({
      id: "invalid-typography", title: "Invalid", markdown: "", createdAt: now, updatedAt: now,
      settings: { typography: { fontFamily: "Comic Sans Banana", fontSize: 12.5, lineHeight: -100, alignment: "diagonal" } },
    });
    expect(malformed?.settings.typography).toEqual(DEFAULT_DOCUMENT_SETTINGS.typography);
  });

  it("defaults legacy cover settings off and normalizes each field independently", () => {
    const now = "2024-01-02T00:00:00.000Z";
    const legacy = normalizeStoredDocument({ id: "pre-cover", title: "Old", markdown: "", createdAt: now });
    expect(legacy?.settings.cover).toEqual(DEFAULT_DOCUMENT_SETTINGS.cover);
    const normalized = normalizeStoredDocument({
      id: "cover", title: "Cover", markdown: "", createdAt: now,
      settings: { cover: { enabled: true, title: "A\nReport", subtitle: 42, author: "Jorge", organization: null, date: "2026" } },
    });
    expect(normalized?.settings.cover).toEqual({ enabled: true, title: "A Report", subtitle: "", author: "Jorge", organization: "", date: "2026" });
  });
});
