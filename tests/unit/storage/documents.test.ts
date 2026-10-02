import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createDocmarkDocument,
  type DocmarkDocument,
} from "@/lib/document/model";
import { DEFAULT_DOCUMENT_SETTINGS } from "@/lib/document/settings";
import {
  deleteDocument,
  getDocument,
  getLastActiveDocumentId,
  listDocuments,
  putDocument,
  restoreOrCreateLastDocument,
  setLastActiveDocumentId,
} from "@/lib/storage/documents";
import {
  DOCUMENTS_STORE_NAME,
  LAST_DOCUMENT_KEY,
  METADATA_STORE_NAME,
  openDocmarkDatabase,
  transactionResult,
} from "@/lib/storage/indexed-db";

function fixture(
  id: string,
  title: string,
  markdown: string,
  updatedAt: string,
  settings = DEFAULT_DOCUMENT_SETTINGS,
): DocmarkDocument {
  return {
    id,
    title,
    markdown,
    settings,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt,
  };
}

async function storeLastActiveValue(value: string): Promise<void> {
  const database = await openDocmarkDatabase();
  const transaction = database.transaction(METADATA_STORE_NAME, "readwrite");
  transaction.objectStore(METADATA_STORE_NAME).put({ key: LAST_DOCUMENT_KEY, value });
  await transactionResult(transaction);
}

describe("IndexedDB document persistence", () => {
  beforeEach(async () => {
    const database = await openDocmarkDatabase();
    const transaction = database.transaction(
      [DOCUMENTS_STORE_NAME, METADATA_STORE_NAME],
      "readwrite",
    );
    transaction.objectStore(DOCUMENTS_STORE_NAME).clear();
    transaction.objectStore(METADATA_STORE_NAME).clear();
    await transactionResult(transaction);
  });

  it("round-trips Markdown, title, and custom physical settings", async () => {
    const document = fixture(
      "report-1",
      "Custom report",
      "# Source\n\n:::pagebreak\n:::",
      "2024-03-01T00:00:00.000Z",
      {
        pageSize: "letter",
        orientation: "landscape",
        margins: { top: 17, right: 19, bottom: 21, left: 23 },
      },
    );

    await putDocument(document);

    await expect(getDocument(document.id)).resolves.toEqual(document);
    await expect(listDocuments()).resolves.toEqual([{
      id: document.id,
      title: document.title,
      updatedAt: document.updatedAt,
    }]);
  });

  it("lists documents by updatedAt descending", async () => {
    const oldest = fixture("old", "Old", "", "2024-01-01T00:00:00.000Z");
    const newest = fixture("new", "New", "", "2024-03-01T00:00:00.000Z");
    const middle = fixture("middle", "Middle", "", "2024-02-01T00:00:00.000Z");
    await Promise.all([putDocument(oldest), putDocument(newest), putDocument(middle)]);

    await expect(listDocuments()).resolves.toMatchObject([
      { id: "new" },
      { id: "middle" },
      { id: "old" },
    ]);
  });

  it("persists and restores a valid last-active document", async () => {
    const first = fixture("first", "First", "# first", "2024-01-01T00:00:00.000Z");
    const second = fixture("second", "Second", "# second", "2024-02-01T00:00:00.000Z");
    await putDocument(first, { activate: true });
    await putDocument(second);
    await setLastActiveDocumentId(first.id);

    await expect(getLastActiveDocumentId()).resolves.toBe(first.id);
    await expect(restoreOrCreateLastDocument("starter")).resolves.toEqual(first);
  });

  it("falls back to the most recently updated record for an invalid active ID", async () => {
    const older = fixture("older", "Older", "# old", "2024-01-01T00:00:00.000Z");
    const newest = fixture("newest", "Newest", "# latest", "2024-02-01T00:00:00.000Z");
    await putDocument(older);
    await putDocument(newest);
    await storeLastActiveValue("missing-id");

    await expect(restoreOrCreateLastDocument("starter")).resolves.toEqual(newest);
    await expect(getLastActiveDocumentId()).resolves.toBe(newest.id);
  });

  it("creates and activates a starter document when storage is empty", async () => {
    const restored = await restoreOrCreateLastDocument("# Welcome");

    expect(restored.markdown).toBe("# Welcome");
    expect(restored.settings).toEqual(DEFAULT_DOCUMENT_SETTINGS);
    await expect(getDocument(restored.id)).resolves.toEqual(restored);
    await expect(getLastActiveDocumentId()).resolves.toBe(restored.id);
  });

  it("deletes a document without recreating it and selects a valid remaining record", async () => {
    const active = fixture("active", "Active", "# A", "2024-01-01T00:00:00.000Z");
    const remaining = fixture("remaining", "Remaining", "# B", "2024-02-01T00:00:00.000Z");
    await putDocument(active, { activate: true });
    await putDocument(remaining);

    const result = await deleteDocument(active.id);

    await expect(getDocument(active.id)).resolves.toBeNull();
    expect(result.documents.map(({ id }) => id)).toEqual([remaining.id]);
    expect(result.activeDocument.id).toBe(remaining.id);
    await expect(getLastActiveDocumentId()).resolves.toBe(remaining.id);
  });

  it("creates the requested replacement when deleting the last document", async () => {
    const only = fixture("only", "Only", "# Last", "2024-01-01T00:00:00.000Z");
    const replacement = createDocmarkDocument("", DEFAULT_DOCUMENT_SETTINGS);
    await putDocument(only, { activate: true });

    const result = await deleteDocument(only.id, replacement);

    await expect(getDocument(only.id)).resolves.toBeNull();
    await expect(getDocument(replacement.id)).resolves.toEqual(replacement);
    expect(result.activeDocument.id).toBe(replacement.id);
    await expect(getLastActiveDocumentId()).resolves.toBe(replacement.id);
  });
});
