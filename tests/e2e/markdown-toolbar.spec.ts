import { expect, test, type Page } from "@playwright/test";
import { markdownEditor } from "./support";

async function readSource(page: Page): Promise<string> {
  const editor = markdownEditor(page);
  return editor.evaluate((node) => {
    const scroller = node.closest(".cm-editor")?.querySelector(".cm-scroller");
    if (!scroller) return "";
    const viewport = scroller.getBoundingClientRect();
    return Array.from(node.querySelectorAll(".cm-line"))
      .filter((line) => {
        const bounds = line.getBoundingClientRect();
        return bounds.height > 0 && bounds.bottom > viewport.top && bounds.top < viewport.bottom;
      })
      .map((line) => line.textContent?.replace(/\u200b/g, "") ?? "")
      .join("\n");
  });
}

test("Bold formats the selected source, updates Preview, restores focus, and supports undo", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("Docmark");
  await editor.press("Control+Home");
  await editor.press("Shift+End");
  await page.getByRole("button", { name: "Bold" }).click();

  await expect.poll(() => readSource(page)).toBe("**Docmark**");
  await expect(page.locator(".physical-page strong")).toContainText("Docmark");
  await expect(editor).toBeFocused();
  await editor.press("Control+z");
  await expect.poll(() => readSource(page)).toBe("Docmark");
});

test("Heading 2 replaces the current line prefix and renders in Preview", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("# Architecture");
  await editor.press("Control+End");
  await page.getByRole("button", { name: "Heading" }).click();
  await page.getByRole("menuitem", { name: "Heading 2" }).click();

  await expect.poll(() => readSource(page)).toBe("## Architecture");
  await expect(page.locator(".physical-page h2")).toContainText("Architecture");
  await expect(editor).toBeFocused();
});

test("Link wraps selected text and selects the URL for immediate editing", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("Docmark");
  await editor.press("Control+Home");
  await editor.press("Shift+End");
  await page.getByRole("button", { name: "Link" }).click();

  await expect.poll(() => readSource(page)).toBe("[Docmark](url)");
  await expect(editor).toBeFocused();
  await editor.pressSequentially("https://example.com");
  await expect.poll(() => readSource(page)).toBe("[Docmark](https://example.com)");
});

test("Bulleted list formats a multiline selection as local Markdown edits", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("one\ntwo\nthree");
  await editor.press("Control+Home");
  await editor.press("Control+Shift+End");
  await page.getByRole("button", { name: "Bulleted list" }).click();

  await expect.poll(() => readSource(page)).toBe("- one\n- two\n- three");
  await expect(editor).toBeFocused();
});

test("Table popover inserts a GFM table on narrow screens, selects its first header, and supports undo", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("Before\n\nAfter");
  await editor.press("Control+Home");
  await editor.press("ArrowDown");
  await editor.press("ArrowDown");

  await page.getByRole("button", { name: "Insert table", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Insert table" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Columns" }).getByRole("status", { name: "Columns" })).toHaveText("3");
  await expect(dialog.getByRole("group", { name: "Rows" }).getByRole("status", { name: "Rows" })).toHaveText("2");
  expect(await dialog.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= window.innerWidth;
  })).toBe(true);
  await dialog.getByRole("button", { name: "Insert", exact: true }).click();

  const table = "| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |";
  await expect.poll(() => readSource(page)).toContain(table);
  await expect(editor).toBeFocused();
  await editor.pressSequentially("Title");
  await expect.poll(() => readSource(page)).toContain("| Title | Column 2 | Column 3 |");
  await editor.press("Control+z");
  await expect.poll(() => readSource(page)).toContain(table);
  const viewSwitcher = page.getByRole("radiogroup", { name: "Workspace view" });
  await viewSwitcher.getByRole("radio", { name: "Preview", exact: true }).click();
  await expect(page.locator(".physical-page table")).toBeVisible();
  await viewSwitcher.getByRole("radio", { name: "Markdown", exact: true }).click();
  await editor.focus();
  await editor.press("Control+z");
  await expect.poll(() => readSource(page)).toBe("Before\n\nAfter");
});
