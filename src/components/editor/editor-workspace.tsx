"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { DocumentPreview } from "@/components/preview/document-preview";
import { DocumentSettingsControls } from "@/components/preview/document-settings-controls";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import {
  DEFAULT_DOCUMENT_SETTINGS,
  type DocumentSettings,
} from "@/lib/document/settings";

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

export function EditorWorkspace() {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [documentSettings, setDocumentSettings] = useState<DocumentSettings>(
    DEFAULT_DOCUMENT_SETTINGS,
  );
  const [paginationReady, setPaginationReady] = useState(false);
  const [printError, setPrintError] = useState(false);

  const updateMarkdown = useCallback((value: string) => {
    setPaginationReady(false);
    setMarkdown(value);
  }, []);

  const updateDocumentSettings = useCallback((settings: DocumentSettings) => {
    setPaginationReady(false);
    setDocumentSettings(settings);
  }, []);

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

  return (
    <main className="docmark-app flex h-screen min-h-[40rem] flex-col overflow-hidden bg-background text-foreground">
      <header className="app-header flex h-16 shrink-0 items-center justify-between border-b border-border px-5 sm:px-8">
        <div className="flex items-center gap-5">
          <Link href="/" className="font-mono text-lg font-semibold tracking-tight">
            docmark<span className="text-accent">.</span>
          </Link>
          <span className="hidden h-5 border-l border-border sm:block" />
          <span className="hidden text-sm text-muted sm:block">Untitled document</span>
        </div>
        <div className="flex items-center gap-3">
          {printError && (
            <span role="status" className="text-xs text-red-700 dark:text-red-300">
              Printing is unavailable in this browser.
            </span>
          )}
          <button
            type="button"
            onClick={printDocument}
            disabled={!paginationReady}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground enabled:hover:bg-subtle disabled:cursor-not-allowed disabled:text-muted disabled:opacity-60"
            title={paginationReady ? "Open the browser print dialog" : "Preparing document pages"}
          >
            Export PDF
          </button>
        </div>
      </header>

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
