"use client";

import { useRef } from "react";
import {
  isPickerCancellation,
  pickMarkdownFile,
  supportsFileSystemOpen,
} from "@/lib/files/markdown-files";

type MarkdownFileActionsProps = {
  disabled: boolean;
  status: string | null;
  onOpenFile: (file: File, handle?: FileSystemFileHandle) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onError: (message: string) => void;
};

export function MarkdownFileActions({
  disabled,
  status,
  onOpenFile,
  onSave,
  onSaveAs,
  onError,
}: MarkdownFileActionsProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function closeMenu() {
    menuRef.current?.removeAttribute("open");
  }

  async function openMarkdown() {
    closeMenu();
    if (!supportsFileSystemOpen()) {
      inputRef.current?.click();
      return;
    }

    try {
      const picked = await pickMarkdownFile();
      if (picked) onOpenFile(picked.file, picked.handle);
    } catch (error) {
      if (!isPickerCancellation(error)) {
        onError(error instanceof Error ? error.message : "Could not open this Markdown file.");
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      <details ref={menuRef} className="relative">
        <summary className="cursor-pointer list-none rounded border border-border px-3 py-2 text-sm hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          File
        </summary>
        <div className="absolute left-0 top-full z-40 mt-2 w-48 rounded-md border border-border bg-background p-1 text-foreground shadow-xl">
          <button
            type="button"
            disabled={disabled}
            onClick={() => { void openMarkdown(); }}
            className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-subtle disabled:opacity-50"
          >Open Markdown…</button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => { closeMenu(); onSave(); }}
            className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-subtle disabled:opacity-50"
          >Save</button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => { closeMenu(); onSaveAs(); }}
            className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-subtle disabled:opacity-50"
          >Save As…</button>
        </div>
      </details>
      {status && <span role="status" aria-live="polite" title={status} className="max-w-[25vw] truncate text-xs text-muted">{status}</span>}
      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a Markdown file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onOpenFile(file);
        }}
      />
    </div>
  );
}
