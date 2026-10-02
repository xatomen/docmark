import { describe, expect, it } from "vitest";
import {
  createDocmarkDocument,
  duplicateDocmarkDocument,
  normalizeStoredDocument,
} from "@/lib/document/model";
import { DEFAULT_DOCUMENT_SETTINGS } from "@/lib/document/settings";

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
      pageSize: "letter",
      orientation: "landscape",
      margins: { top: 17, right: 19, bottom: 21, left: 23 },
    }, "Quarterly report");
    source.createdAt = "2000-01-01T00:00:00.000Z";
    source.updatedAt = "2000-01-02T00:00:00.000Z";
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
      settings: DEFAULT_DOCUMENT_SETTINGS,
    });
    expect(normalized && "fileHandle" in normalized).toBe(false);
  });
});
