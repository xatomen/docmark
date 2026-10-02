type FilePickerType = {
  description?: string;
  accept: Record<string, string[]>;
};

type OpenPickerOptions = {
  multiple?: boolean;
  types?: FilePickerType[];
};

type SavePickerOptions = {
  suggestedName?: string;
  types?: FilePickerType[];
  excludeAcceptAllOption?: boolean;
};

declare global {
  interface Window {
    showOpenFilePicker?: (
      options?: OpenPickerOptions,
    ) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (
      options?: SavePickerOptions,
    ) => Promise<FileSystemFileHandle>;
  }
}

const MARKDOWN_ACCEPT: FilePickerType[] = [
  {
    description: "Markdown files",
    accept: {
      "text/markdown": [".md", ".markdown"],
      "text/plain": [".md", ".markdown"],
    },
  },
];

export const MAX_MARKDOWN_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export type PickedMarkdownFile = {
  file: File;
  handle: FileSystemFileHandle;
};

export type SaveMarkdownResult =
  | { kind: "saved"; handle: FileSystemFileHandle }
  | { kind: "downloaded" };

export function supportsFileSystemOpen(): boolean {
  return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
}

export function supportsFileSystemSave(): boolean {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

export function isPickerCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function pickMarkdownFile(): Promise<PickedMarkdownFile | null> {
  if (!supportsFileSystemOpen()) return null;

  const [handle] = await window.showOpenFilePicker!({
    multiple: false,
    types: MARKDOWN_ACCEPT,
  });
  if (!handle) return null;
  const file = await handle.getFile();
  validateMarkdownFile(file);
  return { file, handle };
}

export async function readMarkdownFile(file: File): Promise<string> {
  validateMarkdownFile(file);
  return file.text();
}

export function markdownTitleFromFilename(filename: string): string {
  const title = filename.replace(/\.(?:md|markdown)$/i, "").trim();
  return title || "Untitled document";
}

export function suggestedMarkdownFilename(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "document"}.md`;
}

export async function saveMarkdownAs(
  filename: string,
  markdown: string,
): Promise<SaveMarkdownResult> {
  if (supportsFileSystemSave()) {
    const handle = await window.showSaveFilePicker!({
      suggestedName: filename,
      excludeAcceptAllOption: true,
      types: MARKDOWN_ACCEPT,
    });
    await writeMarkdownFile(handle, markdown);
    return { kind: "saved", handle };
  }

  downloadMarkdownFile(filename, markdown);
  return { kind: "downloaded" };
}

export async function writeMarkdownFile(
  handle: FileSystemFileHandle,
  markdown: string,
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(markdown);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch {
      // Preserve the original write failure if abort is unavailable or fails.
    }
    throw error;
  }
}

export function downloadMarkdownFile(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  try {
    window.document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function validateMarkdownFile(file: Pick<File, "name" | "size">): void {
  if (!/\.(?:md|markdown)$/i.test(file.name)) {
    throw new Error("Choose a Markdown file ending in .md or .markdown.");
  }
  if (file.size > MAX_MARKDOWN_FILE_SIZE_BYTES) {
    throw new Error("This Markdown file is larger than the 100 MB limit.");
  }
}
