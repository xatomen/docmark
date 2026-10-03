import {
  readFile } from "node:fs/promises";
import { expect,
  test,
  type Page } from "@playwright/test";
import {
  chooseLocalMarkdown,
  createNewDocument,
  forceFilePickerFallback,
  markdownEditor,
  renameActiveDocument,
  switchToDocument,
  openDocumentSettings,
  setSwitch,
  setCheckbox,
  closeDocumentSettings,
  openFileMenu,
} from "./support";

declare global {
  interface Window {
    __logicalPrint?: { numbers: string[]; toc: string[] };
  }
}

function visiblePageNumbers(page: Page) {
  return page.locator("article [data-page-number]");
}

async function expectTocMatchesDecorations(page: Page) {
  const entries = page.locator("article .docmark-toc-entry");
  const count = await entries.count();
  for (let index = 0; index < count; index += 1) {
    const entry = entries.nth(index);
    const headingId = await entry.getAttribute("data-docmark-toc-entry");
    expect(headingId).toBeTruthy();
    const heading = page.locator(`[data-docmark-heading-id="${headingId}"]`).first();
    const article = heading.locator("xpath=ancestor::article");
    const number = article.locator("[data-page-number]");
    await expect(number).toBeVisible();
    await expect(entry.locator(".docmark-toc-page")).toHaveText(await number.textContent() ?? "");
  }
}

test("new documents default to excluding cover and startAt zero counts physical content pages", async ({ page }) => {
  await page.goto("/editor");
  await openDocumentSettings(page, ["Cover", "Page numbers"]);
  const excludeCover = page.getByLabel("Exclude cover from numbering");
  await expect(excludeCover).toBeChecked();
  await expect(excludeCover).toBeDisabled();
  await closeDocumentSettings(page);
  await openDocumentSettings(page, "Page numbers");
  await setSwitch(page, "Show page numbers", true);
  await closeDocumentSettings(page);
  await markdownEditor(page).fill([
    "# First content page",
    "",
    ":::pagebreak", ":::",
    "",
    ":::pagebreak", ":::",
    "",
    "# Third physical page",
  ].join("\n"));

  const physicalPages = page.locator("article.physical-page");
  await expect(physicalPages).toHaveCount(3);
  await expect(visiblePageNumbers(page)).toHaveText(["1", "2", "3"]);
  await openDocumentSettings(page, "Page numbers");
  await page.getByLabel("Page number start at").fill("0");
  await expect(visiblePageNumbers(page)).toHaveText(["0", "1", "2"]);
  await expect(physicalPages).toHaveCount(3);
  await expect(page.getByLabel("Page number start at")).toHaveValue("0");
});

test("cover exclusion is semantic, toggles cleanly, survives cover toggles, reload, and duplication", async ({ page }) => {
  await page.goto("/editor");
  await markdownEditor(page).fill("# Introduction\n\n:::pagebreak\n:::\n\n# Architecture");
  await setSwitch(page, "Show page numbers", true);
  await setSwitch(page, "Enable cover page", true);
  await openDocumentSettings(page, ["Cover", "Page numbers"]);
  const excludeCover = page.getByLabel("Exclude cover from numbering");
  await expect(excludeCover).toBeChecked();
  await expect(page.locator("article")).toHaveCount(3);
  await expect(page.locator("article").first()).toHaveAttribute("data-page-kind", "cover");
  await expect(page.locator("article").first().locator("[data-page-number]")).toHaveCount(0);
  await expect(visiblePageNumbers(page)).toHaveText(["1", "2"]);

  await closeDocumentSettings(page);
  await setCheckbox(page, "Exclude cover from numbering", false);
  await expect(visiblePageNumbers(page)).toHaveText(["2", "3"]);
  await setCheckbox(page, "Exclude cover from numbering", true);
  await expect(visiblePageNumbers(page)).toHaveText(["1", "2"]);
  await setSwitch(page, "Enable cover page", false);
  await expect(excludeCover).toBeChecked();
  await expect(excludeCover).toBeDisabled();
  await expect(visiblePageNumbers(page)).toHaveText(["1", "2"]);
  await setSwitch(page, "Enable cover page", true);
  await expect(excludeCover).toBeChecked();

  await openDocumentSettings(page, "Page numbers");
  await page.getByLabel("Page number start at").fill("0");
  await expect(visiblePageNumbers(page)).toHaveText(["0", "1"]);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await closeDocumentSettings(page);
  await page.reload();
  await openDocumentSettings(page, "Page numbers");
  await expect(excludeCover).toBeChecked();
  await expect(page.getByLabel("Page number start at")).toHaveValue("0");
  await expect(visiblePageNumbers(page)).toHaveText(["0", "1"]);

  await closeDocumentSettings(page);
  await page.locator('button[aria-label^="Active document:"]').click();
  await page.getByRole("button", { name: /^Actions for / }).first().click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await openDocumentSettings(page, "Page numbers");
  await expect(page.getByLabel("Exclude cover from numbering")).toBeChecked();
  await expect(page.getByLabel("Page number start at")).toHaveValue("0");
  await expect(visiblePageNumbers(page)).toHaveText(["0", "1"]);
});

test("TOC and decorations share logical numbers, including zero, while disabled decorations leave TOC numbering", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        window.__logicalPrint = {
          numbers: Array.from(document.querySelectorAll("article [data-page-number]"), (node) => node.textContent ?? ""),
          toc: Array.from(document.querySelectorAll("article .docmark-toc-page"), (node) => node.textContent ?? ""),
        };
      },
    });
  });
  await page.goto("/editor");
  await markdownEditor(page).fill([
    ":::toc", ":::",
    "",
    "# Introduction",
    "",
    "Intro content.",
    "",
    ":::pagebreak", ":::",
    "",
    "# Architecture",
  ].join("\n"));
  await setSwitch(page, "Enable cover page", true);
  await setSwitch(page, "Show page numbers", true);
  await expect(page.locator("article")).toHaveCount(3);
  await expectTocMatchesDecorations(page);
  const introductionId = await page.getByRole("heading", { name: "Introduction" }).getAttribute("data-docmark-heading-id");
  const introductionToc = page.locator(`.docmark-toc-entry[data-docmark-toc-entry="${introductionId}"] .docmark-toc-page`).first();
  await expect(introductionToc).toHaveText("1");

  await setCheckbox(page, "Exclude cover from numbering", false);
  await expectTocMatchesDecorations(page);
  await expect(introductionToc).toHaveText("2");

  await setCheckbox(page, "Exclude cover from numbering", true);
  await openDocumentSettings(page, "Page numbers");
  await page.getByLabel("Page number start at").fill("0");
  await expectTocMatchesDecorations(page);
  await expect(introductionToc).toHaveText("0");
  await closeDocumentSettings(page);
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect.poll(() => page.evaluate(() => window.__logicalPrint)).toEqual({
    numbers: ["0", "1"],
    toc: ["0", "1"],
  });

  await setSwitch(page, "Show page numbers", false);
  await expect(visiblePageNumbers(page)).toHaveCount(0);
  await expect(introductionToc).toHaveText("0");
  await expect(page.locator("article")).toHaveCount(3);
});

test("portable Front Matter opens, saves, and reloads zero and cover exclusion", async ({ page }) => {
  await forceFilePickerFallback(page);
  await page.goto("/editor");
  const source = [
    "---",
    "custom: keep this",
    "docmark:",
    "  version: 1",
    "  cover:",
    "    enabled: true",
    "    title: Portable cover",
    "  pageNumbers:",
    "    enabled: true",
    "    position: bottom-center",
    "    startAt: 0",
    "    excludeCover: true",
    "---",
    ":::toc", ":::",
    "",
    "# Portable heading",
  ].join("\n");
  await chooseLocalMarkdown(page, "logical.md", source);

  await openDocumentSettings(page, ["Cover", "Page numbers"]);
  await expect(page.getByRole("switch", { name: "Enable cover page" })).toBeChecked();
  await expect(page.getByLabel("Page number start at")).toHaveValue("0");
  await expect(page.getByLabel("Exclude cover from numbering")).toBeChecked();
  await expect(visiblePageNumbers(page)).toHaveText(["0"]);
  await expect(page.locator(".docmark-toc-page").first()).toHaveText("0");

  await openFileMenu(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const saved = await readFile((await download.path())!, "utf8");
  expect(saved).toContain("custom: keep this");
  expect(saved).toContain("startAt: 0");
  expect(saved).toContain("excludeCover: true");

  await page.reload();
  await openDocumentSettings(page, "Page numbers");
  await expect(page.getByLabel("Page number start at")).toHaveValue("0");
  await expect(page.getByLabel("Exclude cover from numbering")).toBeChecked();
  await expect(visiblePageNumbers(page)).toHaveText(["0"]);
});

test("legacy portable metadata without excludeCover keeps the old included-cover sequence", async ({ page }) => {
  await page.goto("/editor");
  const source = [
    "---",
    "docmark:",
    "  version: 1",
    "  cover:",
    "    enabled: true",
    "    title: Legacy cover",
    "  pageNumbers:",
    "    enabled: true",
    "    startAt: 5",
    "---",
    "# Content",
  ].join("\n");
  await chooseLocalMarkdown(page, "legacy.md", source);
  await openDocumentSettings(page, "Page numbers");
  await expect(page.getByLabel("Exclude cover from numbering")).not.toBeChecked();
  await expect(visiblePageNumbers(page)).toHaveText(["6"]);
  await expect(page.locator("article").first().locator("[data-page-number]")).toHaveCount(0);
});

test("logical page-number settings stay isolated between documents", async ({ page }) => {
  await page.goto("/editor");
  await markdownEditor(page).fill("# Document A");
  await renameActiveDocument(page, "Logical A");
  await setSwitch(page, "Enable cover page", true);
  await setSwitch(page, "Show page numbers", true);
  await openDocumentSettings(page, "Page numbers");
  await page.getByLabel("Page number start at").fill("0");
  await expect(page.getByLabel("Exclude cover from numbering")).toBeChecked();
  await expect(visiblePageNumbers(page)).toHaveText(["0"]);

  await createNewDocument(page);
  await renameActiveDocument(page, "Logical B");
  await markdownEditor(page).fill("# Document B");
  await setSwitch(page, "Enable cover page", true);
  await setSwitch(page, "Show page numbers", true);
  await openDocumentSettings(page, "Page numbers");
  await page.getByLabel("Page number start at").fill("5");
  await setCheckbox(page, "Exclude cover from numbering", false);
  await expect(visiblePageNumbers(page)).toHaveText(["6"]);

  await switchToDocument(page, "Logical A");
  await openDocumentSettings(page, "Page numbers");
  await expect(page.getByLabel("Page number start at")).toHaveValue("0");
  await expect(page.getByLabel("Exclude cover from numbering")).toBeChecked();
  await expect(visiblePageNumbers(page)).toHaveText(["0"]);
  await switchToDocument(page, "Logical B");
  await openDocumentSettings(page, "Page numbers");
  await expect(page.getByLabel("Page number start at")).toHaveValue("5");
  await expect(page.getByLabel("Exclude cover from numbering")).not.toBeChecked();
  await expect(visiblePageNumbers(page)).toHaveText(["6"]);
});
