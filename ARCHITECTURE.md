# Docmark architecture

## Local-first

The browser is the primary environment for document work. Markdown, images, and generated PDFs should remain on the user's device during the main workflow. The application does not need a document-processing backend.

## Data flow

```text
             Browser
        ┌──────────────┐
        │ CodeMirror 6 │
        └──────┬───────┘
               │ Markdown string
               ▼
        ┌──────────────┐
        │ lib/markdown │
        └──────┬───────┘
               │
        Sanitized HTML
               │
               ▼
        ┌──────────────┐
        │   Preview    │
        └──────────────┘
```

CodeMirror belongs to the browser-side input layer. It edits a Markdown string and does not participate in parsing, sanitization, or document rendering. The editor workspace keeps the current Markdown in React state and passes it to the preview pipeline.

Document settings are a separate state path. Sanitized HTML and `DocumentSettings` meet only in `DocumentPreview`:

```text
CodeMirror → Markdown → Markdown pipeline → Sanitized HTML ─┐
                                                            ├→ DocumentPreview → Physical page
DocumentSettings ───────────────────────────────────────────┘
```

## Markdown data flow

```text
Markdown string
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

The `lib/markdown` pipeline is asynchronous, local to the browser during editing, and independent of React and CodeMirror. It turns Markdown into sanitized HTML. The preview consumes that output; future export paths should reuse the same parsing and sanitization logic where possible.

## Physical document layout

`lib/document/settings` owns the physical page settings independently of Markdown: A4 (210 × 297 mm) or Letter (215.9 × 279.4 mm), portrait or landscape orientation, and top/right/bottom/left margins in millimeters. `getPageDimensions` centralizes the page dimensions and swaps width and height for landscape orientation.

`DocumentPreview` combines sanitized HTML with these settings to lay out one physical page. Its CSS width and minimum height remain in millimeters. A `ResizeObserver` measures the available preview width and applies a visual scale to the page; it does not change settings, margins, or physical dimensions. The paper stays light in application dark mode, while the surrounding canvas follows the application theme.

The current preview preserves the physical page width and minimum height. Content can extend the page vertically and remains visible. Automatic multi-page pagination is a separate future milestone (M3.2).

## Privacy

Markdown, images, and PDFs must not be sent to servers for core document features. The editor currently holds Markdown in React state and runs parsing, transformation, sanitization, and preview rendering in the browser. Any future network feature must remain separate from this core workflow.

## Separation of concerns

- **`lib/markdown`** owns Markdown parsing and transformation through MDAST/HAST into sanitized HTML. It does not depend on React.
- **`lib/document/settings`** defines page size, orientation, millimeter margins, dimensions, and margin validation. It does not depend on Markdown.
- **`components/preview`** combines sanitized HTML with document settings and physical layout; it does not parse Markdown.
- **`components/document`** provides reusable document visuals that preview and export can share.
- **`lib/pdf`** will export the document model client-side.
- **`lib/storage`** will persist user documents locally through browser storage or file APIs.

The corresponding UI is grouped under `components/editor`, `components/preview`, `components/document`, and `components/ui`. Shared hooks, domain types, and document-specific styles belong in `hooks`, `types`, and `styles`. Directories will be added as implementation needs arise rather than kept empty.

## Future capabilities

These are planned and are not implemented yet:

- Document themes
- Markdown syntax extensions beyond GFM
- A4 and Letter page sizes, with configurable margins
- Local files and IndexedDB persistence
- Mermaid diagrams and KaTeX math
- Front matter and table of contents
- PWA and offline support
