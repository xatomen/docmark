import {
  createDocmarkDocument,
  DEFAULT_DOCUMENT_TITLE,
  normalizeStoredDocument,
  type DocmarkDocument,
} from "@/lib/document/model";
import {
  DEFAULT_DOCUMENT_SETTINGS,
  type DocumentSettings,
} from "@/lib/document/settings";
import {
  DOCUMENTS_STORE_NAME,
  LAST_DOCUMENT_KEY,
  METADATA_STORE_NAME,
  openDocmarkDatabase,
  requestResult,
  transactionResult,
} from "@/lib/storage/indexed-db";

export const AUTOSAVE_DELAY_MS = 500;

type LastDocumentRecord = {
  key: typeof LAST_DOCUMENT_KEY;
  value: string;
};

function isLastDocumentRecord(value: unknown): value is LastDocumentRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "key" in value &&
    value.key === LAST_DOCUMENT_KEY &&
    "value" in value &&
    typeof value.value === "string"
  );
}

/**
 * Restores the last active record, or creates exactly one starter document.
 * A readwrite transaction makes simultaneous first launches converge on one ID.
 */
export async function restoreOrCreateLastDocument(
  initialMarkdown: string,
  settings: DocumentSettings = DEFAULT_DOCUMENT_SETTINGS,
): Promise<DocmarkDocument> {
  const database = await openDocmarkDatabase();
  const transaction = database.transaction(
    [DOCUMENTS_STORE_NAME, METADATA_STORE_NAME],
    "readwrite",
  );
  const documents = transaction.objectStore(DOCUMENTS_STORE_NAME);
  const metadata = transaction.objectStore(METADATA_STORE_NAME);
  let selectedDocument: DocmarkDocument | null = null;

  const completed = transactionResult(transaction).then(() => {
    if (!selectedDocument) {
      throw new Error("The local document database returned no usable document.");
    }
    return selectedDocument;
  });

  const selectMostRecentOrCreate = () => {
    const request = documents.getAll();
    request.onsuccess = () => {
      try {
        const candidates = (request.result as unknown[])
          .map((candidate) => normalizeStoredDocument(candidate))
          .filter((candidate): candidate is DocmarkDocument => candidate !== null)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

        if (candidates.length > 0) {
          selectedDocument = candidates[0];
        } else {
          selectedDocument = createDocmarkDocument(
            initialMarkdown,
            settings,
            DEFAULT_DOCUMENT_TITLE,
          );
          documents.add(selectedDocument);
        }

        metadata.put({ key: LAST_DOCUMENT_KEY, value: selectedDocument.id });
      } catch {
        transaction.abort();
      }
    };
  };

  const activeRequest = metadata.get(LAST_DOCUMENT_KEY);
  activeRequest.onsuccess = () => {
    const record = activeRequest.result as unknown;
    if (!isLastDocumentRecord(record)) {
      selectMostRecentOrCreate();
      return;
    }

    const documentRequest = documents.get(record.value);
    documentRequest.onsuccess = () => {
      const restored = normalizeStoredDocument(documentRequest.result, record.value);
      if (restored) {
        selectedDocument = restored;
      } else {
        selectMostRecentOrCreate();
      }
    };
  };

  return completed;
}

export async function getDocument(id: string): Promise<DocmarkDocument | null> {
  const database = await openDocmarkDatabase();
  const transaction = database.transaction(DOCUMENTS_STORE_NAME, "readonly");
  const request = transaction.objectStore(DOCUMENTS_STORE_NAME).get(id);
  const [value] = await Promise.all([
    requestResult(request),
    transactionResult(transaction),
  ]);
  return normalizeStoredDocument(value, id);
}

export async function listDocuments(): Promise<DocmarkDocument[]> {
  const database = await openDocmarkDatabase();
  const transaction = database.transaction(DOCUMENTS_STORE_NAME, "readonly");
  const request = transaction.objectStore(DOCUMENTS_STORE_NAME).getAll();
  const [values] = await Promise.all([
    requestResult(request),
    transactionResult(transaction),
  ]);
  return (values as unknown[])
    .map((value) => normalizeStoredDocument(value))
    .filter((document): document is DocmarkDocument => document !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function putDocument(document: DocmarkDocument): Promise<void> {
  const validDocument = normalizeStoredDocument(document, document.id);
  if (!validDocument) throw new Error("The document is not valid for local storage.");

  const database = await openDocmarkDatabase();
  const transaction = database.transaction(
    [DOCUMENTS_STORE_NAME, METADATA_STORE_NAME],
    "readwrite",
  );
  transaction.objectStore(DOCUMENTS_STORE_NAME).put(validDocument);
  transaction
    .objectStore(METADATA_STORE_NAME)
    .put({ key: LAST_DOCUMENT_KEY, value: validDocument.id });
  await transactionResult(transaction);
}

export async function deleteDocument(id: string): Promise<void> {
  const database = await openDocmarkDatabase();
  const transaction = database.transaction(
    [DOCUMENTS_STORE_NAME, METADATA_STORE_NAME],
    "readwrite",
  );
  const documents = transaction.objectStore(DOCUMENTS_STORE_NAME);
  const metadata = transaction.objectStore(METADATA_STORE_NAME);
  documents.delete(id);

  const activeRequest = metadata.get(LAST_DOCUMENT_KEY);
  activeRequest.onsuccess = () => {
    if (isLastDocumentRecord(activeRequest.result) && activeRequest.result.value === id) {
      metadata.delete(LAST_DOCUMENT_KEY);
    }
  };

  await transactionResult(transaction);
}
