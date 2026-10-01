# Docmark architecture

## Local-first

The browser is the primary environment for document work. Markdown, images, and generated PDFs should remain on the user's device during the main workflow. The application does not need a document-processing backend.

## Data flow

```text
Markdown
   ↓
remark-parse + remark-gfm
   ↓
MDAST
   ↓
remark-rehype
   ↓
HAST
   ↓
rehype-sanitize
   ↓
HTML
   ↓
Preview
```

The `lib/markdown` pipeline is asynchronous, local to the browser during editing, and independent of React. It turns Markdown into sanitized HTML. The preview consumes that output; future export paths should reuse the same parsing and sanitization logic where possible.

## Privacy

Markdown, images, and PDFs must not be sent to servers for core document features. The editor currently holds Markdown in React state and runs parsing, transformation, sanitization, and preview rendering in the browser. Any future network feature must remain separate from this core workflow.

## Separation of concerns

- **`lib/markdown`** owns Markdown parsing and transformation through MDAST/HAST into sanitized HTML. It does not depend on React.
- **`lib/document`** defines the internal document model and transformations of that model.
- **`components/preview`** presents sanitized rendered document output and does not parse Markdown.
- **`components/document`** provides reusable document visuals that preview and export can share.
- **`lib/pdf`** will export the document model client-side.
- **`lib/storage`** will persist user documents locally through browser storage or file APIs.

The corresponding UI is grouped under `components/editor`, `components/preview`, `components/document`, and `components/ui`. Shared hooks, domain types, and document-specific styles belong in `hooks`, `types`, and `styles`. Directories will be added as implementation needs arise rather than kept empty.

## Future capabilities

These are planned and are not implemented yet:

- CodeMirror 6 editor
- GitHub Flavored Markdown and syntax highlighting
- Document themes
- A4 and Letter page sizes, with configurable margins
- Local files and IndexedDB persistence
- Mermaid diagrams and KaTeX math
- Front matter and table of contents
- PWA and offline support
