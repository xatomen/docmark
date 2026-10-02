"use client";

import { useState, type FormEvent } from "react";
import { Button, Dropdown, Label, Popover } from "@heroui/react";
import type { DocmarkDocumentSummary } from "@/lib/document/model";
import { CheckIcon, ChevronDownIcon, MoreHorizontalIcon, PlusIcon } from "@/components/editor/ui-icons";

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
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  function submitRename(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    onRename(id, draftTitle);
    setEditingId(null);
  }

  function handleDocumentAction(action: string | number, document: DocmarkDocumentSummary) {
    if (action === "rename") {
      setEditingId(document.id);
      setDraftTitle(document.title);
      return;
    }

    setIsOpen(false);
    if (action === "duplicate") onDuplicate(document.id);
    if (action === "delete") onDelete(document.id, document.title);
  }

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        isDisabled={disabled}
        variant="secondary"
        size="sm"
        aria-label={`Active document: ${activeTitle}. Open document list`}
        className="min-w-0 max-w-[min(34vw,24rem)] justify-between gap-2"
      >
        <span className="truncate">{activeTitle}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted" />
      </Button>
      <Popover.Content
        placement="bottom start"
        className="w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-[var(--docmark-radius-overlay)] border border-border bg-overlay p-0 text-foreground shadow-[var(--overlay-shadow)]"
      >
        <Popover.Dialog className="w-full p-3">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
            <Popover.Heading className="text-sm font-medium">Documents</Popover.Heading>
            <Button
              isDisabled={disabled || operationsDisabled}
              onPress={() => { setIsOpen(false); onNew(); }}
              variant="tertiary"
              size="sm"
              className="shrink-0"
            >
              <PlusIcon className="size-4" />
              New document
            </Button>
          </div>
          <ul aria-label="Documents" className="mt-2 max-h-[min(60vh,26rem)] space-y-1 overflow-y-auto">
            {documents.map((document) => {
              const isActive = document.id === activeDocumentId;
              const rowDisabled = disabled || operationsDisabled;

              return (
                <li key={document.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1 rounded-lg px-1 py-1 hover:bg-subtle">
                  {editingId === document.id ? (
                    <form onSubmit={(event) => submitRename(event, document.id)} className="col-span-2 flex min-w-0 items-center gap-1">
                      <input
                        autoFocus
                        disabled={rowDisabled}
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        aria-label="Document title"
                        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      />
                      <Button type="submit" isDisabled={rowDisabled} variant="tertiary" size="sm">Save</Button>
                      <Button type="button" isDisabled={rowDisabled} onPress={() => setEditingId(null)} variant="tertiary" size="sm">Cancel</Button>
                    </form>
                  ) : (
                    <>
                      <Button
                        isDisabled={disabled || (isActive && !switchInProgress)}
                        onPress={() => { setIsOpen(false); onOpen(document.id); }}
                        variant={isActive ? "secondary" : "ghost"}
                        size="sm"
                        aria-current={isActive ? "true" : undefined}
                        className="col-start-1 row-start-1 min-w-0 justify-start gap-2 text-left"
                      >
                        <span className="grid size-4 shrink-0 place-items-center">
                          {isActive && <CheckIcon className="size-4 text-accent" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{document.title}</span>
                        {isActive && <span className="sr-only">Active</span>}
                      </Button>
                      <span className="col-start-1 row-start-2 truncate pl-8 text-[0.6875rem] text-muted">Updated {updatedLabel(document.updatedAt)}</span>
                      <div className="col-start-2 row-span-2 row-start-1 flex items-center">
                        <Dropdown>
                          <Button
                            isIconOnly
                            isDisabled={rowDisabled}
                            variant="tertiary"
                            size="sm"
                            aria-label={`Actions for ${document.title}`}
                            className="shrink-0"
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </Button>
                          <Dropdown.Popover
                            placement="bottom end"
                            className="w-44 rounded-[var(--docmark-radius-overlay)] border border-border bg-overlay text-foreground shadow-[var(--overlay-shadow)]"
                          >
                            <Dropdown.Menu onAction={(action) => handleDocumentAction(action, document)}>
                              <Dropdown.Item id="rename" textValue="Rename">
                                <Label>Rename</Label>
                              </Dropdown.Item>
                              <Dropdown.Item id="duplicate" textValue="Duplicate">
                                <Label>Duplicate</Label>
                              </Dropdown.Item>
                              <Dropdown.Item id="delete" textValue="Delete" variant="danger" className="mt-1 border-t border-border pt-1">
                                <Label>Delete</Label>
                              </Dropdown.Item>
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {documents.length === 0 && <p className="px-2 py-4 text-sm text-muted">No documents yet.</p>}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
