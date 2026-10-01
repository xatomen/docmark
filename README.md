# Docmark

Docmark is a local-first web application for creating polished documents from Markdown. It currently provides a CodeMirror 6 Markdown editor, GitHub Flavored Markdown processing, sanitized live preview, configurable physical pages, automatic pagination, manual page breaks, and browser-based printing.

## Local-first philosophy

Document content stays in the user's browser during the editing and print workflow. Markdown is parsed, transformed, sanitized, paginated, and sent to the browser's native print engine locally. `Export PDF` opens the browser print dialog; the user can select **Save as PDF** there. Docmark does not generate or upload a PDF through a server.

## Stack

- Next.js 16.3.8 with App Router
- React 19.2.8
- TypeScript 5 with strict mode
- Tailwind CSS 4
- ESLint 9

No PDF-generation or local-storage libraries are used. Browser printing is provided by the native print engine.

The Markdown pipeline uses `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-sanitize`, and `rehype-stringify`.

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

## Architecture

The App Router pages and root layout use Server Components by default. The interactive workspace owns Markdown state, while the CodeMirror editor and live preview use focused Client Component boundaries. CodeMirror is the input layer; it does not parse or render the preview.

```text
CodeMirror 6 → Markdown state → Markdown pipeline → Sanitized HTML → Preview
```

- `src/app`: landing page, editor route, root layout, and global styles.
- `src/components/editor`: CodeMirror input and the editor workspace state.
- `src/components/preview`: rendered document preview; it consumes sanitized HTML and does not parse Markdown.
- `src/components/document`: reusable visual document representation shared by preview and export.
- `src/components/ui`: generic interface components.
- `src/lib/markdown`: parsing, AST, and Markdown transformations.
- `src/lib/document`: document model and related transformations.
- `src/lib/storage`: local persistence adapters.
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
- Automatic pagination based on rendered browser layout
- Manual page breaks using the Docmark block directive:

  ```text
  :::pagebreak
  :::
  ```
- Print-safe wrapping keeps long code lines, links, and technical identifiers within the page width. Tables stay inside the content area; wrapping increases document height and may increase the page count. Document pages intentionally avoid horizontal scrolling.
- Browser-based print/export opens the native print dialog; choose **Save as PDF** there. Processing stays local and uses the already-paginated document pages, with A4 or Letter, Portrait or Landscape, and configurable margins.
- Print CSS removes application controls and preview scaling, preserves Docmark's physical page dimensions, and avoids adding browser page margins on top of Docmark's margins. Browser headers and footers remain controlled by the browser's print dialog.

Markdown state is temporary and resets when the page reloads.

## Initial roadmap

1. Add local file handling and persistence.
2. Add optional advanced Markdown features and PWA/offline support.

Planned capabilities include local files, IndexedDB, Mermaid, KaTeX, front matter, table of contents, and PWA/offline support. They are not implemented yet.
