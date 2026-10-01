"use client";

import { useState } from "react";
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
| PDF export | Coming soon |

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

  return (
    <section
      aria-label="Document workspace"
      className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2"
    >
      <section
        aria-labelledby="editor-heading"
        className="flex min-h-[50vh] flex-col border-b border-border md:min-h-0 md:border-b-0 md:border-r"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5 sm:px-8">
          <h1 id="editor-heading" className="text-xs font-medium uppercase tracking-wider text-muted">
            Markdown editor
          </h1>
          <span className="font-mono text-xs text-muted">.md</span>
        </div>
        <MarkdownEditor value={markdown} onChange={setMarkdown} />
        <p id="editor-hint" className="sr-only">
          Enter Markdown. The document preview updates as you type.
        </p>
      </section>

      <section
        aria-labelledby="preview-heading"
        className="flex min-h-[50vh] flex-col bg-subtle md:min-h-0"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5 sm:px-8">
          <h2 id="preview-heading" className="text-xs font-medium uppercase tracking-wider text-muted">
            Document preview
          </h2>
          <span className="font-mono text-xs text-muted">Live</span>
        </div>
        <DocumentSettingsControls
          settings={documentSettings}
          onChange={setDocumentSettings}
        />
        <DocumentPreview markdown={markdown} settings={documentSettings} />
      </section>
    </section>
  );
}
