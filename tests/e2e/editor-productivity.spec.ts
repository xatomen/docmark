import {
  expect,
  test,
  type Page } from "@playwright/test";
import { createNewDocument,
  markdownEditor,
  renameActiveDocument,
  switchToDocument,
  openDocumentSettings,
  setSwitch,
  closeDocumentSettings,
} from "./support";

declare global {
  interface Window {
    __copiedMarkdown?: string[];
    __rejectClipboard?: boolean;
  }
}

async function mockClipboard(page: Page) {
  await page.addInitScript(() => {
    window.__copiedMarkdown = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          if (window.__rejectClipboard) throw new Error("clipboard denied");
          window.__copiedMarkdown!.push(text);
        },
      },
    });
  });
}

async function readSource(page: Page): Promise<string> {
  return markdownEditor(page).evaluate((editor) => {
    const scroller = editor.closest(".cm-editor")?.querySelector(".cm-scroller");
    if (!scroller) return "";

    const viewport = scroller.getBoundingClientRect();
    return Array.from(editor.querySelectorAll(".cm-line"))
      .filter((line) => {
        const bounds = line.getBoundingClientRect();
        return bounds.height > 0 && bounds.bottom > viewport.top && bounds.top < viewport.bottom;
      })
      .map((line) => line.textContent?.replace(/\u200b/g, "") ?? "")
      .join("\n");
  });
}

test("CodeMirror line numbers track logical lines, wrapping, scrolling, and long documents", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await expect(editor).toBeVisible();
  await editor.fill(`${"A".repeat(1600)}\nsecond line`);
  const gutterNumbers = page.locator('.cm-lineNumbers .cm-gutterElement:not([style*="visibility: hidden"])');
  await expect(gutterNumbers).toHaveCount(2);
  await expect(gutterNumbers.first()).toHaveText("1");
  await expect(gutterNumbers.last()).toHaveText("2");
  await expect(page.locator(".physical-page .cm-lineNumbers")).toHaveCount(0);

  const longDocument = Array.from({ length: 500 }, (_, index) => `Line ${index + 1}`).join("\n");
  await editor.fill(longDocument);
  await page.locator(".cm-scroller").evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect.poll(() => page.locator(".cm-scroller").evaluate((node) => node.scrollTop > 0)).toBe(true);
  await expect(gutterNumbers.last()).toHaveText("500");
  expect(await editor.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);

  await editor.fill("Updated line one\nUpdated line two");
  await expect.poll(() => readSource(page)).toBe("Updated line one\nUpdated line two");
  await expect(gutterNumbers).toHaveCount(2);
  await expect(gutterNumbers.last()).toHaveText("2");
});

test("toolbar fits narrow and dark appearances", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/editor");
  const toolbar = page.locator(".editor-toolbar");
  await expect(page.getByRole("button", { name: "Copy Markdown" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Insert table of contents" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Insert page break" })).toBeVisible();
  expect(await page.locator(".cm-gutters").evaluate((node) => getComputedStyle(node).display)).not.toBe("none");
  expect(await page.locator(".cm-gutters").evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  expect(await toolbar.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
});

test("Copy Markdown copies exact source with Mermaid and Cover, without dirtying it", async ({ page }) => {
  await mockClipboard(page);
  await page.goto("/editor");
  const source = "# Report\n\n:::toc\n:::\n\nText\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n:::pagebreak\n:::";
  await markdownEditor(page).fill(source);
  await openDocumentSettings(page, "Cover");
  await setSwitch(page, "Enable cover page", true);
  await page.getByRole("textbox", { name: "Cover title" }).fill("Derived cover title");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await closeDocumentSettings(page);
  await page.getByRole("button", { name: "Copy Markdown" }).click();
  await expect(page.locator(".editor-toolbar [role=status]")).toContainText("Copied Markdown");
  await expect.poll(() => page.evaluate(() => window.__copiedMarkdown?.length)).toBe(1);
  expect(await page.evaluate(() => window.__copiedMarkdown?.[0])).toBe(source);
  expect(await readSource(page)).toBe(source);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.locator(".physical-page .cm-lineNumbers")).toHaveCount(0);
});

test("clipboard failure is announced without changing Markdown", async ({ page }) => {
  await mockClipboard(page);
  await page.addInitScript(() => { window.__rejectClipboard = true; });
  await page.goto("/editor");
  const source = "# Source stays intact";
  await markdownEditor(page).fill(source);
  await page.getByRole("button", { name: "Copy Markdown" }).click();
  await expect(page.locator(".editor-toolbar [role=status]")).toContainText("Copy failed");
  expect(await readSource(page)).toBe(source);
});

test("Insert TOC at the cursor updates the existing pipeline and supports undo/redo", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  const source = "## Architecture\n\nIntroduction";
  await editor.fill(source);
  await editor.press("Control+Home");
  await page.getByRole("button", { name: "Insert table of contents" }).click();
  const inserted = `:::toc\n:::\n\n${source}`;
  await expect.poll(() => readSource(page)).toBe(inserted);
  await expect(page.locator(".physical-page .docmark-toc")).toBeVisible();
  await expect(editor).toBeFocused();

  await editor.pressSequentially("X");
  await expect.poll(() => readSource(page)).toBe(`:::toc\n:::\n\nX${source}`);
  await editor.press("Control+z");
  await expect.poll(() => readSource(page)).toBe(inserted);
  await editor.press("Control+z");
  await expect.poll(() => readSource(page)).toBe(source);
  await editor.press("Control+y");
  await expect.poll(() => readSource(page)).toBe(inserted);
  await expect(page.locator(".physical-page .docmark-toc")).toBeVisible();
});

test("Page Break insertion preserves a selection, splits a paragraph, and is one undoable action", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("ABCDE");
  await editor.press("Control+Home");
  await editor.press("ArrowRight");
  await editor.press("ArrowRight");
  await editor.press("Shift+ArrowRight");
  await editor.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Insert page break" }).click();
  const inserted = `ABCD\n\n:::pagebreak\n:::\n\nE`;
  await expect.poll(() => readSource(page)).toBe(inserted);
  await expect(page.locator(".physical-page")).toHaveCount(2);
  await expect(editor).toBeFocused();
  await editor.pressSequentially("X");
  await expect.poll(() => readSource(page)).toBe(`ABCD\n\n:::pagebreak\n:::\n\nXE`);
  await editor.press("Control+z");
  await expect.poll(() => readSource(page)).toBe(inserted);
  await editor.press("Control+z");
  await expect.poll(() => readSource(page)).toBe("ABCDE");
  await editor.press("Control+y");
  await expect.poll(() => readSource(page)).toBe(inserted);
});

test("empty and repeated actions preserve canonical directives, autosave, and preview", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("");
  await page.getByRole("button", { name: "Insert table of contents" }).click();
  await expect.poll(() => readSource(page)).toBe(":::toc\n:::");
  await page.getByRole("button", { name: "Insert page break" }).click();
  await page.getByRole("button", { name: "Insert page break" }).click();
  await expect.poll(() => readSource(page)).toBe(":::toc\n:::\n\n:::pagebreak\n:::\n\n:::pagebreak\n:::\n");
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(markdownEditor(page)).toBeVisible();
  await expect.poll(() => readSource(page)).not.toBe("");
  expect(await readSource(page)).toContain(":::toc\n:::");
  expect(await readSource(page)).toContain(":::pagebreak\n:::");
});

test("block actions are disabled inside fenced code and Front Matter", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("```text\ncode\n```\n\nparagraph");
  await editor.press("Control+Home");
  await editor.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Insert table of contents" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Insert page break" })).toBeDisabled();
  await editor.press("Control+End");
  await expect(page.getByRole("button", { name: "Insert table of contents" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Insert page break" })).toBeEnabled();

  await editor.fill("---\ntitle: Report\n---\n# Body");
  await editor.press("Control+Home");
  await expect(page.getByRole("button", { name: "Insert table of contents" })).toBeDisabled();
  await editor.press("Control+End");
  await expect(page.getByRole("button", { name: "Insert table of contents" })).toBeEnabled();

  await editor.fill("---\ntitle: Report\n---");
  await editor.press("Control+End");
  await expect(page.getByRole("button", { name: "Insert page break" })).toBeDisabled();
});

test("toolbar edits stay isolated to each active document", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("# Document A");
  await renameActiveDocument(page, "Document A");
  await editor.press("Control+End");
  await page.getByRole("button", { name: "Insert table of contents" }).click();
  await createNewDocument(page);
  await renameActiveDocument(page, "Document B");
  await editor.fill("# Document B");
  await editor.press("Control+End");
  await page.getByRole("button", { name: "Insert page break" }).click();
  await switchToDocument(page, "Document A");
  await expect.poll(() => readSource(page)).toBe("# Document A\n\n:::toc\n:::\n");
  await switchToDocument(page, "Document B");
  await expect.poll(() => readSource(page)).toBe("# Document B\n\n:::pagebreak\n:::\n");
});
