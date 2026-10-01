"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { DocumentPreview } from "@/components/preview/document-preview";
import { DocumentSettingsControls } from "@/components/preview/document-settings-controls";
import {
  createDocmarkDocument,
  DEFAULT_DOCUMENT_TITLE,
  type DocmarkDocument,
} from "@/lib/document/model";
import {
  DEFAULT_DOCUMENT_SETTINGS,
  type DocumentSettings,
} from "@/lib/document/settings";
import {
  AUTOSAVE_DELAY_MS,
  putDocument,
  restoreOrCreateLastDocument,
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

function ApplicationHeader({
  title,
  persistenceStatus,
  onPrint,
  paginationReady,
  printError,
}: {
  title: string;
  persistenceStatus: PersistenceStatus;
  onPrint?: () => void;
  paginationReady?: boolean;
  printError?: boolean;
}) {
  const statusText: Record<PersistenceStatus, string> = {
    loading: "Loading document…",
    saved: "Saved",
    saving: "Saving…",
    error: "Changes not saved locally",
  };

  return (
    <header className="app-header flex h-16 shrink-0 items-center justify-between border-b border-border px-5 sm:px-8">
      <div className="flex items-center gap-5">
        <Link href="/" className="font-mono text-lg font-semibold tracking-tight">
          docmark<span className="text-accent">.</span>
        </Link>
        <span className="hidden h-5 border-l border-border sm:block" />
        <span className="hidden text-sm text-muted sm:block">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        <span
          role="status"
          aria-live="polite"
          className={`text-xs ${persistenceStatus === "error" ? "text-amber-700 dark:text-amber-300" : "text-muted"}`}
          title={persistenceStatus === "error" ? "Browser storage is unavailable; editing still works for this session." : undefined}
        >
          {statusText[persistenceStatus]}
        </span>
        {onPrint && (
          <>
            {printError && (
              <span role="status" className="text-xs text-red-700 dark:text-red-300">
                Printing is unavailable in this browser.
              </span>
            )}
            <button
              type="button"
              onClick={onPrint}
              disabled={!paginationReady}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground enabled:hover:bg-subtle disabled:cursor-not-allowed disabled:text-muted disabled:opacity-60"
              title={paginationReady ? "Open the browser print dialog" : "Preparing document pages"}
            >
              Export PDF
            </button>
          </>
        )}
      </div>
    </header>
  );
}

export function EditorWorkspace() {
  const [documentRecord, setDocumentRecord] = useState<DocmarkDocument | null>(null);
  const [persistenceStatus, setPersistenceStatus] =
    useState<PersistenceStatus>("loading");
  const [paginationReady, setPaginationReady] = useState(false);
  const [printError, setPrintError] = useState(false);
  const documentRef = useRef<DocmarkDocument | null>(null);
  const documentRevisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveRef = useRef<PendingSave | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const queueDocumentSave = useCallback((pending: PendingSave) => {
    const operation = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (pending.revision !== documentRevisionRef.current) return;
        await putDocument(pending.document);
        if (pending.revision === documentRevisionRef.current && mountedRef.current) {
          setPersistenceStatus("saved");
        }
      })
      .catch(() => {
        if (pending.revision === documentRevisionRef.current && mountedRef.current) {
          setPersistenceStatus("error");
        }
      });

    saveQueueRef.current = operation;
  }, []);

  const flushPendingSave = useCallback(() => {
    const pending = pendingSaveRef.current;
    if (!pending) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    pendingSaveRef.current = null;
    queueDocumentSave(pending);
  }, [queueDocumentSave]);

  useEffect(() => {
    let active = true;

    restoreOrCreateLastDocument(initialMarkdown, DEFAULT_DOCUMENT_SETTINGS)
      .then((document) => {
        if (!active) return;
        documentRef.current = document;
        setDocumentRecord(document);
        setPersistenceStatus("saved");
      })
      .catch(() => {
        if (!active) return;
        const volatileDocument = createDocmarkDocument(
          initialMarkdown,
          DEFAULT_DOCUMENT_SETTINGS,
          DEFAULT_DOCUMENT_TITLE,
        );
        documentRef.current = volatileDocument;
        setDocumentRecord(volatileDocument);
        setPersistenceStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const persistWhenHidden = () => {
      if (document.visibilityState === "hidden") flushPendingSave();
    };

    document.addEventListener("visibilitychange", persistWhenHidden);
    window.addEventListener("pagehide", flushPendingSave);

    return () => {
      document.removeEventListener("visibilitychange", persistWhenHidden);
      window.removeEventListener("pagehide", flushPendingSave);
      flushPendingSave();
      mountedRef.current = false;
    };
  }, [flushPendingSave]);

  const updateDocument = useCallback((
    change: Partial<Pick<DocmarkDocument, "markdown" | "settings">>,
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

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (pendingSaveRef.current?.revision !== pending.revision) return;
      autosaveTimerRef.current = null;
      pendingSaveRef.current = null;
      queueDocumentSave(pending);
    }, AUTOSAVE_DELAY_MS);
  }, [queueDocumentSave]);

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

  if (!documentRecord) {
    return (
      <main className="docmark-app flex h-screen min-h-[40rem] flex-col overflow-hidden bg-background text-foreground">
        <ApplicationHeader title="" persistenceStatus="loading" />
        <div className="grid min-h-0 flex-1 place-items-center text-sm text-muted">
          <p role="status">Loading document…</p>
        </div>
      </main>
    );
  }

  const { markdown, settings: documentSettings } = documentRecord;

  return (
    <main className="docmark-app flex h-screen min-h-[40rem] flex-col overflow-hidden bg-background text-foreground">
      <ApplicationHeader
        title={documentRecord.title}
        persistenceStatus={persistenceStatus}
        onPrint={printDocument}
        paginationReady={paginationReady}
        printError={printError}
      />

      <section
        aria-label="Document workspace"
        className="workspace-shell grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2"
      >
        <section
          aria-labelledby="editor-heading"
          className="editor-panel flex min-h-[50vh] flex-col border-b border-border md:min-h-0 md:border-b-0 md:border-r"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5 sm:px-8">
            <h1 id="editor-heading" className="text-xs font-medium uppercase tracking-wider text-muted">
              Markdown editor
            </h1>
            <span className="font-mono text-xs text-muted">.md</span>
          </div>
          <MarkdownEditor value={markdown} onChange={updateMarkdown} />
          <p id="editor-hint" className="sr-only">
            Enter Markdown. The document preview updates as you type.
          </p>
        </section>

        <section
          aria-labelledby="preview-heading"
          className="preview-panel flex min-h-[50vh] flex-col bg-subtle md:min-h-0"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5 sm:px-8">
            <h2 id="preview-heading" className="text-xs font-medium uppercase tracking-wider text-muted">
              Document preview
            </h2>
            <span className="font-mono text-xs text-muted">Live</span>
          </div>
          <DocumentSettingsControls
            settings={documentSettings}
            onChange={updateDocumentSettings}
          />
          <DocumentPreview
            markdown={markdown}
            settings={documentSettings}
            onPaginationReady={setPaginationReady}
          />
        </section>
      </section>
    </main>
  );
}
