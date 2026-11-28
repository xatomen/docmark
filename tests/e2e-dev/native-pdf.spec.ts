import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
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
  expect(initialResources.some((url) => url.includes("/fonts/") && url.endsWith(".ttf"))).toBe(false);

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
  await expect(page.getByRole("list", { name: "Native PDF export diagnostics" })).toContainText("Table of contents");
  await expect(page.getByRole("list", { name: "Native PDF export diagnostics" })).toContainText("Mermaid");
  await expect(page.getByRole("list", { name: "Native PDF export diagnostics" })).toContainText("U+1F600");
  await expect(page.getByRole("list", { name: "Native PDF export diagnostics" })).toContainText("embedded Liberation Sans");
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

  await selectSettingOption(page, "Font family", "Montserrat");
  await closeDocumentSettings(page);
  const failedFontPath = "**/fonts/pdf/docmark-signature-sans/DocmarkSignatureSans-Regular.ttf";
  await page.route(failedFontPath, (route) => route.fulfill({ status: 503, body: "test font failure" }));
  const failedDownload = page.waitForEvent("download", { timeout: 500 }).then(() => true, () => false);
  await native.click();
  await expect(page.getByText(/Native PDF export failed:/)).toBeVisible();
  await expect(native).toBeEnabled();
  expect(await failedDownload).toBe(false);
  expect(downloadCount).toBe(1);
  await page.unroute(failedFontPath);
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

test("native export warnings stay out of print while document pages remain visible", async ({ page }) => {
  await page.goto("/editor");
  await markdownEditor(page).fill("# Print isolation\n\n:::toc\n:::\n\n```mermaid\ngraph TD; A-->B\n```");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Native PDF (Experimental)" }).click();
  await downloadPromise;

  const notice = page.getByRole("status").filter({ hasText: "PDF downloaded with export warnings." });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Table of contents");
  const physicalPages = page.locator(".physical-page");
  expect(await physicalPages.count()).toBeGreaterThan(0);
  await expect(physicalPages.first()).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(notice).toBeHidden();
  await expect(physicalPages.first()).toBeVisible();
});

test("DEV native PDF rejects a stale HTTP 200 font, retries without reload, and reuses verified bytes", async ({ page }) => {
  const fontPath = "**/fonts/liberation/LiberationSans-Regular.ttf";
  let returnInvalid = true;
  let fontRequestCount = 0;
  let downloadCount = 0;
  page.on("download", () => { downloadCount += 1; });
  await page.route(fontPath, async (route) => {
    fontRequestCount += 1;
    if (returnInvalid) {
      await route.fulfill({
        status: 200,
        contentType: "font/ttf",
        body: Buffer.from([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      });
    } else {
      await route.continue();
    }
  });

  await page.goto("/editor");
  await markdownEditor(page).fill("Font integrity retry.");
  const native = page.getByRole("button", { name: "Native PDF (Experimental)" });
  await native.click();
  await expect(page.getByText(/Native PDF export failed:.*integrity check failed/)).toBeVisible();
  expect(downloadCount).toBe(0);
  expect(fontRequestCount).toBe(1);

  returnInvalid = false;
  const firstDownloadPromise = page.waitForEvent("download");
  await native.click();
  const firstDownload = await firstDownloadPromise;
  const firstPdf = new Uint8Array(await readFile((await firstDownload.path())!));
  const parsed = await getDocument({ data: firstPdf, useSystemFonts: true }).promise;
  const text = (await (await parsed.getPage(1)).getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
  expect(text).toContain("Font integrity retry.");
  expect(fontRequestCount).toBe(2);

  const secondDownloadPromise = page.waitForEvent("download");
  await native.click();
  await secondDownloadPromise;
  expect(fontRequestCount).toBe(2);
  expect(downloadCount).toBe(2);
});

test("selected Montserrat is embedded lazily and repeat export reuses local font assets", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill("# Fuente elegida\n\nAcción, niño, pingüino. **Negrita**, *cursiva* y ***ambas***.\n\nCódigo: `monoToken`.");
  await selectSettingOption(page, "Font family", "Montserrat");
  await closeDocumentSettings(page);

  const initial = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  expect(initial.some((url) => url.includes("pdfmake"))).toBe(false);
  expect(initial.some((url) => url.includes("/fonts/") && url.endsWith(".ttf"))).toBe(false);

  const transferPromises: Promise<void>[] = [];
  const transfers: { path: string; bytes: number }[] = [];
  const requestedUrls: string[] = [];
  page.on("request", (request) => requestedUrls.push(request.url()));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(page.url()).origin || !(url.pathname.includes("pdfmake") || url.pathname.endsWith(".ttf"))) return;
    transferPromises.push(response.body().then((bytes) => {
      transfers.push({ path: url.pathname, bytes: bytes.byteLength });
    }));
  });

  const coldStart = Date.now();
  const firstDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Native PDF (Experimental)" }).click();
  const firstDownload = await firstDownloadPromise;
  const coldExportMs = Date.now() - coldStart;
  expect(firstDownload.suggestedFilename()).toBe("Untitled document.pdf");
  const outputPath = "artifacts/m7.3/editor-montserrat-download.pdf";
  await mkdir("artifacts/m7.3", { recursive: true });
  await firstDownload.saveAs(outputPath);
  const bytes = new Uint8Array(await readFile(outputPath));
  const pdfSource = Buffer.from(bytes).toString("latin1");
  expect(pdfSource).toContain("DocmarkSignatureSans");
  const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
  expect(text).toContain("Acción");
  expect(text).toContain("niño");
  expect(text).toContain("Negrita");
  await expect(page.getByRole("list", { name: "Native PDF export diagnostics" })).not.toContainText("Montserrat is approximated");

  const afterFirst = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  expect(afterFirst.some((url) => url.includes("pdfmake"))).toBe(true);
  const pdfFontRequests = afterFirst.filter((url) => url.includes("/fonts/") && url.endsWith(".ttf"));
  expect(pdfFontRequests.some((url) => url.includes("docmark-signature-sans/DocmarkSignatureSans-Regular.ttf"))).toBe(true);
  expect(pdfFontRequests.some((url) => url.includes("liberation-mono/LiberationMono-Regular.ttf"))).toBe(true);
  expect(pdfFontRequests.some((url) => url.includes("liberation/LiberationSans-"))).toBe(false);
  expect(pdfFontRequests.some((url) => url.includes("liberation-serif/"))).toBe(false);

  const repeatedStart = Date.now();
  const secondDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Native PDF (Experimental)" }).click();
  await secondDownloadPromise;
  const repeatExportMs = Date.now() - repeatedStart;
  const afterRepeat = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  const transferTimings = await page.evaluate(() => performance.getEntriesByType("resource")
    .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
    .filter((entry) => entry.name.includes("pdfmake") || new URL(entry.name).pathname.endsWith(".ttf"))
    .map((entry) => ({ path: new URL(entry.name).pathname, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize })));
  await Promise.all(transferPromises);
  expect(transfers.filter(({ path }) => path.endsWith(".ttf")).length).toBe(5);
  expect(requestedUrls.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  const repeatedPdfResourceRequests = afterRepeat.filter((url) => url.includes("pdfmake") || (url.includes("/fonts/") && url.endsWith(".ttf")));
  expect(repeatedPdfResourceRequests).toEqual(afterFirst.filter((url) => url.includes("pdfmake") || (url.includes("/fonts/") && url.endsWith(".ttf"))));

  const report = {
    test: "Next.js DEV editor cold and repeated export using Montserrat plus code",
    coldExportMs,
    repeatExportMs,
    initialEditorResourceCount: initial.length,
    initialPdfMakeOrFontAssets: initial.filter((url) => url.includes("pdfmake") || (url.includes("/fonts/") && url.endsWith(".ttf"))),
    firstExportPdfFontRequests: pdfFontRequests,
    coldExportTransfers: transfers,
    coldExportTransferBytes: transfers.reduce((sum, transfer) => sum + transfer.bytes, 0),
    resourceTimingTransfers: transferTimings,
    resourceTimingTransferBytes: transferTimings.reduce((sum, transfer) => sum + transfer.transferSize, 0),
    requestOrigins: [...new Set(requestedUrls.map((url) => new URL(url).origin))],
    repeatedExportAddedFontRequests: repeatedPdfResourceRequests.length - afterFirst.filter((url) => url.includes("pdfmake") || (url.includes("/fonts/") && url.endsWith(".ttf"))).length,
  };
  await writeFile("artifacts/m7.3/resource-measurements.json", JSON.stringify(report, null, 2));
});

test("DEV PDF export uses cmap fallback only when required and reports unresolved glyphs", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  const native = page.getByRole("button", { name: "Native PDF (Experimental)" });
  const requested: string[] = [];
  const transferReads: Promise<void>[] = [];
  const transfers: { path: string; bytes: number }[] = [];
  page.on("request", (request) => requested.push(request.url()));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(page.url()).origin || !(url.pathname.includes("pdfmake") || url.pathname.endsWith(".ttf"))) return;
    transferReads.push(response.body().then((body) => { transfers.push({ path: url.pathname, bytes: body.byteLength }); }).catch(() => {}));
  });
  const initial = await page.evaluate(() => performance.getEntriesByType("resource").map(({ name }) => name));
  expect(initial.some((url) => url.includes("pdfmake") || (url.includes("/fonts/") && url.endsWith(".ttf")))).toBe(false);

  await editor.fill("Primary-only Latin text.");
  const primaryStart = Date.now();
  const primaryDownloadPromise = page.waitForEvent("download");
  await native.click();
  const primaryDownload = await primaryDownloadPromise;
  const primaryOnlyExportMs = Date.now() - primaryStart;
  const primaryPdf = new Uint8Array(await readFile((await primaryDownload.path())!));
  const primaryText = (await (await (await getDocument({ data: primaryPdf, useSystemFonts: true }).promise).getPage(1)).getTextContent()).items
    .map((item) => "str" in item ? item.str : "").join(" ");
  expect(primaryText).toContain("Primary-only Latin text.");
  const primaryFonts = requested.filter((url) => url.endsWith(".ttf"));
  expect(primaryFonts.some((url) => url.includes("LiberationSans-Regular.ttf"))).toBe(true);
  expect(primaryFonts.some((url) => url.includes("docmark-signature-sans"))).toBe(false);

  await editor.fill("Курс рубля: ₽");
  const fallbackStart = Date.now();
  const fallbackDownloadPromise = page.waitForEvent("download");
  await native.click();
  const fallbackDownload = await fallbackDownloadPromise;
  const fallbackExportMs = Date.now() - fallbackStart;
  const fallbackPdf = new Uint8Array(await readFile((await fallbackDownload.path())!));
  const fallbackSource = Buffer.from(fallbackPdf).toString("latin1");
  expect(fallbackSource).toContain("DocmarkSignatureSans");
  const fallbackPage = await (await getDocument({ data: fallbackPdf, useSystemFonts: true }).promise).getPage(1);
  const fallbackText = (await fallbackPage.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
  expect(fallbackText).toContain("Курс рубля");
  expect(fallbackText).toContain("₽");
  const warning = page.getByRole("list", { name: "Native PDF export diagnostics" });
  await expect(warning).toContainText("U+20BD");
  const afterFallback = requested.filter((url) => url.endsWith(".ttf"));
  expect(afterFallback.some((url) => url.includes("docmark-signature-sans/DocmarkSignatureSans-Regular.ttf"))).toBe(true);
  expect(afterFallback.every((url) => !url.includes("liberation-serif/") && !url.includes("LiberationMono-"))).toBe(true);

  const beforeRepeat = [...requested];
  const repeatStart = Date.now();
  const repeatedDownload = page.waitForEvent("download");
  await native.click();
  await repeatedDownload;
  const repeatedFallbackExportMs = Date.now() - repeatStart;
  expect(requested).toEqual(beforeRepeat);
  const repeatedNewFontRequests = requested.filter((url) => url.endsWith(".ttf")).length - afterFallback.length;

  await editor.fill("Unsupported: 😀 漢");
  const unsupportedDownload = page.waitForEvent("download");
  await native.click();
  await unsupportedDownload;
  await expect(warning).toContainText("U+1F600");
  await expect(warning).toContainText("U+6F22");
  const afterUnsupported = requested.filter((url) => url.endsWith(".ttf"));
  expect(afterUnsupported).toEqual(afterFallback);

  await editor.fill("Math fallback: ∈ ⇒");
  const mathStart = Date.now();
  const mathDownloadPromise = page.waitForEvent("download");
  await native.click();
  const mathDownload = await mathDownloadPromise;
  const mathFallbackExportMs = Date.now() - mathStart;
  const mathPdf = new Uint8Array(await readFile((await mathDownload.path())!));
  const mathPdfSource = Buffer.from(mathPdf).toString("latin1");
  expect(mathPdfSource).toContain("DejaVuMathTeXGyre");
  const mathPage = await (await getDocument({ data: mathPdf, useSystemFonts: true }).promise).getPage(1);
  const mathText = (await mathPage.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
  expect(mathText).toContain("∈");
  expect(mathText).toContain("⇒");
  await expect(warning).toContainText("DejaVu Math TeX Gyre");
  const afterMath = requested.filter((url) => url.endsWith(".ttf"));
  expect(afterMath.filter((url) => !afterUnsupported.includes(url))).toEqual([
    expect.stringContaining("/fonts/pdf/dejavu-math/DejaVuMathTeXGyre.ttf"),
  ]);

  const beforeMathRepeat = [...requested];
  const mathRepeatDownload = page.waitForEvent("download");
  await native.click();
  await mathRepeatDownload;
  expect(requested).toEqual(beforeMathRepeat);
  const mathRepeatedNewFontRequests = requested.filter((url) => url.endsWith(".ttf")).length - afterMath.length;

  await editor.fill("Symbol fallback: 🔒 ⚠");
  const symbolStart = Date.now();
  const symbolDownloadPromise = page.waitForEvent("download");
  await native.click();
  const symbolDownload = await symbolDownloadPromise;
  const symbolFallbackExportMs = Date.now() - symbolStart;
  const symbolPdf = new Uint8Array(await readFile((await symbolDownload.path())!));
  const symbolPdfSource = Buffer.from(symbolPdf).toString("latin1");
  expect(symbolPdfSource).toContain("NotoSansSymbols2");
  const symbolPage = await (await getDocument({ data: symbolPdf, useSystemFonts: true }).promise).getPage(1);
  const symbolText = (await symbolPage.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
  expect(symbolText).toContain("🔒");
  expect(symbolText).toContain("⚠");
  await expect(warning).toContainText("Noto Sans Symbols 2");
  const afterSymbols = requested.filter((url) => url.endsWith(".ttf"));
  expect(afterSymbols.filter((url) => !afterMath.includes(url))).toEqual([
    expect.stringContaining("/fonts/pdf/noto-sans-symbols2/NotoSansSymbols2-Regular.ttf"),
  ]);

  const beforeSymbolRepeat = [...requested];
  const symbolRepeatDownload = page.waitForEvent("download");
  await native.click();
  await symbolRepeatDownload;
  expect(requested).toEqual(beforeSymbolRepeat);

  await editor.fill("Unqualified emoji: ⚠️ 👩🏽‍💻 🇺🇳 1️⃣");
  const complexDownload = page.waitForEvent("download");
  await native.click();
  await complexDownload;
  for (const codePoint of ["U+FE0F", "U+1F469", "U+1F3FD", "U+200D", "U+1F1FA", "U+20E3"]) {
    await expect(warning).toContainText(codePoint);
  }
  expect(requested.filter((url) => url.endsWith(".ttf"))).toEqual(afterSymbols);
  expect(requested.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  await Promise.all(transferReads);
  await mkdir("artifacts/m7.3", { recursive: true });
  await writeFile("artifacts/m7.3/unicode-resource-measurements.json", JSON.stringify({
    test: "DEV actual editor primary-only, mixed fallback, monochrome symbols, complex emoji diagnostics, repeated exports",
    initialEditorResources: initial.length,
    initialPdfAndFontResources: initial.filter((url) => url.includes("pdfmake") || (url.includes("/fonts/") && url.endsWith(".ttf"))),
    primaryOnlyExportMs,
    primaryOnlyFontRequests: primaryFonts,
    fallbackExportMs,
    fallbackFontRequests: afterFallback.filter((url) => !primaryFonts.includes(url)),
    repeatedFallbackExportMs,
    repeatedNewFontRequests,
    symbolFallbackExportMs,
    mathFallbackExportMs,
    mathRepeatedNewFontRequests,
    mathFallbackFontRequests: afterMath.filter((url) => !afterUnsupported.includes(url)),
    symbolFallbackFontRequests: afterSymbols.filter((url) => !afterMath.includes(url)),
    symbolFontRepeatedExportNewRequests: requested.filter((url) => url.endsWith(".ttf")).length - afterSymbols.length,
    observedResponseBodyTransfers: transfers,
    primaryOnlyTransferBytes: transfers.filter(({ path }) => primaryFonts.some((url) => new URL(url).pathname === path) || path.includes("pdfmake"))
      .reduce((sum, transfer) => sum + transfer.bytes, 0),
    totalObservedTransferBytes: transfers.reduce((sum, transfer) => sum + transfer.bytes, 0),
    uniqueFontPaths: [...new Set(transfers.filter(({ path }) => path.endsWith(".ttf")).map(({ path }) => path))],
    requestOrigins: [...new Set(requested.map((url) => new URL(url).origin))],
    noFallbackBeforeUse: true,
    unsupportedGlyphsReported: ["U+1F600", "U+6F22"],
    supportedMathematicalFallbackCodePoints: ["U+2208", "U+21D2"],
    supportedMonochromeSymbolGlyphs: ["U+1F512", "U+26A0"],
    unsupportedComplexEmojiSequences: ["⚠️", "👩🏽‍💻", "🇺🇳", "1️⃣"],
  }, null, 2));
});

test("DEV exports select document fonts, load only resolved faces, reuse warm assets and report limits accessibly", async ({ page }) => {
  await page.goto("/editor");
  const editor = markdownEditor(page);
  const native = page.getByRole("button", { name: "Native PDF (Experimental)" });
  const startupResources = await page.evaluate(() => performance.getEntriesByType("resource").map(({ name }) => name));
  expect(startupResources.some((url) => url.includes("pdfmake") || (url.includes("/fonts/") && /\.(?:ttf|woff2)$/.test(url)))).toBe(false);

  const requested: string[] = [];
  const transfers: { path: string; bytes: number }[] = [];
  const transferReads: Promise<void>[] = [];
  page.on("request", (request) => requested.push(request.url()));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(page.url()).origin || !(url.pathname.includes("pdfmake") || url.pathname.endsWith(".ttf"))) return;
    transferReads.push(response.body().then((bytes) => { transfers.push({ path: url.pathname, bytes: bytes.byteLength }); }).catch(() => {}));
  });

  const temp = await mkdtemp(path.join(os.tmpdir(), "docmark-font-benchmark-"));
  const benchmark: { coverageMetadataBytes: number; scenarios: Record<string, unknown>[] } = {
    coverageMetadataBytes: (await readFile("src/lib/pdf/fonts/coverage.generated.json")).byteLength,
    scenarios: [],
  };
  const exportScenario = async (name: string, source: string, family?: string) => {
    await editor.fill(source);
    if (family) {
      await selectSettingOption(page, "Font family", family);
      await closeDocumentSettings(page);
    }
    const requestStart = requested.length;
    const transferStart = transfers.length;
    const tempPdf = path.join(temp, `${name}.pdf`);
    const started = performance.now();
    const downloadPromise = page.waitForEvent("download");
    await native.click();
    const download = await downloadPromise;
    const generationMs = performance.now() - started;
    const downloadPath = (await download.path())!;
    const bytes = new Uint8Array(await readFile(downloadPath));
    const pdfBytes = bytes.byteLength;
    await writeFile(tempPdf, bytes);
    const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
    const textParts: string[] = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const content = await (await pdf.getPage(pageNo)).getTextContent();
      textParts.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
    }
    const pdffonts = execFileSync("pdffonts", [tempPdf], { encoding: "utf8" });
    await Promise.all(transferReads.slice(transferStart));
    const scenarioRequests = requested.slice(requestStart).filter((url) => url.endsWith(".ttf"));
    const scenarioTransfers = transfers.slice(transferStart);
    const record = {
      name,
      selectedDocumentFamily: family ?? "current document setting",
      coldOrWarm: name === "primary-latin" ? "cold editor export" : "warm browser session",
      requestedFontFaces: scenarioRequests.map((url) => new URL(url).pathname),
      fontRequests: scenarioRequests.length,
      observedTransferSizes: scenarioTransfers,
      fontBinaryTransferBytes: scenarioTransfers.filter(({ path: transferPath }) => transferPath.endsWith(".ttf")).reduce((sum, transfer) => sum + transfer.bytes, 0),
      pdfmakeChunkTransferBytes: scenarioTransfers.filter(({ path: transferPath }) => transferPath.includes("pdfmake")).reduce((sum, transfer) => sum + transfer.bytes, 0),
      allScenarioTransferBytes: scenarioTransfers.reduce((sum, transfer) => sum + transfer.bytes, 0),
      generationMs,
      pdfBytes,
      pageCount: pdf.numPages,
      embeddedFonts: pdffonts.split("\n").slice(2).map((line) => line.trim().split(/\s+/)[0]).filter((font) => font && font !== "-").map((font) => font.replace(/^[A-Z]{6}\+/, "")),
      extractedText: textParts.join("\n"),
    };
    benchmark.scenarios.push(record);
    return record;
  };

  try {
    const primary = await exportScenario("primary-latin", "Primary Latin text.", "Arial");
    expect(primary.requestedFontFaces).toEqual(["/fonts/liberation/LiberationSans-Regular.ttf"]);
    expect(primary.embeddedFonts.some((font) => font.includes("LiberationSans"))).toBe(true);

    const serif = await exportScenario("serif", "Serif family document.", "Georgia");
    expect(serif.requestedFontFaces).toEqual(["/fonts/liberation-serif/LiberationSerif-Regular.ttf"]);
    expect(serif.embeddedFonts.some((font) => font.includes("LiberationSerif"))).toBe(true);
    expect(serif.embeddedFonts.some((font) => font.includes("LiberationSans"))).toBe(false);

    const mono = await exportScenario("monospace", "```text\n    fixed-width technical code\n```", "Courier New");
    expect(mono.embeddedFonts.some((font) => font.includes("LiberationMono"))).toBe(true);

    const signature = await exportScenario("signature-sans", "Montserrat selected, regular and **bold**.", "Montserrat");
    expect(signature.embeddedFonts.some((font) => font.includes("DocmarkSignatureSans"))).toBe(true);

    const math = await exportScenario("math-fallback", "Operators ∈ ⇒", "Arial");
    expect(math.requestedFontFaces).toContain("/fonts/pdf/dejavu-math/DejaVuMathTeXGyre.ttf");
    expect(math.embeddedFonts.some((font) => font.includes("DejaVuMathTeXGyre"))).toBe(true);

    const pictograph = await exportScenario("pictograph-fallback", "Qualified monochrome 🔒 ⚠", "Arial");
    expect(pictograph.requestedFontFaces).toContain("/fonts/pdf/noto-sans-symbols2/NotoSansSymbols2-Regular.ttf");
    expect(pictograph.embeddedFonts.some((font) => font.includes("NotoSansSymbols2"))).toBe(true);

    const complex = await exportScenario("multiple-faces", "**Bold ₽**, *italic*, ***both***; ∈; 🔒.\n\n```text\n    code\n```", "Arial");
    for (const expected of ["LiberationSans-Bold", "LiberationSans-Italic", "LiberationSans-BoldItalic", "DocmarkSignatureSans-Bold", "DejaVuMathTeXGyre", "NotoSansSymbols2", "LiberationMono"]) {
      expect(complex.embeddedFonts.some((font) => font.includes(expected)), `${expected} was embedded for the mixed required-face plan`).toBe(true);
    }

    const repeated = await exportScenario("multiple-faces-repeat", "**Bold ₽**, *italic*, ***both***; ∈; 🔒.\n\n```text\n    code\n```", "Arial");
    expect(repeated.requestedFontFaces).toEqual([]);
    const repeatedAgain = await exportScenario("multiple-faces-repeat-again", "**Bold ₽**, *italic*, ***both***; ∈; 🔒.\n\n```text\n    code\n```", "Arial");
    expect(repeatedAgain.requestedFontFaces).toEqual([]);
    const warmSession = await exportScenario("sequential-serif-after-mixed", "Sequential serif export.", "Georgia");
    expect(warmSession.embeddedFonts.some((font) => font.includes("LiberationSerif"))).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    const warningSource = "NFD: cafe\u0301; mixed Arabic مرحبا, Hebrew שלום; unsupported emoji 😀.";
    const warningRecord = await exportScenario("mobile-diagnostics", warningSource, "Arial");
    expect(warningRecord.extractedText).toContain("[U+1F600]");
    const warning = page.getByRole("list", { name: "Native PDF export diagnostics" });
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Decomposed Unicode");
    await expect(warning).toContainText("Bidirectional ordering is not supported");
    await expect(warning).toContainText("U+1F600");
    const warningBox = await warning.boundingBox();
    expect(warningBox).not.toBeNull();
    expect(warningBox!.width).toBeLessThanOrEqual(390);
    await page.emulateMedia({ media: "print" });
    await expect(warning).toBeHidden();
    await page.emulateMedia({ media: "screen" });

    await Promise.all(transferReads);
    expect(requested.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
    const totalTransferBytes = transfers.reduce((sum, transfer) => sum + transfer.bytes, 0);
    await mkdir("artifacts/m7.3", { recursive: true });
    await writeFile("artifacts/m7.3/font-loading-benchmark.json", JSON.stringify({
      runtime: "Next.js actual DEV editor, Playwright Chromium, response body transfer bytes",
      startupResourceCount: startupResources.length,
      startupPdfOrFontRequests: startupResources.filter((url) => url.includes("pdfmake") || (url.includes("/fonts/") && /\.(?:ttf|woff2)$/.test(url))),
      coverageMetadataBytes: benchmark.coverageMetadataBytes,
      scenarios: benchmark.scenarios,
      repeatedExportNewFontRequests: repeated.requestedFontFaces,
      repeatedExportWarmMedianMs: (repeated.generationMs + repeatedAgain.generationMs) / 2,
      sequentialFamilySwitch: { from: "Arial plus mixed fallbacks", to: "Georgia", embeddedSerif: warmSession.embeddedFonts.some((font) => font.includes("LiberationSerif")) },
      totalObservedTransferBytes: totalTransferBytes,
      requestOrigins: [...new Set(requested.map((url) => new URL(url).origin))],
      note: "Each PDF parser and pdffonts check ran against the downloaded PDF. Requests are counted separately from actual response body bytes. Results are observations, not thresholds.",
    }, null, 2));
    await writeFile("artifacts/m7.3/font-cache-validation.json", JSON.stringify({
      loaderCache: "Covered by unit tests: identical concurrent loads return the same Promise, successful repeat loads do not refetch, failed fetches remove the rejected promise and retry successfully.",
      browserSession: {
        startupHadNoPdfEngineOrFonts: startupResources.every((url) => !url.includes("pdfmake") && !(/\/fonts\/.*\.(?:ttf|woff2)$/.test(url))),
        repeatedMultipleFamilyExportRequests: repeated.requestedFontFaces,
        familySwitchEmbeddedFonts: benchmark.scenarios.filter(({ name }) => ["serif", "signature-sans", "sequential-serif-after-mixed"].includes(String(name))).map(({ name, embeddedFonts }) => ({ name, embeddedFonts })),
        noExternalRequests: requested.every((url) => new URL(url).origin === new URL(page.url()).origin),
      },
      pdfmakeMemory: "The public browser API has no font-VFS eviction. The loader keeps raw Uint8Array faces for reuse and pdfmake's shared VFS keeps a decoded Buffer per unique path; family descriptors replace prior mappings. No unsupported VFS mutation or eviction was introduced.",
    }, null, 2));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
