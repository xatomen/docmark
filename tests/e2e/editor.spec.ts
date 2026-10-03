import {
  expect,
  test } from "@playwright/test";
import { markdownEditor,
} from "./support";

test("CodeMirror edits Markdown and the sanitized preview updates", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await expect(editor).toBeVisible();

  await editor.fill("# E2E heading\n\nPreview text with **bold**.");

  const firstPage = page.getByRole("article", { name: "Page 1" });
  await expect(firstPage.getByRole("heading", { name: "E2E heading" })).toBeVisible();
  await expect(firstPage.locator("strong")).toHaveText("bold");
});
