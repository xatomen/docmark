import {
  createDocmarkDocument,
  DEFAULT_DOCUMENT_TITLE,
  normalizeStoredDocument,
  normalizeStoredDocumentSummary,
  type DocmarkDocument,
  type DocmarkDocumentSummary,
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

export async function listDocuments(): Promise<DocmarkDocumentSummary[]> {
  const database = await openDocmarkDatabase();
  const transaction = database.transaction(DOCUMENTS_STORE_NAME, "readonly");
  const request = transaction.objectStore(DOCUMENTS_STORE_NAME).getAll();
  const [values] = await Promise.all([
    requestResult(request),
    transactionResult(transaction),
  ]);
  return (values as unknown[])
    .map((value) => normalizeStoredDocumentSummary(value))
    .filter((document): document is DocmarkDocumentSummary => document !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function putDocument(
  document: DocmarkDocument,
  options: { activate?: boolean } = {},
): Promise<void> {
  const validDocument = normalizeStoredDocument(document, document.id);
  if (!validDocument) throw new Error("The document is not valid for local storage.");

  const database = await openDocmarkDatabase();
  const transaction = options.activate
    ? database.transaction([DOCUMENTS_STORE_NAME, METADATA_STORE_NAME], "readwrite")
    : database.transaction(DOCUMENTS_STORE_NAME, "readwrite");
  transaction.objectStore(DOCUMENTS_STORE_NAME).put(validDocument);
  if (options.activate) {
    transaction
      .objectStore(METADATA_STORE_NAME)
      .put({ key: LAST_DOCUMENT_KEY, value: validDocument.id });
  }
  await transactionResult(transaction);
}

export async function getLastActiveDocumentId(): Promise<string | null> {
  const database = await openDocmarkDatabase();
  const transaction = database.transaction(METADATA_STORE_NAME, "readonly");
  const request = transaction.objectStore(METADATA_STORE_NAME).get(LAST_DOCUMENT_KEY);
  const [value] = await Promise.all([
    requestResult(request),
    transactionResult(transaction),
  ]);
  return isLastDocumentRecord(value) ? value.value : null;
}

export async function setLastActiveDocumentId(id: string): Promise<void> {
  const database = await openDocmarkDatabase();
  const transaction = database.transaction(
    [DOCUMENTS_STORE_NAME, METADATA_STORE_NAME],
    "readwrite",
  );
  const request = transaction.objectStore(DOCUMENTS_STORE_NAME).get(id);
  request.onsuccess = () => {
    if (!normalizeStoredDocument(request.result, id)) {
      transaction.abort();
      return;
    }
    transaction
      .objectStore(METADATA_STORE_NAME)
      .put({ key: LAST_DOCUMENT_KEY, value: id });
  };
  await transactionResult(transaction);
}

export async function deleteDocument(
  id: string,
  replacementIfLast?: DocmarkDocument,
): Promise<{ documents: DocmarkDocumentSummary[]; activeDocument: DocmarkDocument }> {
  const database = await openDocmarkDatabase();
  const transaction = database.transaction(
    [DOCUMENTS_STORE_NAME, METADATA_STORE_NAME],
    "readwrite",
  );
  const documentStore = transaction.objectStore(DOCUMENTS_STORE_NAME);
  const metadata = transaction.objectStore(METADATA_STORE_NAME);
  documentStore.delete(id);

  let activeId: string | null = null;
  let remaining: DocmarkDocument[] | null = null;
  let resultDocuments: DocmarkDocumentSummary[] = [];
  let activeDocument: DocmarkDocument | null = null;
  let selectionResolved = false;
  const resolveSelection = () => {
    if (selectionResolved || activeId === null && remaining === null) return;
    if (activeId === null || remaining === null) return;
    selectionResolved = true;
    try {
      const sorted = remaining.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      if (sorted.length === 0) {
        const replacement = replacementIfLast
          ? normalizeStoredDocument(replacementIfLast, replacementIfLast.id)
          : null;
        if (!replacement) throw new Error("A replacement document is required when deleting the last document.");
        documentStore.add(replacement);
        activeDocument = replacement;
      } else {
        activeDocument = sorted.find((document) => document.id === activeId) ?? sorted[0];
      }

      if (activeId === id || !sorted.some((document) => document.id === activeId)) {
        metadata.put({ key: LAST_DOCUMENT_KEY, value: activeDocument.id });
      }
      resultDocuments = sorted.length === 0
        ? [{ id: activeDocument.id, title: activeDocument.title, updatedAt: activeDocument.updatedAt }]
        : sorted.map(({ id: documentId, title, updatedAt }) => ({ id: documentId, title, updatedAt }));
    } catch {
      transaction.abort();
    }
  };

  const activeRequest = metadata.get(LAST_DOCUMENT_KEY);
  activeRequest.onsuccess = () => {
    activeId = isLastDocumentRecord(activeRequest.result) ? activeRequest.result.value : "";
    resolveSelection();
  };
  const documentsRequest = documentStore.getAll();
  documentsRequest.onsuccess = () => {
    remaining = (documentsRequest.result as unknown[])
      .map((value) => normalizeStoredDocument(value))
      .filter((document): document is DocmarkDocument => document !== null && document.id !== id);
    resolveSelection();
  };

  await transactionResult(transaction);
  if (!activeDocument) throw new Error("The document list could not be updated.");
  return { documents: resultDocuments, activeDocument };
}
