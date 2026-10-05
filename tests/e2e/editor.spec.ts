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

test("Export PDF waits for a pending Preview update and prints the latest Markdown", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("# Stable preview");
  await expect(page.getByRole("article", { name: "Page 1" }).getByRole("heading", { name: "Stable preview" })).toBeVisible();

  await page.evaluate(() => {
    const instrumentedWindow = window as Window & { __printedHeadings?: string[] };
    window.print = () => {
      instrumentedWindow.__printedHeadings = Array.from(
        document.querySelectorAll("article.physical-page h1"),
        (heading) => heading.textContent ?? "",
      );
    };
  });
  await editor.fill("# Latest preview");
  await expect(editor).toContainText("Latest preview");
  const previewPanel = page.getByRole("region", { name: "Preview" });
  await expect(previewPanel).toHaveAttribute("aria-busy", "true");
  const exportButton = page.getByRole("button", { name: "Export PDF" });
  await exportButton.click();
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __printedHeadings?: string[] }).__printedHeadings ?? null,
  )).toEqual(["Latest preview"]);
});

test("rapid typing keeps the source immediate and eventually renders its latest snapshot", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("# Typing");
  await editor.press("Control+End");
  await editor.pressSequentially("Arquitectura", { delay: 8 });
  await expect(editor).toContainText("TypingArquitectura");
  await expect(page.getByRole("article", { name: "Page 1" })).toContainText("Arquitectura");
});
