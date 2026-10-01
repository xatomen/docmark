# Docmark

Docmark is a local-first web application for creating polished documents from Markdown. The initial project establishes the UI and architecture for a future in-browser editor and PDF workflow.

## Local-first philosophy

Document content should stay in the user's browser. The primary workflow is designed to process Markdown, images, and PDF output locally, without sending document data to a server. This repository does not currently include document processing or persistence.

## Stack

- Next.js 16.3.8 with App Router
- React 19.2.8
- TypeScript 5 with strict mode
- Tailwind CSS 4
- ESLint 9

No Markdown, PDF, editor, or local-storage libraries have been added yet.

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

The App Router pages and layouts use Server Components by default. Browser-dependent editor, persistence, and export capabilities will introduce explicit Client Component boundaries when implemented.

```text
Markdown → Markdown Parser → Document Model → Document Renderer
                                                   ├── Preview
                                                   └── PDF Export
```

- `src/app`: landing page, editor route, root layout, and global styles.
- `src/components/editor`: future Markdown editing experience.
- `src/components/preview`: future document preview; it will consume the document model rather than parse Markdown.
- `src/components/document`: reusable visual document representation shared by preview and export.
- `src/components/ui`: generic interface components.
- `src/lib/markdown`: parsing, AST, and Markdown transformations.
- `src/lib/document`: document model and related transformations.
- `src/lib/pdf`: client-side PDF export.
- `src/lib/storage`: local persistence adapters.
- `src/hooks`, `src/types`, and `src/styles`: shared React hooks, domain types, and document/print/theme styles as they become useful.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for architectural principles and planned capabilities.

## Project status

Scaffolding only. The landing page and editor workspace placeholder are present. Markdown editing, parsing, document rendering, PDF export, and persistence are not implemented.

## Initial roadmap

1. Define the document model and Markdown parsing pipeline.
2. Build a browser-based editor and renderer-driven preview.
3. Add document themes, page sizes, and configurable margins.
4. Implement client-side PDF export and local persistence.
5. Add optional advanced Markdown features and PWA/offline support.

Planned capabilities include CodeMirror 6, GitHub Flavored Markdown, syntax highlighting, themes, A4/Letter page sizes, configurable margins, local files, IndexedDB, Mermaid, KaTeX, front matter, table of contents, and PWA/offline support. They are not implemented yet.
