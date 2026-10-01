"use client";

import { useState } from "react";
import { DocumentPreview } from "@/components/preview/document-preview";

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
        <label htmlFor="markdown-input" className="sr-only">
          Markdown source
        </label>
        <textarea
          id="markdown-input"
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
          spellCheck={false}
          aria-describedby="editor-hint"
          className="min-h-[calc(50vh-3rem)] flex-1 resize-none overflow-auto bg-background px-5 py-5 font-mono text-sm leading-7 text-foreground outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent md:min-h-0 md:px-8"
        />
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
        <DocumentPreview markdown={markdown} />
      </section>
    </section>
  );
}
