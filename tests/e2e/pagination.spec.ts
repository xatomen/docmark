import { expect, test } from "@playwright/test";
import { markdownEditor } from "./support";

declare global {
  interface Window {
    __docmarkPrintCalls?: number;
    __releaseDocmarkFonts?: () => void;
  }
}

test("manual page breaks split content across physical pages", async ({ page }) => {
  await page.goto("/editor");
  await markdownEditor(page).fill("# First page\n\nContent A.\n\n:::pagebreak\n:::\n\n# Second page\n\nContent B.");

  const first = page.getByRole("article", { name: "Page 1" });
  const second = page.getByRole("article", { name: "Page 2" });
  await expect(first.getByRole("heading", { name: "First page" })).toBeVisible();
  await expect(first.getByText("Content A.")).toBeVisible();
  await expect(second.getByRole("heading", { name: "Second page" })).toBeVisible();
  await expect(second.getByText("Content B.")).toBeVisible();
});

test("long tables and code paginate without losing their final rows or lines", async ({ page }) => {
  await page.goto("/editor");
  const rows = Array.from({ length: 48 }, (_, index) => `| Row ${index + 1} | Value ${index + 1} |`);
  const code = Array.from({ length: 55 }, (_, index) => `const code_line_${index + 1} = "content";`);
  const markdown = [
    "# Long layout",
    "",
    "| Name | Value |",
    "| --- | --- |",
    ...rows,
    "",
    "```ts",
    ...code,
    "```",
  ].join("\n");

  await markdownEditor(page).fill(markdown);

  await expect(page.getByRole("article", { name: "Page 2" })).toBeVisible();
  const pageContent = page.locator("article .document-content");
  await expect(pageContent.filter({ hasText: "Row 48" }).first()).toBeVisible();
  await expect(pageContent.filter({ hasText: "code_line_55" }).first()).toBeVisible();
  const hasHorizontalOverflow = await page.getByRole("article").evaluateAll((articles) =>
    articles.some((article) => article.scrollWidth > article.clientWidth + 1),
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("page settings update physical dimensions and Export PDF calls print when ready", async ({ page }) => {
  await page.addInitScript(() => {
    let releaseFonts!: () => void;
    const fontsReady = new Promise<void>((resolveFonts) => {
      releaseFonts = resolveFonts;
    });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: fontsReady },
    });
    window.__releaseDocmarkFonts = releaseFonts;
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        window.__docmarkPrintCalls = (window.__docmarkPrintCalls ?? 0) + 1;
      },
    });
  });
  await page.goto("/editor");

  const pageOne = page.getByRole("article", { name: "Page 1" });
  const exportButton = page.getByRole("button", { name: "Export PDF" });
  await expect(markdownEditor(page)).toBeVisible();
  await expect(exportButton).toBeDisabled();
  await page.evaluate(() => window.__releaseDocmarkFonts?.());
  await expect(pageOne).toBeVisible();
  await expect.poll(() => pageOne.evaluate((element) => (element as HTMLElement).style.width)).toBe("210mm");
  await page.getByLabel("Orientation").selectOption("landscape");
  await expect.poll(() => pageOne.evaluate((element) => (element as HTMLElement).style.width)).toBe("297mm");
  await page.getByLabel("Page size").selectOption("letter");
  await expect.poll(() => pageOne.evaluate((element) => (element as HTMLElement).style.width)).toBe("279.4mm");
  await page.getByLabel("Orientation").selectOption("portrait");
  await expect.poll(() => pageOne.evaluate((element) => (element as HTMLElement).style.width)).toBe("215.9mm");

  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  await expect.poll(() => page.evaluate(() => window.__docmarkPrintCalls)).toBe(1);
});
