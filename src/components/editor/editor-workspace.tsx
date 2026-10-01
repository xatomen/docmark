"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentSwitcher } from "@/components/editor/document-switcher";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { DocumentPreview } from "@/components/preview/document-preview";
import { DocumentSettingsControls } from "@/components/preview/document-settings-controls";
import {
  createDocmarkDocument,
  DEFAULT_DOCUMENT_TITLE,
  type DocmarkDocument,
  type DocmarkDocumentSummary,
} from "@/lib/document/model";
import {
  DEFAULT_DOCUMENT_SETTINGS,
  type DocumentSettings,
} from "@/lib/document/settings";
import {
  AUTOSAVE_DELAY_MS,
  deleteDocument as deleteStoredDocument,
  getDocument,
  listDocuments,
  putDocument,
  restoreOrCreateLastDocument,
  setLastActiveDocumentId,
} from "@/lib/storage/documents";

const initialMarkdown = `# Welcome to Docmark

Create polished documents using **Markdown**. Write with _focus_, and your content stays on your device.

## Features

- Local-first
- Private
- Fast

## Example

| Feature | Status |
| --- | --- |
| Markdown | ✅ |
| Live preview | ✅ |
| Browser print | Available |

> Your documents stay on your device.


\`\`\`typescript
const project = "Docmark";
\`\`\`
`;

type PersistenceStatus = "loading" | "saved" | "saving" | "error";

type PendingSave = {
  document: DocmarkDocument;
  revision: number;
};

function sameSettings(left: DocumentSettings, right: DocumentSettings): boolean {
  return (
    left.pageSize === right.pageSize &&
    left.orientation === right.orientation &&
    left.margins.top === right.margins.top &&
    left.margins.right === right.margins.right &&
    left.margins.bottom === right.margins.bottom &&
    left.margins.left === right.margins.left
  );
}

function normalizeTitle(title: string): string {
  return title.trim() || DEFAULT_DOCUMENT_TITLE;
}

export function EditorWorkspace() {
  const [documentRecord, setDocumentRecord] = useState<DocmarkDocument | null>(null);
  const [documents, setDocuments] = useState<DocmarkDocumentSummary[]>([]);
  const [persistenceStatus, setPersistenceStatus] =
    useState<PersistenceStatus>("loading");
  const [paginationReady, setPaginationReady] = useState(false);
  const [printError, setPrintError] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [isWorkspaceTransitioning, setIsWorkspaceTransitioning] = useState(false);
  const documentRef = useRef<DocmarkDocument | null>(null);
  const documentRevisionRef = useRef(0);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveRef = useRef<PendingSave | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromisesRef = useRef(new Map<string, Promise<void>>());
  const switchGenerationRef = useRef(0);
  const switchingRef = useRef(false);
  const managementLockRef = useRef(false);
  const mountedRef = useRef(false);

  const enqueueOperation = useCallback(<T,>(operation: () => Promise<T>) => {
    const result = operationQueueRef.current
      .catch(() => undefined)
      .then(operation);
    operationQueueRef.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);

  const refreshDocumentList = useCallback(async () => {
    const listedDocuments = await listDocuments();
    if (mountedRef.current) setDocuments(listedDocuments);
    return listedDocuments;
  }, []);

  const queueDocumentSave = useCallback((pending: PendingSave) => {
    const operation = enqueueOperation(async () => {
      if (
        documentRef.current?.id === pending.document.id &&
        pending.revision !== documentRevisionRef.current
      ) return;

      await putDocument(pending.document);
      await refreshDocumentList();
      if (
        documentRef.current?.id === pending.document.id &&
        pending.revision === documentRevisionRef.current &&
        mountedRef.current
      ) {
        setPersistenceStatus("saved");
      }
    }).catch((error: unknown) => {
      if (
        documentRef.current?.id === pending.document.id &&
        pending.revision === documentRevisionRef.current &&
        mountedRef.current
      ) {
        setPersistenceStatus("error");
        setDocumentError(error instanceof Error ? error.message : "Could not save this document locally.");
      }
      throw error;
    });

    savePromisesRef.current.set(pending.document.id, operation);
    return operation;
  }, [enqueueOperation, refreshDocumentList]);

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const flushPendingSave = useCallback(() => {
    clearAutosaveTimer();
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) return queueDocumentSave(pending);
    const activeId = documentRef.current?.id;
    return activeId
      ? savePromisesRef.current.get(activeId) ?? operationQueueRef.current
      : operationQueueRef.current;
  }, [clearAutosaveTimer, queueDocumentSave]);

  const updateDocument = useCallback((
    change: Partial<Pick<DocmarkDocument, "title" | "markdown" | "settings">>,
    saveImmediately = false,
  ) => {
    const current = documentRef.current;
    if (!current) return;

    const next: DocmarkDocument = {
      ...current,
      ...change,
      updatedAt: new Date().toISOString(),
    };
    documentRef.current = next;
    const pending = {
      document: next,
      revision: ++documentRevisionRef.current,
    };
    pendingSaveRef.current = pending;
    setDocumentRecord(next);
    setPersistenceStatus("saving");
    setDocumentError(null);
    clearAutosaveTimer();

    if (saveImmediately) {
      pendingSaveRef.current = null;
      void queueDocumentSave(pending).catch(() => undefined);
      return;
    }

    autosaveTimerRef.current = setTimeout(() => {
      if (pendingSaveRef.current?.revision !== pending.revision) return;
      autosaveTimerRef.current = null;
      pendingSaveRef.current = null;
      void queueDocumentSave(pending).catch(() => undefined);
    }, AUTOSAVE_DELAY_MS);
  }, [clearAutosaveTimer, queueDocumentSave]);

  useEffect(() => {
    let active = true;
    mountedRef.current = true;

    restoreOrCreateLastDocument(initialMarkdown, DEFAULT_DOCUMENT_SETTINGS)
      .then(async (document) => {
        const listedDocuments = await listDocuments();
        if (!active) return;
        documentRef.current = document;
        documentRevisionRef.current += 1;
        setDocumentRecord(document);
        setDocuments(listedDocuments);
        setPersistenceStatus("saved");
      })
      .catch((error: unknown) => {
        if (!active) return;
        const volatileDocument = createDocmarkDocument(
          initialMarkdown,
          DEFAULT_DOCUMENT_SETTINGS,
          DEFAULT_DOCUMENT_TITLE,
        );
        documentRef.current = volatileDocument;
        setDocumentRecord(volatileDocument);
        setPersistenceStatus("error");
        setDocumentError(error instanceof Error ? error.message : "Local storage is unavailable.");
      });

    const persistWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        void flushPendingSave().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", persistWhenHidden);
    window.addEventListener("pagehide", persistWhenHidden);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", persistWhenHidden);
      window.removeEventListener("pagehide", persistWhenHidden);
      clearAutosaveTimer();
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending) void queueDocumentSave(pending).catch(() => undefined);
      mountedRef.current = false;
    };
  }, [clearAutosaveTimer, flushPendingSave, queueDocumentSave]);

  const updateMarkdown = useCallback((value: string) => {
    if (documentRef.current?.markdown === value) return;
    setPaginationReady(false);
    updateDocument({ markdown: value });
  }, [updateDocument]);

  const updateDocumentSettings = useCallback((settings: DocumentSettings) => {
    const current = documentRef.current;
    if (!current || sameSettings(current.settings, settings)) return;
    setPaginationReady(false);
    updateDocument({ settings });
  }, [updateDocument]);

  const finishActivation = useCallback(async (document: DocmarkDocument) => {
    documentRef.current = document;
    documentRevisionRef.current += 1;
    pendingSaveRef.current = null;
    clearAutosaveTimer();
    setDocumentRecord(document);
    setIsWorkspaceTransitioning(false);
    setPersistenceStatus("saved");
    setDocumentError(null);
    setPaginationReady(false);
    setPrintError(false);
    try {
      await refreshDocumentList();
    } catch (error) {
      setPersistenceStatus("error");
      setDocumentError(error instanceof Error ? error.message : "Could not refresh the document list.");
    }
  }, [clearAutosaveTimer, refreshDocumentList]);

  const switchDocument = useCallback((id: string) => {
    if (
      managementLockRef.current ||
      (documentRef.current?.id === id && !switchingRef.current)
    ) return;
    const generation = ++switchGenerationRef.current;
    switchingRef.current = true;
    const previousDocument = documentRef.current;
    setIsSwitching(true);
    setIsWorkspaceTransitioning(true);
    setDocumentError(null);
    setPersistenceStatus("loading");

    void flushPendingSave()
      .then(() => enqueueOperation(async () => {
        const target = await getDocument(id);
        if (!target) throw new Error("This document is no longer available in local storage.");
        if (generation !== switchGenerationRef.current) return;
        await setLastActiveDocumentId(id);
        if (generation !== switchGenerationRef.current) return;
        await finishActivation(target);
      }))
      .catch((error: unknown) => {
        if (generation !== switchGenerationRef.current) return;
        if (previousDocument) {
          documentRef.current = previousDocument;
          setDocumentRecord(previousDocument);
        }
        setIsWorkspaceTransitioning(false);
        setPersistenceStatus("error");
        setDocumentError(error instanceof Error ? error.message : "Could not open this document.");
      })
      .finally(() => {
        if (generation === switchGenerationRef.current) {
          switchingRef.current = false;
          setIsSwitching(false);
        }
      });
  }, [enqueueOperation, finishActivation, flushPendingSave]);

  const beginManagement = useCallback(() => {
    if (managementLockRef.current) return false;
    managementLockRef.current = true;
    switchGenerationRef.current += 1;
    switchingRef.current = false;
    setIsSwitching(false);
    setIsManaging(true);
    return true;
  }, []);

  const endManagement = useCallback(() => {
    managementLockRef.current = false;
    setIsManaging(false);
  }, []);

  const createNewDocument = useCallback(() => {
    if (!beginManagement()) return;
    const previousDocument = documentRef.current;
    const newDocument = createDocmarkDocument("", DEFAULT_DOCUMENT_SETTINGS);
    setIsWorkspaceTransitioning(true);
    setPersistenceStatus("loading");
    setDocumentError(null);

    void flushPendingSave()
      .then(() => enqueueOperation(async () => {
        await putDocument(newDocument, { activate: true });
        await finishActivation(newDocument);
      }))
      .catch((error: unknown) => {
        if (previousDocument) {
          documentRef.current = previousDocument;
          setDocumentRecord(previousDocument);
        }
        setIsWorkspaceTransitioning(false);
        setPersistenceStatus("error");
        setDocumentError(error instanceof Error ? error.message : "Could not create a document.");
      })
      .finally(endManagement);
  }, [beginManagement, endManagement, enqueueOperation, finishActivation, flushPendingSave]);

  const renameDocument = useCallback((id: string, rawTitle: string) => {
    const title = normalizeTitle(rawTitle);
    const current = documentRef.current;
    if (current?.id === id) {
      if (current.title !== title) updateDocument({ title }, true);
      return;
    }
    if (!beginManagement()) return;

    setDocumentError(null);
    void enqueueOperation(async () => {
      const target = await getDocument(id);
      if (!target) throw new Error("This document is no longer available.");
      const renamed = { ...target, title, updatedAt: new Date().toISOString() };
      await putDocument(renamed);
      await refreshDocumentList();
    })
      .catch((error: unknown) => {
        setPersistenceStatus("error");
        setDocumentError(error instanceof Error ? error.message : "Could not rename this document.");
      })
      .finally(endManagement);
  }, [beginManagement, endManagement, enqueueOperation, refreshDocumentList, updateDocument]);

  const duplicateDocument = useCallback((id: string) => {
    if (!beginManagement()) return;
    const activeBefore = documentRef.current;
    setIsWorkspaceTransitioning(true);
    setPersistenceStatus("loading");
    setDocumentError(null);

    void flushPendingSave()
      .then(() => enqueueOperation(async () => {
        const source = documentRef.current?.id === id
          ? documentRef.current
          : await getDocument(id);
        if (!source) throw new Error("This document is no longer available.");
        const duplicate = createDocmarkDocument(
          source.markdown,
          source.settings,
          `${source.title} copy`,
        );
        await putDocument(duplicate, { activate: true });
        await finishActivation(duplicate);
      }))
      .catch((error: unknown) => {
        if (activeBefore && documentRef.current?.id === activeBefore.id) {
          setDocumentRecord(documentRef.current);
          setPersistenceStatus("error");
        }
        setIsWorkspaceTransitioning(false);
        setDocumentError(error instanceof Error ? error.message : "Could not duplicate this document.");
      })
      .finally(endManagement);
  }, [beginManagement, endManagement, enqueueOperation, finishActivation, flushPendingSave]);

  const removeDocument = useCallback((id: string, title: string) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    if (!beginManagement()) return;

    const deletingActive = documentRef.current?.id === id;
    const previousDocument = documentRef.current;
    setDocumentError(null);
    if (deletingActive) {
      clearAutosaveTimer();
      pendingSaveRef.current = null;
      documentRevisionRef.current += 1;
      setIsWorkspaceTransitioning(true);
      setPersistenceStatus("loading");
    }

    void enqueueOperation(async () => {
      const replacement = createDocmarkDocument("", DEFAULT_DOCUMENT_SETTINGS);
      const result = await deleteStoredDocument(id, replacement);
      setDocuments(result.documents);
      if (deletingActive) {
        documentRef.current = result.activeDocument;
        documentRevisionRef.current += 1;
        setDocumentRecord(result.activeDocument);
        setIsWorkspaceTransitioning(false);
        setPersistenceStatus("saved");
        setPaginationReady(false);
        setPrintError(false);
      }
      setDocumentError(null);
    })
      .catch((error: unknown) => {
        if (deletingActive && previousDocument) {
          documentRef.current = previousDocument;
          setDocumentRecord(previousDocument);
          setIsWorkspaceTransitioning(false);
        }
        setPersistenceStatus("error");
        setDocumentError(error instanceof Error ? error.message : "Could not delete this document.");
      })
      .finally(endManagement);
  }, [beginManagement, clearAutosaveTimer, endManagement, enqueueOperation]);

  function printDocument() {
    setPrintError(false);
    if (typeof window.print !== "function") {
      setPrintError(true);
      return;
    }
    try {
      window.print();
    } catch {
      setPrintError(true);
    }
  }

  const currentDocument = documentRecord;
  const loading = documentRecord === null || isWorkspaceTransitioning;
  const statusText: Record<PersistenceStatus, string> = {
    loading: "Loading document…",
    saved: "Saved",
    saving: "Saving…",
    error: "Changes not saved locally",
  };

  return (
    <main className="docmark-app flex h-screen min-h-[40rem] flex-col overflow-hidden bg-background text-foreground">
      <header className="app-header flex h-16 shrink-0 items-center justify-between border-b border-border px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          <Link href="/" className="shrink-0 font-mono text-lg font-semibold tracking-tight">
            docmark<span className="text-accent">.</span>
          </Link>
          <span className="hidden h-5 border-l border-border sm:block" />
          {currentDocument ? (
            <DocumentSwitcher
              activeDocumentId={currentDocument.id}
              activeTitle={currentDocument.title}
              documents={documents}
              disabled={isManaging || !currentDocument}
              operationsDisabled={isSwitching}
              switchInProgress={isSwitching}
              onNew={createNewDocument}
              onOpen={switchDocument}
              onRename={renameDocument}
              onDuplicate={duplicateDocument}
              onDelete={removeDocument}
            />
          ) : <span className="text-sm text-muted">Documents</span>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            role="status"
            aria-live="polite"
            className={`hidden text-xs sm:inline ${persistenceStatus === "error" ? "text-amber-700 dark:text-amber-300" : "text-muted"}`}
            title={documentError ?? undefined}
          >
            {documentError ? "Document operation failed" : statusText[persistenceStatus]}
          </span>
          {printError && <span role="status" className="text-xs text-red-700 dark:text-red-300">Printing is unavailable in this browser.</span>}
          <button
            type="button"
            onClick={printDocument}
            disabled={!documentRecord || !paginationReady}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground enabled:hover:bg-subtle disabled:cursor-not-allowed disabled:text-muted disabled:opacity-60"
            title={paginationReady ? "Open the browser print dialog" : "Preparing document pages"}
          >Export PDF</button>
        </div>
      </header>

      {loading ? (
        <div className="grid min-h-0 flex-1 place-items-center text-sm text-muted">
          <p role="status">{isSwitching || isManaging ? "Opening document…" : "Loading document…"}</p>
        </div>
      ) : documentRecord ? (
        <section
          aria-label="Document workspace"
          className="workspace-shell grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2"
        >
          <section
            aria-labelledby="editor-heading"
            className="editor-panel flex min-h-[50vh] flex-col border-b border-border md:min-h-0 md:border-b-0 md:border-r"
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5 sm:px-8">
              <h1 id="editor-heading" className="text-xs font-medium uppercase tracking-wider text-muted">Markdown editor</h1>
              <span className="font-mono text-xs text-muted">.md</span>
            </div>
            <MarkdownEditor key={documentRecord.id} value={documentRecord.markdown} onChange={updateMarkdown} />
            <p id="editor-hint" className="sr-only">Enter Markdown. The document preview updates as you type.</p>
          </section>

          <section
            aria-labelledby="preview-heading"
            className="preview-panel flex min-h-[50vh] flex-col bg-subtle md:min-h-0"
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5 sm:px-8">
              <h2 id="preview-heading" className="text-xs font-medium uppercase tracking-wider text-muted">Document preview</h2>
              <span className="font-mono text-xs text-muted">Live</span>
            </div>
            <DocumentSettingsControls key={`settings-${documentRecord.id}`} settings={documentRecord.settings} onChange={updateDocumentSettings} />
            <DocumentPreview
              key={`preview-${documentRecord.id}`}
              markdown={documentRecord.markdown}
              settings={documentRecord.settings}
              onPaginationReady={setPaginationReady}
            />
          </section>
        </section>
      ) : null}
    </main>
  );
}
