import { mkdir, readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { expect, test } from "@playwright/test";
import { closeDocumentSettings, markdownEditor, renameActiveDocument, selectSettingOption } from "../e2e/support";

test("DEV native PDF downloads a parseable document snapshot with current settings and local assets", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("# Snapshot heading\n\nUnicode: acción, niño, 😀.\n\n:::toc\n:::\n\n```mermaid\ngraph TD; A-->B\n```");
  await renameActiveDocument(page, "A / Report.md");
  await selectSettingOption(page, "Orientation", "landscape");
  await closeDocumentSettings(page);
  await page.evaluate(() => { window.print = () => { throw new Error("Native export must not call print"); }; });
  const native = page.getByRole("button", { name: "Native PDF (Experimental)" });
  await expect(native).toBeEnabled();
  const initialResources = await page.evaluate(() => performance.getEntriesByType("resource").map(({ name }) => name));
  expect(initialResources.some((url) => url.includes("pdfmake"))).toBe(false);
  expect(initialResources.some((url) => url.includes("/fonts/liberation/"))).toBe(false);

  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const downloadPromise = page.waitForEvent("download");
  await native.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("A - Report.pdf");
  const outputPath = "artifacts/m7.2/editor-download.pdf";
  await mkdir("artifacts/m7.2", { recursive: true });
  await download.saveAs(outputPath);
  const bytes = new Uint8Array(await readFile(outputPath));
  expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  expect(pdf.numPages).toBeGreaterThan(0);
  const viewport = pdf.numPages ? (await (await pdf.getPage(1)).getViewport({ scale: 1 })) : null;
  expect(viewport!.width).toBeGreaterThan(viewport!.height);
  const text = (await (await pdf.getPage(1)).getTextContent()).items
    .map((item) => "str" in item ? item.str : "").join(" ");
  expect(text).toContain("Snapshot heading");
  expect(text).toContain("acción");
  await expect(page.getByText("PDF downloaded with export warnings.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Native PDF unsupported features" })).toContainText("Table of contents");
  await expect(page.getByRole("list", { name: "Native PDF unsupported features" })).toContainText("Mermaid");
  await expect(page.getByRole("list", { name: "Native PDF unsupported features" })).toContainText("emoji and some glyphs may be missing");
  await expect(page.getByRole("list", { name: "Native PDF unsupported features" })).toContainText("embedded Liberation Sans");
  expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  const afterResources = await page.evaluate(() => performance.getEntriesByType("resource").map(({ name }) => name));
  expect(afterResources.some((url) => url.includes("pdfmake"))).toBe(true);
  expect(afterResources.some((url) => url.includes("/fonts/liberation/LiberationSans-Regular.ttf"))).toBe(true);
});

test("native PDF loading prevents duplicate activation and recovers from font errors", async ({ page }) => {
  await page.goto("/editor");
  const native = page.getByRole("button", { name: "Native PDF (Experimental)" });
  let downloadCount = 0;
  page.on("download", () => { downloadCount += 1; });
  let releaseFont!: () => void;
  const fontGate = new Promise<void>((resolve) => { releaseFont = resolve; });
  await page.route("**/fonts/liberation/LiberationSans-Regular.ttf", async (route) => {
    await fontGate;
    await route.continue();
  });
  const downloadPromise = page.waitForEvent("download");
  await native.click();
  const generating = page.getByRole("button", { name: "Generating PDF…" });
  await expect(generating).toBeDisabled();
  await expect(native).toHaveCount(0);
  releaseFont();
  await downloadPromise;
  await page.unroute("**/fonts/liberation/LiberationSans-Regular.ttf");

  await page.route("**/fonts/liberation/LiberationSans-Regular.ttf", (route) => route.fulfill({ status: 503, body: "test font failure" }));
  const failedDownload = page.waitForEvent("download", { timeout: 500 }).then(() => true, () => false);
  await native.click();
  await expect(page.getByText(/Native PDF export failed:/)).toBeVisible();
  await expect(native).toBeEnabled();
  expect(await failedDownload).toBe(false);
  expect(downloadCount).toBe(1);
  await page.unroute("**/fonts/liberation/LiberationSans-Regular.ttf");
  const recoveredDownload = page.waitForEvent("download");
  await native.click();
  await recoveredDownload;
  await expect(page.getByText("PDF downloaded with export warnings.")).toBeVisible();
  expect(downloadCount).toBe(2);
});

test("an in-flight export uses its captured Markdown, filename and page settings", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("# Captured snapshot");
  await renameActiveDocument(page, "Captured.md");
  await selectSettingOption(page, "Orientation", "landscape");
  await closeDocumentSettings(page);
  await page.evaluate(() => { window.print = () => { throw new Error("Native export must not print"); }; });

  let releaseFont!: () => void;
  const gate = new Promise<void>((resolve) => { releaseFont = resolve; });
  await page.route("**/fonts/liberation/LiberationSans-Regular.ttf", async (route) => {
    await gate;
    await route.continue();
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Native PDF (Experimental)" }).click();
  await expect(page.getByRole("button", { name: "Generating PDF…" })).toBeDisabled();

  await editor.fill("# Later edit should not be in this export");
  await renameActiveDocument(page, "Later.pdf");
  await selectSettingOption(page, "Orientation", "portrait");
  await closeDocumentSettings(page);
  releaseFont();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Captured.pdf");
  const bytes = new Uint8Array(await readFile((await download.path())!));
  const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const viewport = (await pdf.getPage(1)).getViewport({ scale: 1 });
  expect(viewport.width).toBeGreaterThan(viewport.height);
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
  expect(text).toContain("Captured snapshot");
  expect(text).not.toContain("Later edit");
});

test("traditional print export still invokes the browser print operation", async ({ page }) => {
  await page.goto("/editor");
  await page.evaluate(() => {
    (window as Window & { __printCalled?: boolean }).print = () => {
      (window as Window & { __printCalled?: boolean }).__printCalled = true;
    };
  });
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __printCalled?: boolean }).__printCalled)).toBe(true);
});
