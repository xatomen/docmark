"use client";

import { useRef } from "react";
import { Button, Dropdown, Label } from "@heroui/react";
import { ChevronDownIcon } from "@/components/editor/ui-icons";
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
  const inputRef = useRef<HTMLInputElement>(null);

  async function openMarkdown() {
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
    <div className="flex min-w-0 items-center gap-2">
      <Dropdown>
        <Button variant="tertiary" size="sm" className="shrink-0 gap-1.5">
          File
          <ChevronDownIcon className="size-3.5 text-muted" />
        </Button>
        <Dropdown.Popover className="w-52 rounded-[var(--docmark-radius-overlay)] border border-border bg-overlay text-foreground shadow-[var(--overlay-shadow)]">
          <Dropdown.Menu disabledKeys={disabled ? ["open", "save", "save-as"] : []} onAction={(action) => {
            if (action === "open") void openMarkdown();
            if (action === "save") onSave();
            if (action === "save-as") onSaveAs();
          }}>
            <Dropdown.Item id="open" textValue="Open Markdown…">
              <Label>Open Markdown…</Label>
            </Dropdown.Item>
            <Dropdown.Item id="save" textValue="Save">
              <Label>Save</Label>
            </Dropdown.Item>
            <Dropdown.Item id="save-as" textValue="Save As…">
              <Label>Save As…</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {status && (
        <span role="status" aria-live="polite" className="min-w-0 max-w-[min(32vw,18rem)] break-words text-xs leading-4 text-muted">
          {status}
        </span>
      )}
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
