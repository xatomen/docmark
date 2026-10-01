export const DOCMARK_DATABASE_NAME = "docmark";
export const DOCMARK_DATABASE_VERSION = 1;
export const DOCUMENTS_STORE_NAME = "documents";
export const METADATA_STORE_NAME = "metadata";
export const LAST_DOCUMENT_KEY = "lastDocumentId";

let databasePromise: Promise<IDBDatabase> | null = null;

export function openDocmarkDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
  }
  if (databasePromise) return databasePromise;

  const openingPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(
      DOCMARK_DATABASE_NAME,
      DOCMARK_DATABASE_VERSION,
    );

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (databasePromise === openingPromise) databasePromise = null;
      reject(error);
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DOCUMENTS_STORE_NAME)) {
        database.createObjectStore(DOCUMENTS_STORE_NAME, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(METADATA_STORE_NAME)) {
        database.createObjectStore(METADATA_STORE_NAME, { keyPath: "key" });
      }
    };

    request.onblocked = () => {
      fail(new Error("The local document database upgrade is blocked."));
    };

    request.onerror = () => {
      fail(request.error ?? new Error("Could not open the local document database."));
    };

    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }

      settled = true;
      database.onversionchange = () => {
        database.close();
        if (databasePromise === openingPromise) databasePromise = null;
      };
      resolve(database);
    };
  });

  databasePromise = openingPromise;
  return openingPromise;
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error("A local database request failed."));
    };
  });
}

export function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("A local database transaction failed."));
    };
    transaction.onerror = () => {
      // Let IndexedDB abort the transaction and report its request error.
    };
  });
}
