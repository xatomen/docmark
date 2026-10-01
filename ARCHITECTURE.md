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
remark-parse + remark-gfm + Docmark page-break transform
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
Sanitized rendered content
   ↓
Measurement layer → Pagination Engine → Page[] → Physical preview
```

The `lib/markdown` pipeline is asynchronous, local to the browser during editing, and independent of React and CodeMirror. It turns Markdown into sanitized HTML. A small MDAST transform recognizes only the standalone Docmark page-break block and emits a semantic marker. The sanitize schema allows only that marker attribute on a `div`; the rest of the default sanitization policy remains in place. Inline mentions and fenced code remain ordinary content.

## Physical document layout

`lib/document/settings` owns the physical page settings independently of Markdown: A4 (210 × 297 mm) or Letter (215.9 × 279.4 mm), portrait or landscape orientation, and top/right/bottom/left margins in millimeters. `getPageDimensions` centralizes the page dimensions and swaps width and height for landscape orientation.

`DocumentPreview` combines sanitized HTML with these settings and the M3.2 pagination engine. The engine receives already-rendered DOM, never Markdown. It computes the available content box from the shared physical dimensions and margins, then measures fragments in an offscreen layout layer with the same width, document theme, typography, and spacing as the visible page content. The layer remains in browser layout, is hidden visually, and is marked `aria-hidden` and inert.

The pagination pass is synchronous after browser font readiness. It uses no polling and does not observe its own output. A generation counter and effect cleanup discard stale work after content or settings change. Markdown rendering depends only on Markdown; page size, orientation, and margins trigger pagination without recreating CodeMirror or rerunning the Markdown pipeline. Viewport width is a separate `ResizeObserver` path that changes only the shared visual scale and cannot change page count.

`lib/document/pagination` returns stable page IDs and rendered fragments. Blocks that fit stay together; lists are grouped at list-item boundaries, tables are grouped at row boundaries, and long text-bearing blocks are split with DOM Range fragments that preserve valid nested HTML. Table continuations repeat `<thead>` when present. A heading that would be left at the bottom of a page moves with following content when that content fits. Manual page-break markers always end the current page and can intentionally produce blank pages at the start, between consecutive markers, or at the end. An empty document produces one blank page.

Oversized paragraphs, list items, code blocks, blockquotes, and table rows are split at measured text boundaries. A range that cannot be split, such as a single image without measurable text or a single oversized glyph, is emitted once as a safe overflow fallback so pagination always advances and never loses the source content. The preview measures that spill, keeps the sheet's physical dimensions fixed, and reserves the extra visual space before the next sheet so content remains visible without overlap. Images are constrained to the available width and content height while preserving aspect ratio. These fallbacks are intentionally simpler than editorial widows/orphans rules.

Every visible sheet has fixed physical width and height in millimeters and clips content to that physical page after pagination. The paper remains light in application dark mode, while the surrounding canvas follows the application theme.

## Privacy

Markdown, images, and PDFs must not be sent to servers for core document features. The editor currently holds Markdown in React state and runs parsing, transformation, sanitization, and preview rendering in the browser. Any future network feature must remain separate from this core workflow.

## Separation of concerns

- **`lib/markdown`** owns Markdown parsing and transformation through MDAST/HAST into sanitized HTML. It does not depend on React.
- **`lib/document/settings`** defines page size, orientation, millimeter margins, dimensions, and margin validation. It does not depend on Markdown.
- **`lib/document/pagination`** paginates already-rendered DOM fragments from browser measurements. It does not parse Markdown or depend on React.
- **`components/preview`** owns the measurement layer, page rendering, status, and responsive scaling. It passes sanitized HTML and physical settings to the pagination engine.
- **`components/document`** provides reusable document visuals that preview and export can share.
- **`lib/pdf`** will export the document model client-side.
- **`lib/storage`** will persist user documents locally through browser storage or file APIs.

The corresponding UI is grouped under `components/editor`, `components/preview`, `components/document`, and `components/ui`. Shared hooks, domain types, and document-specific styles belong in `hooks`, `types`, and `styles`. Directories will be added as implementation needs arise rather than kept empty.

## Future capabilities

These are planned and are not implemented yet:

- Document themes
- Markdown syntax extensions beyond GFM
- PDF export and printing
- Local files and IndexedDB persistence
- Mermaid diagrams and KaTeX math
- Front matter and table of contents
- PWA and offline support
