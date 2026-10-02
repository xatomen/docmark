# Docmark architecture

## Local-first

The browser is the primary environment for document work. Markdown, images, and print output remain on the user's device during the main workflow. The application does not need a document-processing backend.

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
        │ Sanitized HTML │
        └──────────────┘
```

CodeMirror belongs to the browser-side input layer. It edits a Markdown string and does not participate in parsing, sanitization, or document rendering. The editor workspace restores a document from IndexedDB before mounting the editor, keeps the active document in React state, and passes its Markdown to the preview pipeline. Changes to Markdown or page settings are saved locally after a short debounce.

## Local document persistence

`lib/document/model` defines the stored document shape: stable ID, title, Markdown, page settings, and creation/update timestamps. `lib/storage` uses the browser's existing versioned `docmark` database and `documents` object store, plus metadata for the last active document ID. M5.2 requires no schema migration, so M5.1 records remain compatible. On first launch it creates the starter document; on later launches it restores the last active valid document, falling back to the most recently updated valid document.

The editor workspace holds one active document and a sorted list of lightweight document summaries. It supports create, switch, rename, duplicate, and delete. New documents start empty with default settings; duplicates copy the selected document's current Markdown and settings and get a new ID and timestamps. Deleting asks for confirmation, selects the most recently updated remaining document, or atomically creates a clean replacement when deleting the last document.

Autosaves are debounced and serialized through one operation queue. Each save carries the immutable document snapshot and ID that originated it; ordinary saves do not change the last-active pointer. Switching flushes the pending save before loading and activating the target. Generation checks prevent stale asynchronous loads from replacing a later selection. Deletes invalidate a pending debounce, then run after earlier writes so an old save cannot recreate the deleted record. Rename writes a full latest snapshot, preserving concurrent Markdown/settings changes.

Only source Markdown and document settings are stored; sanitized HTML and paginated `Page[]` are derived again in the browser. CodeMirror is keyed by document ID, so switching documents creates a fresh editor history. If IndexedDB is unavailable or a write fails, the editor remains usable for the current session and shows a save status. The data stays in this browser's site storage and is not a filesystem backup or cross-device sync.

```text
                         IndexedDB
                     │ list / load │
                     ▼             ▲
              Document Workspace  │
              ┌───────────────┐    │
              │ A  B  C  ...  │    │
              └───────┬───────┘    │
                      │ active     │
                      ▼            │
               Document State      │
              title / Markdown     │
                 / settings        │
                      │            │
          ┌───────────┴───────┐    │
          ▼                   ▼    │
      CodeMirror          Preview / Print
          │
          ▼
   500 ms autosave ────────────────┘
```

Document settings are a separate state path. Sanitized HTML and `DocumentSettings` meet only in `DocumentPreview`:

```text
CodeMirror → Markdown → Markdown pipeline → Sanitized HTML ─┐
                                                            ├→ Measurement Layer → Pagination Engine → Page[]
DocumentSettings ───────────────────────────────────────────┘
                                                                                 ├→ Screen Preview
                                                                                 └→ Print Layout → Browser Print Engine → Save as PDF
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
Measurement Layer → Pagination Engine → Page[]
                                        ├→ Screen Preview (viewport scale)
                                        └→ Print Layout (physical 1:1)
                                             ↓
                                        Browser Print Engine → Save as PDF
```

## Local Markdown files

IndexedDB remains the workspace store and source of truth for the active `DocmarkDocument`. A local `.md` file is an explicit import/export boundary: Open reads its text in the browser, creates a new document with default settings, and persists/activates it through the existing workspace lifecycle. Open never replaces a document by filename. The active Markdown then follows the normal CodeMirror, Markdown pipeline, sanitization, preview, pagination, and IndexedDB autosave paths.

```text
                     ┌────────────────────┐
                     │ Local .md File     │
                     └─────────┬──────────┘
                               │
                             Open
                               │
                               ▼
                       DocmarkDocument
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
               React State            IndexedDB
                    │                  Autosave
          ┌─────────┼─────────┐
          │         │         │
          ▼         ▼         ▼
      CodeMirror  Preview   Pagination
          │
          │ explicit Save
          ▼
      Local .md File
```

Open and Save use feature detection for `window.showOpenFilePicker` and `window.showSaveFilePicker`; no browser or user-agent detection is used. When available, the native picker gives the user a `FileSystemFileHandle`. Otherwise Open uses a resettable Markdown file input, and Save/Save As downloads a UTF-8 Markdown Blob and revokes its object URL. The fallback cannot overwrite or remember a destination, so each Save downloads a new file. Files larger than 100 MB are rejected to avoid excessive browser memory use. The native picker and fallback both operate only after user action and process file contents locally.

File handles and the Markdown snapshot last written to each handle live in runtime maps keyed by the owning document ID. They are not part of `DocmarkDocument` and are not serialized to IndexedDB. Switching documents preserves those per-ID runtime associations; reload restores the IndexedDB document but loses its file handle, so Save then opens Save As. Open associates its selected handle after the new document is persisted, and Save As associates a handle only with the document ID whose Markdown snapshot it captured. Save completion compares that snapshot with current Markdown, so typing during a write remains visibly `File modified`. Save does not block CodeMirror or require filesystem writes during autosave.

Docmark title and filename are independent. Rename preserves the association without renaming the file. Duplicate copies Markdown and page settings but gets no association. Delete removes only the workspace document and its runtime association; it never deletes the physical file. Picker cancellation leaves the active document and existing association unchanged. Read/write failures are shown separately from the IndexedDB save status. Settings, timestamps, HTML, and pagination are not written to `.md`; only the current Markdown source is saved, including existing page-break directives.

Imported files enter the same Markdown pipeline as editor content. The existing sanitization boundary remains in place, and Markdown is never executed or uploaded. File access is limited to files explicitly selected by the user; there is no backend, upload, cloud storage, filesystem watching, or external-change reload.

The `lib/markdown` pipeline is asynchronous, local to the browser during editing, and independent of React and CodeMirror. It turns Markdown into sanitized HTML. A small MDAST transform recognizes only the standalone Docmark page-break block and emits a semantic marker. The sanitize schema allows only that marker attribute on a `div`; the rest of the default sanitization policy remains in place. Inline mentions and fenced code remain ordinary content.

## Physical document layout

`lib/document/settings` owns the physical page settings independently of Markdown: A4 (210 × 297 mm) or Letter (215.9 × 279.4 mm), portrait or landscape orientation, and top/right/bottom/left margins in millimeters. `getPageDimensions` centralizes the page dimensions and swaps width and height for landscape orientation.

`DocumentPreview` combines sanitized HTML with these settings and the M3.2 pagination engine. The engine receives already-rendered DOM, never Markdown. It computes the available content box from the shared physical dimensions and margins, then measures fragments in an offscreen layout layer with the same width, document theme, typography, and spacing as the visible page content. The layer remains in browser layout, is hidden visually, and is marked `aria-hidden` and inert.

The pagination pass is synchronous after browser font readiness. It uses no polling and does not observe its own output. A generation counter and effect cleanup discard stale work after content or settings change. Markdown rendering depends only on Markdown; page size, orientation, and margins trigger pagination without recreating CodeMirror or rerunning the Markdown pipeline. Viewport width is a separate `ResizeObserver` path that changes only the shared visual scale and cannot change page count.

`lib/document/pagination` returns stable page IDs and rendered fragments. Blocks that fit stay together; lists are grouped at list-item boundaries, tables are grouped at row boundaries, and long text-bearing blocks are split with DOM Range fragments that preserve valid nested HTML. Table continuations repeat `<thead>` when present. A heading that would be left at the bottom of a page moves with following content when that content fits. Manual page-break markers always end the current page and can intentionally produce blank pages at the start, between consecutive markers, or at the end. An empty document produces one blank page.

Oversized paragraphs, list items, code blocks, blockquotes, and table rows are split at measured text boundaries. A range that cannot be split, such as a single image without measurable text or a single oversized glyph, is emitted once as a safe overflow fallback so pagination always advances and never loses the source content. The preview measures that spill, keeps the sheet's physical dimensions fixed, and reserves the extra visual space before the next sheet so content remains visible without overlap. Images are constrained to the available width and content height while preserving aspect ratio. These fallbacks are intentionally simpler than editorial widows/orphans rules.

Every visible sheet has fixed physical width and height in millimeters and clips content to that physical page after pagination. The paper remains light in application dark mode, while the surrounding canvas follows the application theme.

The renderer uses one print-safe wrapping policy inside the physical content width (`page width - left margin - right margin`). Long code lines use preserved whitespace with visual wrapping; inline code, links, hashes, identifiers, and table cells can break long unspaced tokens. Tables with up to six columns keep automatic sizing; wider tables use fixed column distribution after visual review showed it keeps headers and cells more consistent. Both layouts wrap cell content and stay at the available width. Images keep their aspect ratio and are constrained to the same width. These rules live in the shared document theme used by both the measurement layer and visible pages, so wrapping increases measured height and the existing pagination pass places the resulting fragments. Horizontal overflow is converted into vertical growth whenever possible. This physical layout behavior is independent of viewport preview scaling.

## Screen preview and print layout

The pagination engine produces the single source of truth, `Page[]`, from sanitized rendered content and the physical settings. The screen preview renders these pages with a viewport-dependent visual scale. Print CSS removes that transform and preview-only positioning, then renders the same pages at their physical width and height in millimeters. Printing does not run a second pagination pass.

The `Export PDF` button waits until rendering and pagination have completed, then calls the browser's native `window.print()` API. A print-only `@page` rule is generated from `getPageDimensions`, so A4/Letter and portrait/landscape dimensions follow the current settings. Its margin is zero because Docmark already includes its configured margins in each physical page. Explicit breaks and blank pages are preserved because print receives the existing `Page[]` without reparsing Markdown.

Print styles hide the editor, application header, controls, preview labels, canvas, and measurement layer. Each page box keeps its physical dimensions, avoids fragmentation, and uses a page break between pages without appending one after the final page. Browser-controlled headers and footers may still be enabled in the native print dialog and are outside Docmark's control. Background printing depends on browser settings.

## Privacy

Markdown, images, and printed output are not sent to servers for core document features. The editor holds Markdown in React state and runs parsing, transformation, sanitization, measurement, pagination, and print preparation in the browser. Markdown files are read locally and written only to a user-selected file or downloaded locally; there is no upload. The user chooses a destination such as Save as PDF in the browser's native print dialog. Any future network feature must remain separate from this core workflow.

## Separation of concerns

- **`lib/markdown`** owns Markdown parsing and transformation through MDAST/HAST into sanitized HTML. It does not depend on React.
- **`lib/document/settings`** defines page size, orientation, millimeter margins, dimensions, and margin validation. It does not depend on Markdown.
- **`lib/document/pagination`** paginates already-rendered DOM fragments from browser measurements. It does not parse Markdown or depend on React.
- **`components/preview`** owns the measurement layer, page rendering, pagination readiness, responsive scaling, and print layout dimensions. It passes sanitized HTML and physical settings to the pagination engine.
- **`components/document`** provides reusable document visuals that preview and export can share.
- **`styles/print.css`** owns print-only UI exclusion and physical page presentation. A dynamic `@page` rule uses the dimensions already centralized in `lib/document/settings`.
- **`lib/storage`** persists source documents and settings locally in IndexedDB; it does not store derived preview HTML or pagination results.
- **`components/editor/document-switcher`** displays local document summaries by `updatedAt` descending and provides document management actions.

The corresponding UI is grouped under `components/editor`, `components/preview`, `components/document`, and `components/ui`. Shared hooks, domain types, and document-specific styles belong in `hooks`, `types`, and `styles`. Directories will be added as implementation needs arise rather than kept empty.

## Future capabilities

These are planned and are not implemented yet:

- Document themes
- Markdown syntax extensions beyond GFM
- Direct PDF generation and print options beyond the browser's native dialog
- Mermaid diagrams and KaTeX math
- Front matter and table of contents
- PWA and offline support
