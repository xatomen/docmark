import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { activeDocumentSummary, chooseLocalMarkdown, forceFilePickerFallback, markdownEditor, renameActiveDocument, createNewDocument } from "./support";

const fixturePath = (name: string) => resolve(process.cwd(), "tests", "fixtures", name);

declare global {
  interface Window {
    __mockMarkdownFiles?: Record<string, string>;
    __savePickerNames?: string[];
    __releaseFirstMarkdownWrite?: () => void;
  }
}

test("fallback Open imports Markdown through the normal pipeline and Save round-trips source only", async ({ page }) => {
  await forceFilePickerFallback(page);
  await page.goto("/editor");
  const source = await readFile(fixturePath("complex.md"), "utf8");

  await chooseLocalMarkdown(page, "architecture-report.md", source);

  await expect(page.locator('summary[aria-label^="Active document:"]')).toHaveAttribute(
    "aria-label",
    "Active document: architecture-report. Open document list",
  );
  await expect(markdownEditor(page)).toContainText(":::pagebreak");
  await expect(page.getByRole("article", { name: "Page 1" }).getByRole("heading", { name: "Architecture Report" })).toBeVisible();

  await page.getByLabel("Page size").selectOption("letter");
  await page.getByLabel("Orientation").selectOption("landscape");
  await page.getByText("Margins", { exact: true }).click();
  await page.getByLabel("Top").fill("21.5");

  await page.getByText("File", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("architecture-report.md");
  const path = await download.path();
  expect(path).not.toBeNull();
  await expect(readFile(path!, "utf8")).resolves.toBe(source);
  expect(source).not.toContain("pageSize");
});

test("a local file with unsafe HTML still receives the normal sanitization", async ({ page }) => {
  await forceFilePickerFallback(page);
  await page.goto("/editor");
  const source = await readFile(fixturePath("unsafe.md"), "utf8");

  await chooseLocalMarkdown(page, "unsafe.markdown", source);

  await expect(markdownEditor(page)).toContainText("Untrusted local Markdown");
  const preview = page.getByRole("article", { name: "Page 1" });
  await expect(preview.locator("script, img")).toHaveCount(0);
  const renderedHtml = await preview.locator(".document-content").evaluate((node) => node.innerHTML);
  expect(renderedHtml).not.toMatch(/onerror\s*=/i);
});

test("Save As keeps its document association and snapshot across typing and a switch", async ({ page }) => {
  await page.addInitScript(() => {
    window.__mockMarkdownFiles = {};
    window.__savePickerNames = [];
    let shouldHoldFirstWrite = true;
    window.showSaveFilePicker = async (options) => {
      const filename = options?.suggestedName ?? "document.md";
      const call = (window.__savePickerNames ??= []).length + 1;
      window.__savePickerNames.push(filename);
      return {
        name: filename,
        getFile: async () => new File([""], filename),
        createWritable: async () => ({
          write: async (content) => {
            if (call === 1 && shouldHoldFirstWrite) {
              shouldHoldFirstWrite = false;
              await new Promise<void>((resolveWrite) => {
                window.__releaseFirstMarkdownWrite = resolveWrite;
              });
            }
            window.__mockMarkdownFiles![filename] = String(content);
          },
          close: async () => undefined,
          abort: async () => undefined,
        }),
      } as FileSystemFileHandle;
    };
  });
  await page.goto("/editor");
  await renameActiveDocument(page, "A");
  await markdownEditor(page).fill("# A snapshot before Save As");
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save As…" }).click();
  await expect(page.getByRole("status", { name: "Saving file…" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.__releaseFirstMarkdownWrite))).toBe(true);

  await markdownEditor(page).fill("# A typed while Save As is pending");
  await createNewDocument(page);
  await renameActiveDocument(page, "B");
  await markdownEditor(page).fill("# B private content");
  await page.evaluate(() => window.__releaseFirstMarkdownWrite?.());
  await expect.poll(() => page.evaluate(() => window.__mockMarkdownFiles?.["a.md"])).toBe("# A snapshot before Save As");

  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__mockMarkdownFiles?.["b.md"])).toBe("# B private content");
  await expect.poll(() => page.evaluate(() => window.__savePickerNames?.length)).toBe(2);

  await activeDocumentSummary(page).click();
  await page.getByRole("button", { name: "A", exact: true }).click();
  await expect(markdownEditor(page)).toContainText("A typed while Save As is pending");
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__mockMarkdownFiles?.["a.md"])).toBe("# A typed while Save As is pending");
  await expect.poll(() => page.evaluate(() => window.__savePickerNames?.length)).toBe(2);

  await activeDocumentSummary(page).click();
  const documentA = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "A Active", exact: true }) });
  await documentA.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(activeDocumentSummary(page)).toHaveAttribute(
    "aria-label",
    "Active document: A copy. Open document list",
  );
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__mockMarkdownFiles?.["a-copy.md"])).toBe("# A typed while Save As is pending");
  await expect.poll(() => page.evaluate(() => window.__savePickerNames?.length)).toBe(3);
  await expect.poll(() => page.evaluate(() => window.__savePickerNames?.[2])).toBe("a-copy.md");
});
