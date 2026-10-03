import {
  expect,
  test } from "@playwright/test";
import { markdownEditor,
} from "./support";

test("autosaved Markdown survives a reload in real browser IndexedDB", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("# Older draft");
  await editor.fill("# Persisted in IndexedDB\n\nRecovered content.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.reload();

  await expect(markdownEditor(page)).toContainText("Persisted in IndexedDB");
  await expect(
    page.getByRole("article", { name: "Page 1" }).getByRole("heading", { name: "Persisted in IndexedDB" }),
  ).toBeVisible();
});
