import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { chooseLocalMarkdown, forceFilePickerFallback, markdownEditor } from "./support";

declare global {
  interface Window {
    __printedToc?: { label: string; page: string }[];
  }
}

async function expectTocMatchesDisplayNumbers(page: Page) {
  const entries = page.locator("article .docmark-toc-entry");
  const count = await entries.count();
  const startAt = Number(await page.getByLabel("Page number start at").inputValue());
  const excludeCover = await page.getByLabel("Exclude cover from numbering").isChecked();
  let nextDisplayPageNumber = startAt;
  const pageNumbers = await page.locator("article").evaluateAll((articles, shouldExcludeCover) =>
    articles.map((article) => article.getAttribute("data-page-kind") === "cover" && shouldExcludeCover ? null : "count"),
    excludeCover,
  );
  const displayPageNumbers = pageNumbers.map((entry) => {
    if (entry === null) return null;
    const number = nextDisplayPageNumber;
    nextDisplayPageNumber += 1;
    return number;
  });

  for (let index = 0; index < count; index += 1) {
    const entry = entries.nth(index);
    const id = await entry.getAttribute("data-docmark-toc-entry");
    expect(id).toBeTruthy();
    const heading = page.locator(`[data-docmark-heading-id="${id}"]`).first();
    const article = heading.locator("xpath=ancestor::article");
    const ariaLabel = await article.getAttribute("aria-label");
    const physicalIndex = Number(ariaLabel?.match(/^Page (\d+)/)?.[1]) - 1;
    const displayPageNumber = displayPageNumbers[physicalIndex];
    expect(displayPageNumber).not.toBeNull();
    await expect(entry.locator(".docmark-toc-page")).toHaveText(String(displayPageNumber));
  }
}

test("TOC maps headings to logical display numbers independently of decoration visibility", async ({ page }) => {
  await page.goto("/editor");
  const markdown = [
    "# Report before TOC",
    "",
    ":::toc", ":::",
    "",
    ":::pagebreak", ":::",
    "",
    ":::pagebreak", ":::",
    "",
    "## **Formatted** `heading` [link](https://example.invalid)",
    "",
    ":::pagebreak", ":::",
    "",
    "# Duplicate",
    "",
    "# Duplicate",
    "",
    "### Orphan H3",
    "",
    "#### Excluded H4",
    "",
    "```md", "# Fenced heading", "```",
    "",
    ":::toc", ":::",
  ].join("\n");
  await markdownEditor(page).fill(markdown);

  const entries = page.locator("article .docmark-toc-entry");
  await expect(entries).toHaveCount(5);
  await expect(entries.nth(0).locator(".docmark-toc-label")).toHaveText("Report before TOC");
  await expect(entries.nth(1).locator(".docmark-toc-label")).toHaveText("Formatted heading link");
  await expect(entries.nth(2).locator(".docmark-toc-label")).toHaveText("Duplicate");
  await expect(entries.nth(3).locator(".docmark-toc-label")).toHaveText("Duplicate");
  await expect(entries.nth(4).locator(".docmark-toc-label")).toHaveText("Orphan H3");
  await expect(page.getByRole("article", { name: "Page 2, blank" })).toBeVisible();
  await expect.poll(async () => Number(await page.locator(".page-list").getAttribute("data-toc-stabilization-passes")))
    .toBeGreaterThan(1);
  await expectTocMatchesDisplayNumbers(page);

  await page.getByLabel("Show page numbers").check();
  await page.getByLabel("Page number start at").fill("10");
  const formattedEntry = page.locator('article .docmark-toc-entry[data-docmark-toc-entry="docmark-heading-1"]');
  await expect(formattedEntry.locator(".docmark-toc-page").first()).toHaveText("12");
  await expect(page.getByLabel("Page number 12")).toBeVisible();
  await expectTocMatchesDisplayNumbers(page);

  await expect(markdownEditor(page)).toContainText(":::toc");
  await expect(page.locator("article .docmark-toc-title")).toHaveCount(1);
  await expect(page.locator("article .docmark-toc-list")).not.toContainText("Excluded H4");
});

test("long TOCs split across physical pages and preserve every source heading", async ({ page }) => {
  await page.goto("/editor");
  const headings = Array.from({ length: 85 }, (_, index) => `## Section ${index + 1}`);
  headings[41] = `## ${"UnbrokenArchitectureToken".repeat(10)}`;
  await markdownEditor(page).fill(`:::toc\n:::\n\n${headings.join("\n\n")}`);

  await expect(page.locator("article .docmark-toc-entry")).toHaveCount(85);
  expect(await page.locator("article .docmark-toc").count()).toBeGreaterThan(1);
  await expect.poll(async () => Number(await page.locator(".page-list").getAttribute("data-toc-stabilization-passes")))
    .toBeGreaterThan(1);
  await expectTocMatchesDisplayNumbers(page);
  await expect(page.locator("article").last().getByRole("heading", { name: "Section 85" })).toBeVisible();
  const hasHorizontalOverflow = await page.locator("article").evaluateAll((articles) =>
    articles.some((article) => article.scrollWidth > article.clientWidth + 1),
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("documents without a TOC do not enter the stabilization loop", async ({ page }) => {
  await page.goto("/editor");
  await markdownEditor(page).fill("# Ordinary document");

  await expect(page.locator(".page-list")).toHaveAttribute("data-toc-stabilization-passes", "0");
  await expect(page.locator(".docmark-toc")).toHaveCount(0);

  await markdownEditor(page).fill(":::toc\n:::\n\nNormal paragraph.");
  await expect(page.locator("article .docmark-toc-title")).toHaveText("Table of Contents");
  await expect(page.locator("article .docmark-toc-entry")).toHaveCount(0);

  await markdownEditor(page).fill("# A heading after rapid edit");
  await expect(page.locator(".page-list")).toHaveAttribute("data-toc-stabilization-passes", "0");
  await expect(page.locator("article .docmark-toc")).toHaveCount(0);
});

test("TOC survives Markdown open, source-only Save, reload, and browser print", async ({ page }) => {
  await forceFilePickerFallback(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        window.__printedToc = Array.from(
          document.querySelectorAll(".physical-page .docmark-toc-entry"),
          (entry) => ({
            label: entry.querySelector(".docmark-toc-label")?.textContent ?? "",
            page: entry.querySelector(".docmark-toc-page")?.textContent ?? "",
          }),
        );
      },
    });
  });
  await page.goto("/editor");
  const source = "# Report\n\n:::toc\n:::\n\n## Scope\n";
  await chooseLocalMarkdown(page, "report.md", source);

  await expect(page.locator("article .docmark-toc-entry")).toHaveCount(2);
  await expect(markdownEditor(page)).toContainText(":::toc");
  await page.getByText("File", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  await expect(readFile(path!, "utf8")).resolves.toBe(source);

  await page.reload();
  await expect(page.locator("article .docmark-toc-entry")).toHaveCount(2);
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect.poll(() => page.evaluate(() => window.__printedToc)).toEqual([
    { label: "Report", page: "1" },
    { label: "Scope", page: "1" },
  ]);
});

test("TOC uses selected typography without inheriting body alignment", async ({ page }) => {
  await page.goto("/editor");
  await markdownEditor(page).fill(":::toc\n:::\n\n# Typography\n\n## Montserrat");
  await page.getByLabel("Text alignment").selectOption("justify");
  await page.getByLabel("Font family").selectOption("Montserrat");

  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  const tocLabel = page.locator("article .docmark-toc-label").first();
  await expect.poll(() => tocLabel.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Montserrat");
  expect(await tocLabel.evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
  expect(await page.locator(".measurement-layer .docmark-toc-label").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Montserrat");
});
