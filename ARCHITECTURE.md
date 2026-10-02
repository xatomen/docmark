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

`lib/document/model` defines the stored document shape: stable ID, title, Markdown body, page settings, portable Markdown preference and preserved Front Matter, and creation/update timestamps. Legacy M5.1–M5.4 records normalize the new portable metadata to off with no Front Matter. `lib/storage` keeps using the existing versioned `docmark` database and object stores; no database reset or schema migration is needed.

The editor workspace holds one active document and a sorted list of lightweight document summaries. It supports create, switch, rename, duplicate, and delete. New documents start empty with default settings; duplicates copy the selected document's current Markdown and settings and get a new ID and timestamps. Deleting asks for confirmation, selects the most recently updated remaining document, or atomically creates a clean replacement when deleting the last document.

Autosaves are debounced and serialized through one operation queue. Each save carries the immutable document snapshot and ID that originated it; ordinary saves do not change the last-active pointer. Switching flushes the pending save before loading and activating the target. Generation checks prevent stale asynchronous loads from replacing a later selection. Deletes invalidate a pending debounce, then run after earlier writes so an old save cannot recreate the deleted record. Rename writes a full latest snapshot, preserving concurrent Markdown/settings changes.

The Markdown body, document settings, portable preference and raw Front Matter source are stored; sanitized HTML and paginated `Page[]` are derived again in the browser. CodeMirror is keyed by document ID, so switching documents creates a fresh editor history. If IndexedDB is unavailable or a write fails, the editor remains usable for the current session and shows a save status. The data stays in this browser's site storage and is not a filesystem backup or cross-device sync.

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

`DocumentSettings` includes optional page-number settings (`enabled`, bottom position, and positive-integer `startAt`), Header/Footer text and alignment, and document typography (`fontFamily`, `fontSize`, `lineHeight`, `alignment`). They follow the same React and IndexedDB path as physical page settings. Page decorations and typography are serialized into Front Matter only while portable metadata is enabled.

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

IndexedDB remains the workspace store and source of truth for the active `DocmarkDocument`. A local `.md` file is an explicit import/export boundary: Open reads its text in the browser, splits an optional YAML Front Matter block from the Markdown body, restores supported Docmark settings, and persists/activates a new document through the existing workspace lifecycle. Open never replaces a document by filename. CodeMirror receives only the body, which follows the normal Markdown pipeline, sanitization, preview, pagination, and IndexedDB autosave paths.

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

File handles and the serialized file snapshot last written to each handle live in runtime maps keyed by the owning document ID. Handles are not part of `DocmarkDocument` and are not serialized to IndexedDB. Switching documents preserves those per-ID runtime associations; reload restores the IndexedDB document but loses its file handle, so Save then opens Save As. Open associates its selected handle after the new document is persisted, and Save As associates a handle only with the document ID whose complete Markdown-file snapshot it captured. Save completion compares that serialized snapshot with current body/settings/portable metadata, so edits during a write remain visibly `File modified` when the file representation changed. Local page settings do not dirty an ordinary Markdown file while portability is off.

## Portable Markdown Front Matter

Front Matter is an optional file representation. `DocmarkDocument.markdown` remains only the editable body; its portable metadata value stores the exact original Front Matter block, whether the user includes Docmark settings, and a validation status. This is browser workspace data and remains compatible with IndexedDB records written before M6.1.

```text
                Markdown File
                     │
                     ▼
          Front Matter Parser
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
    Markdown Body          Front Matter
                                │
                         ┌──────┴──────┐
                         │             │
                         ▼             ▼
                    External       docmark
                    Metadata       Metadata
                                      │
                                      ▼
                              DocumentSettings

                DocmarkDocument
                     │
                     ▼
                  Editor
                     │
                     ▼
            Markdown Serializer
          ┌──────────┴──────────┐
          │                     │
     Markdown Body        Front Matter
          │                     │
          └──────────┬──────────┘
                     ▼
                  .md file
```

The `yaml` document API parses Front Matter only when `---` opens the first line (an optional UTF-8 BOM is accepted). Docmark owns only the root `docmark` key. Schema version 1 maps `docmark.page.size` (`A4` or `Letter`), `orientation` (`portrait` or `landscape`), four `margins` values in millimeters, and optional `pageNumbers` settings to `DocumentSettings`. Page-number fields are validated independently; missing or invalid fields use defaults. Unknown external and Docmark fields remain in the YAML AST when the namespace is updated.

The **Include Docmark settings in Markdown** preference defaults off for new and ordinary Markdown files, and on for files with supported v1 metadata. With it off, ordinary Markdown remains a body-only file; external Front Matter is retained, and turning it off on a portable document removes only the root `docmark` key. With it on, the serializer writes version 1 and the current page settings. The same serializer drives Save, Save As, fallback downloads, and file dirty-state comparison.

Malformed YAML, a malformed Docmark namespace, missing versions, and versions newer than 1 do not block opening the body. Docmark uses local/default page settings, shows a small warning beside the settings, disables metadata rewriting, and preserves the original Front Matter bytes. Future versions are never interpreted or downgraded. A supported v1 block is left byte-for-byte intact until its settings change; then the YAML document API updates known fields while preserving comments and other values where possible.

The `.md` file contains only the body and optional Front Matter. Document IDs, workspace titles, timestamps, filesystem handles, autosave state, sanitized HTML and pagination results remain outside the file. The workspace title, an external Front Matter `title`, and the filesystem filename are independent.

Docmark title and filename are independent. Rename preserves the association without renaming the file. Duplicate copies Markdown, settings and portable Front Matter state but gets no association. Delete removes only the workspace document and its runtime association; it never deletes the physical file. Picker cancellation leaves the active document and existing association unchanged. Read/write failures are shown separately from the IndexedDB save status. IDs, timestamps, handles, save status, HTML, and pagination are not written to `.md`; the body and optional Front Matter are saved, including existing page-break directives.

Imported files enter the same Markdown pipeline as editor content. The existing sanitization boundary remains in place, and Markdown is never executed or uploaded. File access is limited to files explicitly selected by the user; there is no backend, upload, cloud storage, filesystem watching, or external-change reload.

The `lib/markdown` pipeline is asynchronous, local to the browser during editing, and independent of React and CodeMirror. It turns Markdown into sanitized HTML. A small MDAST transform recognizes only the standalone Docmark page-break block and emits a semantic marker. The sanitize schema allows only that marker attribute on a `div`; the rest of the default sanitization policy remains in place. Inline mentions and fenced code remain ordinary content.

## Physical document layout

`lib/document/settings` owns the physical page settings independently of Markdown: A4 (210 × 297 mm) or Letter (215.9 × 279.4 mm), portrait or landscape orientation, and top/right/bottom/left margins in millimeters. `getPageDimensions` centralizes the page dimensions and swaps width and height for landscape orientation.

`DocumentPreview` combines sanitized HTML with these settings and the M3.2 pagination engine. The engine receives already-rendered DOM, never Markdown. It computes the available content box from the shared physical dimensions and margins, then measures fragments in an offscreen layout layer with the same width, document theme, typography, and spacing as the visible page content. The layer remains in browser layout, is hidden visually, and is marked `aria-hidden` and inert. Typography values are scoped as CSS variables to document rendering surfaces; controls and application UI do not inherit them. A single set of shared document styles consumes those variables in both measurement and visible content.

```text
Typography Settings
        │
        ▼
Shared Document Style
        ├───────────────┐
        ▼               ▼
Measurement DOM    Visible Pages
        │               │
        ▼               ▼
Pagination          Preview
                        │
                        ▼
                     Print/PDF
```

Typography settings participate in pagination measurement. Font family, base size, line height, and paragraph alignment invalidate pagination; generation guards discard stale work after rapid changes. By contrast, PageDecorations do not participate in pagination measurement. System fonts use local/system stacks; the bundled Montserrat assets are served from the Docmark origin with no external font requests. Paragraphs (including blockquote paragraphs) receive body alignment, while headings, lists, table cells, and code stay left-aligned. Code keeps a monospace stack. Decorations inherit the selected family but retain their own alignment and compact 9 pt number size.

### Document Font Registry

The font registry classifies each allowed family as a system font or bundled font, and owns its CSS stack and loading metadata. System families are immediately usable through local/system fallback stacks. Montserrat is the first bundled font and its static WOFF2 files are served from `public/fonts/montserrat/` on Docmark's own origin. The bundled assets cover weights 400, 600, and 700; CSS headings at weight 650 resolve to the nearest available 700 face. Code remains on its independent monospace stack.

```text
Document Font Registry
├── System Font → local stack → Measurement
└── Bundled Font → same-origin WOFF2 → Font Loading API
                                      ↓ verified faces + document.fonts.ready
                                   Measurement → Pagination → Preview → Print/PDF
```

**A bundled font must be ready before pagination based on its metrics is considered stable.** `DocumentPreview` waits for the registry's required weights and verifies that matching `FontFace` entries reached `loaded` before starting the existing measurement/pagination pass. The single shared document style supplies those metrics to the measurement layer, visible pages, and print DOM. `font-display: swap` may show the CSS fallback while loading, but Export PDF remains disabled and pagination is pending until the bundled face is ready. If loading or verification fails, the active rendering stack is switched to Arial before measurement, and the same fallback is used by Preview and Print; a non-fatal message is shown and printing can proceed. Successful load promises are cached per browser `FontFaceSet`, so weights are requested once per document runtime rather than per page.

Font-load results are scoped to the selected family and size key and guarded by the existing effect cleanup and pagination generation counter. If a user changes to Georgia while Montserrat is loading, the stale Montserrat completion cannot mark the current selection ready or start pagination. Rapid switching reuses an in-flight/successful local load but only the latest selection may paginate. Front Matter continues to accept only known registry IDs; URLs and CSS are never accepted as font settings. Montserrat is licensed under SIL Open Font License 1.1; the unchanged upstream license is included beside the assets.

Pagination returns `Page[]` containing only Markdown-derived content fragments. Each visible `physical-page` shell composes that content in its content layer and then renders a separate `PageDecorations` layer:

```text
Physical Page
├── Top Decoration Area
│   └── Header
├── Content Area
└── Bottom Decoration Area
    ├── Footer
    └── Page Number
```

**Page decorations do not participate in pagination measurement.** The top decoration area has height `max(top margin, 10 mm)` and centers its text, so its center is `max(top margin / 2, 5 mm)` from the physical top. The bottom decoration area reuses the existing M6.2.1 geometry, `max(bottom margin, 10 mm)`, and centers its contents. Neither area changes document margins, content dimensions, or page count. Left/right alignment follows the content area's edges; center alignment follows the physical page center. Text wraps and breaks long tokens inside its slot.

Header/footer alignment and page number positions map to three slots: `LEFT | CENTER | RIGHT`. Separate slots render on one line where possible. When Footer and Page Number target the same slot, the slot stacks Footer above the number; neither decoration hides the other or causes repagination. React renders their values as plain text. The same physical page DOM serves preview and print, including blank pages and manually broken pages.

```text
Pagination Engine
       │
       ▼
     Page[]
       │
       ▼
 Physical Page
 ┌────────────────────┐
 │ Decorations       │
 │                    │
 │ Content            │
 │                    │
 │ Decorations       │
 └────────────────────┘
       ├── Preview
       └── Print/PDF
```

This composition boundary is intended to support future headers and footers without changing the Pagination Engine.

The pagination pass is synchronous after browser font readiness. It uses no polling and does not observe its own output. A generation counter and effect cleanup discard stale work after content or layout typography changes. Markdown rendering depends only on Markdown; page size, orientation, margins, and typography trigger pagination without recreating CodeMirror or rerunning the Markdown pipeline. Page number and Header/Footer changes do not invalidate pagination. Viewport width is a separate `ResizeObserver` path that changes only the shared visual scale and cannot change page count.

`lib/document/pagination` returns stable page IDs and rendered fragments. Blocks that fit stay together; lists are grouped at list-item boundaries, tables are grouped at row boundaries, and long text-bearing blocks are split with DOM Range fragments that preserve valid nested HTML. Table continuations repeat `<thead>` when present. A heading that would be left at the bottom of a page moves with following content when that content fits. Manual page-break markers always end the current page and can intentionally produce blank pages at the start, between consecutive markers, or at the end. An empty document produces one blank page.

Oversized paragraphs, list items, code blocks, blockquotes, and table rows are split at measured text boundaries. A range that cannot be split, such as a single image without measurable text or a single oversized glyph, is emitted once as a safe overflow fallback so pagination always advances and never loses the source content. The preview measures that spill, keeps the sheet's physical dimensions fixed, and reserves the extra visual space before the next sheet so content remains visible without overlap. Images are constrained to the available width and content height while preserving aspect ratio. These fallbacks are intentionally simpler than editorial widows/orphans rules.

Every visible sheet has fixed physical width and height in millimeters and clips content to that physical page after pagination. The paper remains light in application dark mode, while the surrounding canvas follows the application theme.

The renderer uses one print-safe wrapping policy inside the physical content width (`page width - left margin - right margin`). Long code lines use preserved whitespace with visual wrapping; inline code, links, hashes, identifiers, and table cells can break long unspaced tokens. Tables with up to six columns keep automatic sizing; wider tables use fixed column distribution after visual review showed it keeps headers and cells more consistent. Both layouts wrap cell content and stay at the available width. Images keep their aspect ratio and are constrained to the same width. These rules live in the shared document theme used by both the measurement layer and visible pages, so wrapping increases measured height and the existing pagination pass places the resulting fragments. Horizontal overflow is converted into vertical growth whenever possible. This physical layout behavior is independent of viewport preview scaling.

## Screen preview and print layout

The pagination engine produces the single source of truth, `Page[]`, from sanitized rendered content and the physical settings. The screen preview renders these pages with a viewport-dependent visual scale. Content and decorations are both descendants of the same physical page shell, so they scale together. Print CSS removes that transform and preview-only positioning, then renders the same page shells and decorations at their physical width and height in millimeters. Printing does not run a second pagination pass; visible page numbers therefore have preview/print parity and do not depend on browser headers, footers, or CSS counters.

The `Export PDF` button waits until rendering and pagination have completed, then calls the browser's native `window.print()` API. A print-only `@page` rule is generated from `getPageDimensions`, so A4/Letter and portrait/landscape dimensions follow the current settings. Its margin is zero because Docmark already includes its configured margins in each physical page. Explicit breaks and blank pages are preserved because print receives the existing `Page[]` without reparsing Markdown.

Print styles hide the editor, application header, controls, preview labels, canvas, and measurement layer. Each page box keeps its physical dimensions, avoids fragmentation, and uses a page break between pages without appending one after the final page. Browser-controlled headers and footers may still be enabled in the native print dialog and are outside Docmark's control. Background printing depends on browser settings.

## Privacy

Markdown, images, and printed output are not sent to servers for core document features. The editor holds Markdown in React state and runs parsing, transformation, sanitization, measurement, pagination, and print preparation in the browser. Markdown files are read locally and written only to a user-selected file or downloaded locally; there is no upload. The user chooses a destination such as Save as PDF in the browser's native print dialog. Any future network feature must remain separate from this core workflow.

## Separation of concerns

- **`lib/markdown`** owns Markdown parsing and transformation through MDAST/HAST into sanitized HTML. It does not depend on React.
- **`lib/document/settings`** defines page size, orientation, millimeter margins, dimensions, and margin validation. It does not depend on Markdown.
- **`lib/document/pagination`** paginates already-rendered DOM fragments from browser measurements. It does not parse Markdown or depend on React.
- **`components/preview`** owns the measurement layer, page rendering, pagination readiness, responsive scaling, and print layout dimensions. It passes sanitized HTML and physical settings to the pagination engine.
- **`components/document`** provides reusable document visuals and the `PageDecorations` layer that preview and print share.
- **`styles/print.css`** owns print-only UI exclusion and physical page presentation. A dynamic `@page` rule uses the dimensions already centralized in `lib/document/settings`.
- **`lib/storage`** persists source documents and settings locally in IndexedDB; it does not store derived preview HTML or pagination results.
- **`components/editor/document-switcher`** displays local document summaries by `updatedAt` descending and provides document management actions.

The corresponding UI is grouped under `components/editor`, `components/preview`, `components/document`, and `components/ui`. Shared hooks, domain types, and document-specific styles belong in `hooks`, `types`, and `styles`. Directories will be added as implementation needs arise rather than kept empty.

## Testing strategy

Pure domain behavior, settings validation, Markdown transformation and sanitization, local-file validation, and IndexedDB repository behavior are tested with Vitest in Node. Persistence tests use `fake-indexeddb` so they can verify document isolation, metadata, and deletion behavior without a browser server.

Playwright runs editor, persistence, document-management, file, and pagination flows in isolated Chromium contexts. The pagination engine depends on browser fonts, layout geometry, `DOM Range`, and `ResizeObserver`, so those behaviors are exercised in Chromium instead of mocked DOM tests. Browser IndexedDB is exercised in an end-to-end reload test. The native file picker and print dialog are user-controlled browser APIs; tests mock the picker API for Save As races and spy on `window.print`, while the fallback file input and download path run in Chromium.

Autosave race coverage uses Playwright's clock to advance the debounce deterministically rather than waiting on arbitrary sleeps. Run the full suite with `pnpm test`, or run `pnpm test:unit` and `pnpm test:e2e` independently. E2E runs a local Next.js dev server on port 3100 with `.next-e2e` as its isolated build directory.

## Future capabilities

These are planned and are not implemented yet:

- Document themes
- Markdown syntax extensions beyond GFM
- Direct PDF generation and print options beyond the browser's native dialog
- Mermaid diagrams and KaTeX math
- Front matter and table of contents
- PWA and offline support
