# Docmark

Docmark is a local-first web application for creating polished documents from Markdown. It currently provides a CodeMirror 6 Markdown editor, GitHub Flavored Markdown processing, sanitized live preview, and a configurable physical document preview.

## Local-first philosophy

Document content stays in the user's browser during the editing workflow. Markdown is parsed, transformed, sanitized, and rendered locally without sending document content to a backend. Persistence and PDF export are not implemented yet.

## Stack

- Next.js 16.3.8 with App Router
- React 19.2.8
- TypeScript 5 with strict mode
- Tailwind CSS 4
- ESLint 9

PDF export and local-storage libraries have not been added yet.

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
- `src/lib/pdf`: client-side PDF export.
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

Markdown state is temporary and resets when the page reloads.

Automatic pagination, PDF export, printing, and persistence are not implemented.

## Initial roadmap

1. Add automatic multi-page pagination.
2. Implement client-side PDF export and printing.
3. Add local file handling and persistence.
4. Add optional advanced Markdown features and PWA/offline support.

Planned capabilities include local files, IndexedDB, Mermaid, KaTeX, front matter, table of contents, and PWA/offline support. They are not implemented yet.
