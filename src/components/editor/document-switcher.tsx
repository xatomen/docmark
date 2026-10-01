"use client";

import { useRef, useState, type FormEvent } from "react";
import type { DocmarkDocumentSummary } from "@/lib/document/model";

type DocumentSwitcherProps = {
  activeDocumentId: string;
  activeTitle: string;
  documents: DocmarkDocumentSummary[];
  disabled: boolean;
  operationsDisabled: boolean;
  switchInProgress: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string, title: string) => void;
};

function updatedLabel(updatedAt: string): string {
  const elapsedMinutes = Math.round((Date.now() - Date.parse(updatedAt)) / 60_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (elapsedMinutes < 1) return formatter.format(0, "minute");
  if (elapsedMinutes < 60) return formatter.format(-elapsedMinutes, "minute");
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return formatter.format(-elapsedHours, "hour");
  const elapsedDays = Math.round(elapsedHours / 24);
  if (elapsedDays < 30) return formatter.format(-elapsedDays, "day");
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(updatedAt),
  );
}

export function DocumentSwitcher({
  activeDocumentId,
  activeTitle,
  documents,
  disabled,
  operationsDisabled,
  switchInProgress,
  onNew,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: DocumentSwitcherProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  function closeMenu() {
    detailsRef.current?.removeAttribute("open");
  }

  function submitRename(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    onRename(id, draftTitle);
    setEditingId(null);
  }

  return (
    <details ref={detailsRef} className="relative min-w-0">
      <summary
        aria-label={`Active document: ${activeTitle}. Open document list`}
        className="flex max-w-[min(44vw,24rem)] cursor-pointer list-none items-center gap-2 truncate rounded px-2 py-1 text-sm text-foreground outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
      >
        <span className="truncate">{activeTitle}</span>
        <span aria-hidden="true" className="shrink-0 text-muted">▾</span>
      </summary>
      <div className="absolute left-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-border bg-background p-2 text-foreground shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-2 pb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Documents</h2>
          <button
            type="button"
            disabled={disabled || operationsDisabled}
            onClick={() => { closeMenu(); onNew(); }}
            className="rounded px-2 py-1 text-xs text-foreground hover:bg-subtle disabled:opacity-50"
          >
            + New document
          </button>
        </div>
        <ul className="my-1 max-h-[min(60vh,24rem)] overflow-y-auto">
          {documents.map((document) => (
            <li key={document.id} className="rounded px-2 py-2 hover:bg-subtle">
              {editingId === document.id ? (
                <form onSubmit={(event) => submitRename(event, document.id)} className="flex gap-1">
                  <input
                    autoFocus
                    disabled={disabled || operationsDisabled}
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    aria-label="Document title"
                    className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  />
                  <button type="submit" disabled={disabled || operationsDisabled} className="rounded px-2 text-xs hover:bg-background disabled:opacity-50">Save</button>
                  <button type="button" disabled={disabled || operationsDisabled} onClick={() => setEditingId(null)} className="rounded px-2 text-xs hover:bg-background disabled:opacity-50">Cancel</button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={disabled || (document.id === activeDocumentId && !switchInProgress)}
                    onClick={() => { closeMenu(); onOpen(document.id); }}
                    className="flex w-full min-w-0 items-center gap-2 text-left disabled:cursor-default"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{document.title}</span>
                    {document.id === activeDocumentId && <span aria-label="Active" className="text-xs text-accent">✓</span>}
                  </button>
                  <div className="mt-1 flex items-center justify-between gap-2 pl-0.5">
                    <span className="truncate text-[0.6875rem] text-muted">Updated {updatedLabel(document.updatedAt)}</span>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        disabled={disabled || operationsDisabled}
                        onClick={() => { setEditingId(document.id); setDraftTitle(document.title); }}
                        className="rounded px-1.5 py-0.5 text-[0.6875rem] text-muted hover:bg-background hover:text-foreground disabled:opacity-50"
                      >Rename</button>
                      <button
                        type="button"
                        disabled={disabled || operationsDisabled}
                        onClick={() => { closeMenu(); onDuplicate(document.id); }}
                        className="rounded px-1.5 py-0.5 text-[0.6875rem] text-muted hover:bg-background hover:text-foreground disabled:opacity-50"
                      >Duplicate</button>
                      <button
                        type="button"
                        disabled={disabled || operationsDisabled}
                        onClick={() => { closeMenu(); onDelete(document.id, document.title); }}
                        className="rounded px-1.5 py-0.5 text-[0.6875rem] text-muted hover:bg-background hover:text-red-700 disabled:opacity-50 dark:hover:text-red-300"
                      >Delete</button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        {documents.length === 0 && <p className="p-3 text-sm text-muted">No documents yet.</p>}
      </div>
    </details>
  );
}
