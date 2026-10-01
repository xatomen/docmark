import Link from "next/link";

export default function EditorPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5 sm:px-8">
        <div className="flex items-center gap-5">
          <Link href="/" className="font-mono text-lg font-semibold tracking-tight">
            docmark<span className="text-accent">.</span>
          </Link>
          <span className="hidden h-5 border-l border-border sm:block" />
          <span className="hidden text-sm text-muted sm:block">Untitled document</span>
        </div>
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-md border border-border px-4 py-2 text-sm text-muted opacity-60"
          title="PDF export is not available yet"
        >
          Export PDF
        </button>
      </header>

      <section
        aria-label="Document workspace"
        className="grid flex-1 grid-cols-1 md:grid-cols-2"
      >
        <section
          aria-labelledby="editor-heading"
          className="flex min-h-[42vh] flex-col border-b border-border md:border-b-0 md:border-r"
        >
          <div className="flex h-12 items-center justify-between border-b border-border px-5 sm:px-8">
            <h1 id="editor-heading" className="text-xs font-medium uppercase tracking-wider text-muted">
              Markdown editor
            </h1>
            <span className="font-mono text-xs text-muted">.md</span>
          </div>
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-xs text-center">
              <div aria-hidden="true" className="mx-auto mb-4 flex size-11 items-center justify-center rounded-lg border border-border font-mono text-sm text-accent">
                #
              </div>
              <p className="text-sm font-medium">Your writing space</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                The Markdown editor will live here. Editing is not available yet.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="preview-heading"
          className="flex min-h-[50vh] flex-col bg-subtle"
        >
          <div className="flex h-12 items-center justify-between border-b border-border px-5 sm:px-8">
            <h2 id="preview-heading" className="text-xs font-medium uppercase tracking-wider text-muted">
              Document preview
            </h2>
            <span className="font-mono text-xs text-muted">A4</span>
          </div>
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="flex aspect-[1/1.414] w-full max-w-sm flex-col items-center justify-center border border-border bg-background px-8 text-center shadow-sm">
              <div aria-hidden="true" className="mb-5 h-px w-10 bg-accent" />
              <p className="text-sm font-medium">Your document preview</p>
              <p className="mt-2 max-w-[15rem] text-xs leading-5 text-muted">
                A live, print-ready view will appear here once the document renderer is in place.
              </p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
