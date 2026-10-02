import { describe, expect, it, vi } from "vitest";
import {
  MAX_MARKDOWN_FILE_SIZE_BYTES,
  markdownTitleFromFilename,
  readMarkdownFile,
  suggestedMarkdownFilename,
  validateMarkdownFile,
  writeMarkdownFile,
} from "@/lib/files/markdown-files";

function fileLike(name: string, size: number, content = ""): File {
  return {
    name,
    size,
    text: vi.fn().mockResolvedValue(content),
  } as unknown as File;
}

describe("local Markdown file utilities", () => {
  it("suggests a normalized filename and has a safe fallback", () => {
    expect(suggestedMarkdownFilename("GitHub Migration Report")).toBe("github-migration-report.md");
    expect(suggestedMarkdownFilename("  Héllo / Docs? ")).toBe("hello-docs.md");
    expect(suggestedMarkdownFilename("   ")).toBe("document.md");
    expect(suggestedMarkdownFilename("!!!")).toBe("document.md");
    expect(suggestedMarkdownFilename("release.md")).toBe("release-md.md");
  });

  it("derives the initial title from Markdown filenames", () => {
    expect(markdownTitleFromFilename("architecture-report.md")).toBe("architecture-report");
    expect(markdownTitleFromFilename("notes.MARKDOWN")).toBe("notes");
    expect(markdownTitleFromFilename(".md")).toBe("Untitled document");
  });

  it.each(["draft.md", "draft.MD", "draft.markdown", "draft.MARKDOWN"])(
    "accepts %s regardless of a text/plain MIME type",
    (name) => expect(() => validateMarkdownFile({ name, size: 0 })).not.toThrow(),
  );

  it("rejects unsupported extensions by filename", () => {
    expect(() => validateMarkdownFile({ name: "draft.txt", size: 0 })).toThrow(/\.md or \.markdown/);
  });

  it.each([
    MAX_MARKDOWN_FILE_SIZE_BYTES - 1,
    MAX_MARKDOWN_FILE_SIZE_BYTES,
  ])("accepts Markdown files at size %i bytes", (size) => {
    expect(() => validateMarkdownFile({ name: "large.md", size })).not.toThrow();
  });

  it("rejects files one byte above the configured size limit", () => {
    expect(() => validateMarkdownFile({
      name: "too-large.md",
      size: MAX_MARKDOWN_FILE_SIZE_BYTES + 1,
    })).toThrow(/100 MB/);
  });

  it("reads UTF-8 source without normalizing Markdown", async () => {
    const source = "# Report\r\n\r\n:::pagebreak\r\n:::\r\n";
    const file = fileLike("report.markdown", source.length, source);

    await expect(readMarkdownFile(file)).resolves.toBe(source);
    expect(file.text).toHaveBeenCalledOnce();
  });

  it("writes only the captured Markdown string and closes the writable", async () => {
    const writable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
    };
    const handle = {
      createWritable: vi.fn().mockResolvedValue(writable),
    } as unknown as FileSystemFileHandle;
    const markdown = "# Source only\n\n:::pagebreak\n:::";

    await writeMarkdownFile(handle, markdown);

    expect(writable.write).toHaveBeenCalledExactlyOnceWith(markdown);
    expect(writable.close).toHaveBeenCalledOnce();
    expect(writable.abort).not.toHaveBeenCalled();
  });

  it("aborts a failed write and preserves its original error", async () => {
    const failure = new Error("permission denied");
    const writable = {
      write: vi.fn().mockRejectedValue(failure),
      close: vi.fn(),
      abort: vi.fn().mockResolvedValue(undefined),
    };
    const handle = {
      createWritable: vi.fn().mockResolvedValue(writable),
    } as unknown as FileSystemFileHandle;

    await expect(writeMarkdownFile(handle, "# Source")).rejects.toBe(failure);
    expect(writable.abort).toHaveBeenCalledOnce();
    expect(writable.close).not.toHaveBeenCalled();
  });
});
