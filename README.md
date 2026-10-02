# Docmark

Docmark is a local-first web application for creating polished documents from Markdown. It currently provides a CodeMirror 6 Markdown editor, GitHub Flavored Markdown processing, sanitized live preview, configurable physical pages, automatic pagination, manual page breaks, and browser-based printing.

## Local-first philosophy

Document content stays in the user's browser during the editing and print workflow. Markdown is parsed, transformed, sanitized, paginated, and sent to the browser's native print engine locally. `Export PDF` opens the browser print dialog; the user can select **Save as PDF** there. Docmark does not generate or upload a PDF through a server.

`Open Markdown…` reads `.md` and `.markdown` files locally after the user selects them. Files larger than 100 MB are rejected to avoid excessive browser memory use. Markdown files may include optional YAML Front Matter. Docmark reads and writes its page settings only under the `docmark` namespace and preserves other metadata. The **Include Docmark settings in Markdown** option is off for ordinary Markdown files; when enabled, page settings travel with the file. `Save` and `Save As…` write the Markdown body and applicable Front Matter to a selected local file when the browser supports its native file picker APIs. Other browsers use a file input to open and a local download to save. There is no Markdown upload or remote storage. Native file associations last only for the current page session; after a reload, use `Save As…` again.

## Stack

- Next.js 16.3.8 with App Router
- React 19.2.8
- TypeScript 5 with strict mode
- Tailwind CSS 4
- ESLint 9

No PDF-generation or local-storage libraries are used. Documents are stored in the browser's native IndexedDB; browser printing is provided by the native print engine.

The Markdown pipeline uses `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-sanitize`, and `rehype-stringify`.

Markdown file Front Matter uses the `yaml` document API to validate Docmark metadata and update its namespace while preserving external fields and YAML comments.

The editor uses CodeMirror 6 packages: `@codemirror/state`, `@codemirror/view`, `@codemirror/lang-markdown`, `@codemirror/language`, and `@codemirror/commands`.

## Run locally

Requires Node.js and pnpm (the package manager declared by this project).

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). To check the project:

```bash
pnpm lint
pnpm build
```

Run the automated tests with `pnpm test`. Vitest covers domain, Markdown, file-validation, and IndexedDB persistence logic. Playwright exercises browser workflows in headless Chromium, including real pagination and the file input/download fallback. Install Chromium once with `pnpm exec playwright install chromium`. The end-to-end server uses port 3100 and its own `.next-e2e` build directory, so it can run beside the usual development server.

Run either layer independently with `pnpm test:unit` or `pnpm test:e2e`. Use `pnpm test:unit:watch` while developing unit tests.

## Architecture

The App Router pages and root layout use Server Components by default. The interactive workspace owns Markdown state, while the CodeMirror editor and live preview use focused Client Component boundaries. CodeMirror is the input layer; it does not parse or render the preview.

```text
CodeMirror 6 → Markdown state → Markdown pipeline → Sanitized HTML → Preview
```

- `src/app`: landing page, editor route, root layout, and global styles.
- `src/components/editor`: CodeMirror input, document switcher, and editor workspace state.
- `src/components/preview`: rendered document preview; it consumes sanitized HTML and does not parse Markdown.
- `src/components/document`: reusable visual document representation shared by preview and export.
- `src/components/ui`: generic interface components.
- `src/lib/markdown`: parsing, AST, and Markdown transformations.
- `src/lib/document`: document model and related transformations.
- `src/lib/storage`: versioned IndexedDB persistence for documents and the active document ID.
- `src/hooks`, `src/types`, and `src/styles`: shared React hooks, domain types, and document/print/theme styles as they become useful.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for architectural principles and planned capabilities.

## Project status

### Implemented

- Markdown editing with CodeMirror 6
- Markdown syntax highlighting
- GitHub Flavored Markdown
- Sanitized live preview
- Physical page preview for A4 and Letter
- Portrait and landscape orientation
- Configurable margins in millimeters
- Responsive on-screen page scaling
- Optional physical page numbers at bottom-left, bottom-center, or bottom-right, with a configurable starting number
- Automatic pagination based on rendered browser layout
- Manual page breaks using the Docmark block directive:

  ```text
  :::pagebreak
  :::
  ```
- Print-safe wrapping keeps long code lines, links, and technical identifiers within the page width. Tables stay inside the content area; wrapping increases document height and may increase the page count. Document pages intentionally avoid horizontal scrolling.
- Browser-based print/export opens the native print dialog; choose **Save as PDF** there. Processing stays local and uses the already-paginated document pages, with A4 or Letter, Portrait or Landscape, and configurable margins.
- Print CSS removes application controls and preview scaling, preserves Docmark's physical page dimensions, and avoids adding browser page margins on top of Docmark's margins. Browser headers and footers remain controlled by the browser's print dialog.
- Optional YAML Front Matter carries versioned page settings under `docmark.version: 1`. External Front Matter remains attached to the document and is preserved when the body is edited or saved. Existing Markdown without Front Matter remains valid and is not given Docmark metadata unless the user enables **Include Docmark settings in Markdown**.

The editor supports multiple local documents: create, switch, rename, duplicate, and delete. Markdown, page settings, the portable metadata preference, and preserved Front Matter autosave to IndexedDB, and Docmark restores the last active document when it opens. `Save` is a separate, explicit write or download of the Markdown file; autosave never writes to the filesystem. Renaming or deleting a Docmark document does not rename or delete an external file, and duplicates do not inherit file associations. IndexedDB is browser site storage, not a filesystem backup or sync service; clearing site data can remove documents, and other browsers or devices do not share them.

## Portable Markdown settings

Traditional Markdown without Front Matter remains fully supported. Portable page settings are optional and use the versioned `docmark` namespace; margin values are millimeters.

```yaml
---
docmark:
  version: 1
  page:
    size: A4
    orientation: portrait
    margins:
      top: 20
      right: 20
      bottom: 20
      left: 20
---

# Markdown body
```

The **Include Docmark settings in Markdown** option is off for new and ordinary Markdown documents. It starts on when a file already has supported Docmark metadata. Docmark preserves unrelated Front Matter, while the editor shows and edits only the Markdown body. The complete workspace state remains in IndexedDB; the file carries only the optional external metadata and portable page settings. Malformed Front Matter or an unsupported Docmark version is preserved and shown with a non-blocking warning; Docmark does not rewrite that metadata.

Page numbers are optional and default to off. They are physical page decorations, so enabling them does not add Markdown or change pagination. Supported positions are bottom-left (aligned with the content area's left edge), bottom-center (centered on the physical page), and bottom-right (aligned with the content area's right edge). Vertically, the number is centered within the bottom margin when space allows and remains safely inset from the physical page edge for very small margins. `startAt` is a positive integer. Numbers are shared by preview and browser print/PDF, scale with the preview, and are saved in IndexedDB. When portable settings are enabled, the same settings are stored under `docmark.pageNumbers`; otherwise they stay local to the browser document.

Document typography is configurable with a font family, base size (9, 10, 11, 12, 14, or 16 pt), line height (1.2, 1.4, 1.5, 1.6, 1.75, 1.8, or 2), and paragraph alignment (left, center, right, or justify). System fonts (Arial, Helvetica, Georgia, Times New Roman, and Courier New) use local browser/system fallbacks. Montserrat is bundled with Docmark as local WOFF2 assets and is loaded from the same origin; runtime Google Fonts, CDN, and other external font requests are not used. Bundled fonts are verified with the browser Font Loading API before pagination is considered stable, keeping measurement, Preview, and Print/PDF on the same metrics. If Montserrat cannot load, all three use Arial and pagination/Export PDF remain available. Headings, lists, tables, and code retain their structural alignment; code stays monospace. Settings persist in IndexedDB and are written under `docmark.typography` only while portable metadata is enabled.

```yaml
---
docmark:
  version: 1
  typography:
    fontFamily: Montserrat
    fontSize: 11
    lineHeight: 1.5
    alignment: justify
---
```

Montserrat's WOFF2 assets are sourced from the [official Montserrat project repository](https://github.com/JulietaUla/Montserrat), under the [SIL Open Font License 1.1](https://openfontlicense.org/). The upstream `OFL.txt` is included unchanged at `public/fonts/montserrat/OFL.txt`. Docmark bundles only the static 400, 600, and 700 weights used by document text (headings use CSS weight 650 and resolve to the available 700 face); this avoids shipping unused weights while keeping actual bold faces available.

Optional Headers and Footers are plain text physical page decorations, disabled by default. Each can be aligned left, center, or right independently. Text is displayed literally (including characters such as `<script>` and `{page}`), supports line breaks, and wraps inside the page. They appear in Preview and the same browser Print/PDF page DOM, persist in IndexedDB, and do not add Markdown or affect pagination. Footer and page numbers use left/center/right slots; when both request the same slot they stack vertically. Portable settings store them under `docmark.header` and `docmark.footer` when **Include Docmark settings in Markdown** is on.

```yaml
---
docmark:
  version: 1
  pageNumbers:
    enabled: true
    position: bottom-center
    startAt: 1
  header:
    enabled: true
    text: Architecture Report
    alignment: center
  footer:
    enabled: true
    text: Internal use only
    alignment: left
---
```

## Initial roadmap

1. Add optional advanced Markdown features and PWA/offline support.

Planned capabilities include Mermaid, KaTeX, table of contents, and PWA/offline support. They are not implemented yet.
