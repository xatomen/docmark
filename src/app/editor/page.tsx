import Link from "next/link";
import { EditorWorkspace } from "@/components/editor/editor-workspace";

export default function EditorPage() {
  return (
    <main className="flex h-screen min-h-[40rem] flex-col overflow-hidden bg-background text-foreground">
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
      <EditorWorkspace />
    </main>
  );
}
