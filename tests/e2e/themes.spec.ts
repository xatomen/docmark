import {
  expect,
  test } from "@playwright/test";
import { chooseLocalMarkdown,
  createNewDocument,
  forceFilePickerFallback,
  markdownEditor,
  renameActiveDocument,
  switchToDocument,
  openDocumentSettings,
  selectSettingOption,
  expectSettingSelection,
  setSwitch,
  closeDocumentSettings,
  openFileMenu,
  setCheckbox,
} from "./support";

declare global {
  interface Window {
    __printedTheme?: string;
    __themeWrites?: string[];
    __releaseThemeWrite?: () => void;
  }
}

const themeMarkdown = [
  "# Theme sample",
  "## Structure",
  "### Detail",
  "A paragraph with **strong**, *emphasis*, `inline code`, and [a local-style link](https://example.invalid).",
  "- First item\n- Second item\n  - Nested item\n- [ ] Pending task",
  "> A restrained quotation for the page.",
  "| Area | Result |\n| --- | --- |\n| Layout | Print-safe |",
  "```ts\nconst line = 'technical documentation remains readable';\n```",
  "---",
  ":::toc\n:::",
  "# Contents target",
  "```mermaid\nflowchart LR\n  A[Source] --> B[Document]\n```",
  "| A | B | C | D | E | F | G |\n| --- | --- | --- | --- | --- | --- | --- |\n| wide identifier | value | value | value | value | value | value |",
  `Long token ${"identifier".repeat(30)}`,
  "```text\n" + "a long code identifier without spaces ".repeat(12) + "\n```",
  ":::pagebreak\n:::",
  "# Second sheet",
].join("\n\n");

test("all document themes share measurement, preview, and print styles while Default preserves its baseline", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        window.__printedTheme = document.querySelector(".physical-page .document-content")?.getAttribute("data-docmark-theme") ?? "";
      },
    });
  });
  await page.goto("/editor");
  await markdownEditor(page).fill(themeMarkdown);
  await setSwitch(page, "Show page numbers", true);
  await setSwitch(page, "Show header", true);
  await openDocumentSettings(page, "Header & Footer");
  await page.getByLabel("Header text").fill("Theme header");
  await setSwitch(page, "Show footer", true);
  await openDocumentSettings(page, "Header & Footer");
  await page.getByLabel("Footer text").fill("Theme footer");
  await expect(page.locator(".physical-page .docmark-mermaid svg")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Page 2" })).toBeVisible();

  const observed: string[] = [];
  for (const theme of ["default", "technical", "academic", "minimal"] as const) {
    await selectSettingOption(page, "Document theme", theme);
    const content = page.locator(".physical-page .document-content").first();
    const measured = page.locator(".measurement-layer .document-content").first();
    await expect(content).toHaveAttribute("data-docmark-theme", theme);
    await expect(measured).toHaveAttribute("data-docmark-theme", theme);
    await expect(page.locator(".measurement-layer .docmark-toc").first()).toBeAttached();
    const headerBackground = await content.locator("th").first().evaluate((node) => getComputedStyle(node).backgroundColor);
    const tableBorder = await content.locator("td").first().evaluate((node) => getComputedStyle(node).borderTopColor);
    observed.push(`${headerBackground}/${tableBorder}`);

    const overflow = await page.locator(".physical-page").evaluateAll((pages) =>
      pages.every((element) => element.scrollWidth <= element.clientWidth + 1),
    );
    expect(overflow).toBe(true);
    await expect(page.locator("[data-page-decoration=header]")).toHaveCount(await page.getByRole("article").count());
    await expect(page.locator("[data-page-decoration=footer]")).toHaveCount(await page.getByRole("article").count());
    await expect(page.locator("[data-page-number]")).toHaveCount(await page.getByRole("article").count());
    await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  }
  expect(new Set(observed).size).toBeGreaterThan(1);
  await selectSettingOption(page, "Document theme", "technical");
  await closeDocumentSettings(page);
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect.poll(() => page.evaluate(() => window.__printedTheme)).toBe("technical");
  expect(await page.locator(".physical-page").first().evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(255, 255, 255)");
});

test("themes do not override Typography, code alignment, or bundled Montserrat", async ({ page }) => {
  await page.goto("/editor");
  await markdownEditor(page).fill("# Typography stays explicit\n\nA paragraph to inspect.\n\n```js\nconst code = true;\n```");
  await selectSettingOption(page, "Font family", "Montserrat");
  await selectSettingOption(page, "Base font size", "12");
  await selectSettingOption(page, "Line height", "1.6");
  await selectSettingOption(page, "Text alignment", "justify");
  for (const theme of ["technical", "academic", "minimal"] as const) {
    await selectSettingOption(page, "Document theme", theme);
    const paragraph = page.locator(".physical-page .document-content p").first();
    await expect.poll(() => paragraph.evaluate((node) => getComputedStyle(node).fontFamily)).toContain("Montserrat");
    await expect(paragraph).toHaveCSS("font-size", "16px");
    await expect(paragraph).toHaveCSS("line-height", "25.6px");
    await expect(paragraph).toHaveCSS("text-align", "justify");
    await expect(page.locator(".physical-page pre").first()).toHaveCSS("text-align", "left");
    await expect(page.locator(".physical-page pre").first()).toHaveCSS("font-family", /monospace/);
  }
});

test("theme changes restabilize TOC pagination and style Mermaid without rendering it again", async ({ page }) => {
  await page.goto("/editor");
  const sections = Array.from({ length: 16 }, (_, index) => `## Section ${index + 1}\n\n${"Measured text for theme pagination. ".repeat(9)}`);
  const markdown = [":::toc\n:::", "# Main heading", ...sections, "```mermaid\nflowchart LR\n  A --> B\n```"].join("\n\n");
  await markdownEditor(page).fill(markdown);
  const svg = page.locator(".physical-page .docmark-mermaid svg");
  await expect(svg).toHaveCount(1);
  const originalSvg = await svg.evaluate((element) => element.outerHTML);
  await selectSettingOption(page, "Document theme", "technical");
  await expect(page.locator(".page-list")).toHaveAttribute("data-toc-stabilization-passes", /[1-5]/);
  await expect(page.locator(".physical-page .docmark-toc-entry")).toHaveCount(17);
  await selectSettingOption(page, "Document theme", "academic");
  await selectSettingOption(page, "Document theme", "minimal");
  await expect(page.locator(".physical-page .document-content").first()).toHaveAttribute("data-docmark-theme", "minimal");
  await expect(svg).toHaveCount(1);
  expect(await svg.evaluate((element) => element.outerHTML)).toBe(originalSvg);
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
});

test("theme settings use the immutable snapshot semantics of Save", async ({ page }) => {
  const source = "---\ndocmark:\n  version: 1\n  theme: technical\n---\n# Save snapshot";
  await page.addInitScript((markdownFile) => {
    window.__themeWrites = [];
    let holdFirstWrite = true;
    const handle = {
      name: "theme.md",
      getFile: async () => new File([markdownFile], "theme.md"),
      createWritable: async () => ({
        write: async (contents: string) => {
          if (holdFirstWrite) {
            holdFirstWrite = false;
            await new Promise<void>((resolveWrite) => { window.__releaseThemeWrite = resolveWrite; });
          }
          window.__themeWrites!.push(String(contents));
        },
        close: async () => undefined,
        abort: async () => undefined,
      }),
    };
    window.showOpenFilePicker = async () => [handle as FileSystemFileHandle];
  }, source);
  await page.goto("/editor");
  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Open Markdown…", exact: true }).click();
  await expectSettingSelection(page, "Document theme", "Technical");

  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saving file…" })).toBeVisible();
  await selectSettingOption(page, "Document theme", "minimal");
  await page.evaluate(() => window.__releaseThemeWrite?.());
  await expect.poll(() => page.evaluate(() => window.__themeWrites?.length)).toBe(1);
  expect(await page.evaluate(() => window.__themeWrites?.[0] ?? "")).toContain("theme: technical");
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();

  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__themeWrites?.length)).toBe(2);
  expect(await page.evaluate(() => window.__themeWrites?.[1] ?? "")).toContain("theme: minimal");
});

test("wide tables split with repeated headers and stay contained in every theme", async ({ page }) => {
  await page.goto("/editor");
  const headings = ["| Area | A | B | C | D | E | F |", "| --- | --- | --- | --- | --- | --- | --- |"];
  const rows = Array.from({ length: 34 }, (_, index) =>
    `| service-deployment-${index} | ${"configuration-value-".repeat(2)} | rollout | stable | region | checked | ready |`,
  );
  await markdownEditor(page).fill(["# Wide table", ...headings, ...rows].join("\n"));

  for (const theme of ["default", "technical", "academic", "minimal"] as const) {
    await selectSettingOption(page, "Document theme", theme);
    await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
    const fragments = page.locator(".physical-page table");
    const fragmentCount = await fragments.count();
    expect(fragmentCount).toBeGreaterThan(1);
    await expect(page.locator(".physical-page table thead")).toHaveCount(fragmentCount);
    expect(await page.locator(".physical-page").evaluateAll((sheets) =>
      sheets.every((sheet) => sheet.scrollWidth <= sheet.clientWidth + 1),
    )).toBe(true);
  }
  await selectSettingOption(page, "Document theme", "technical");
  await expectSettingSelection(page, "Page size", "A4");
  await expectSettingSelection(page, "Orientation", "Portrait");
  await selectSettingOption(page, "Page size", "letter");
  await selectSettingOption(page, "Orientation", "landscape");
  await selectSettingOption(page, "Document theme", "academic");
  await expect.poll(() => page.locator(".physical-page").first().evaluate((node) => (node as HTMLElement).style.width)).toBe("279.4mm");
});

test("themes persist across reload, duplicate, and document switching without leaking", async ({ page }) => {
  await page.goto("/editor");
  await renameActiveDocument(page, "Technical source");
  await selectSettingOption(page, "Document theme", "technical");
  await markdownEditor(page).fill("# Technical source");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expectSettingSelection(page, "Document theme", "Technical");

  await closeDocumentSettings(page);
  await page.getByLabel("Active document: Technical source. Open document list").click();
  await page.getByRole("button", { name: /^Actions for / }).first().click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expectSettingSelection(page, "Document theme", "Technical");
  await selectSettingOption(page, "Document theme", "academic");
  await createNewDocument(page);
  await expectSettingSelection(page, "Document theme", "Default");
  await switchToDocument(page, "Technical source copy");
  await expectSettingSelection(page, "Document theme", "Academic");
  await switchToDocument(page, "Technical source");
  await expectSettingSelection(page, "Document theme", "Technical");
});

test("theme Front Matter is portable, preserves external metadata, and safely falls back for unknown IDs", async ({ page }) => {
  await forceFilePickerFallback(page);
  await page.goto("/editor");
  const source = [
    "---", "title: External title", "owner: Example", "docmark:", "  version: 1", "  theme: academic", "---", "# Imported theme",
  ].join("\n");
  await chooseLocalMarkdown(page, "academic.md", source);
  await expectSettingSelection(page, "Document theme", "Academic");
  await openDocumentSettings(page, "Markdown metadata");
  await expect(page.getByLabel("Include Docmark settings in Markdown")).toBeChecked();
  await closeDocumentSettings(page);
  await selectSettingOption(page, "Document theme", "minimal");
  await openFileMenu(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const { readFile } = await import("node:fs/promises");
  const portable = await readFile(downloadPath!, "utf8");
  expect(portable).toContain("title: External title");
  expect(portable).toContain("owner: Example");
  expect(portable).toContain("theme: minimal");
  await openDocumentSettings(page, "Markdown metadata");
  await setCheckbox(page, "Include Docmark settings in Markdown", false);
  await openFileMenu(page);
  const plainDownloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const plainDownload = await plainDownloadPromise;
  const plainPath = await plainDownload.path();
  const plain = await readFile(plainPath!, "utf8");
  expect(plain).toContain("title: External title");
  expect(plain).not.toContain("docmark:");

  const unknownSource = source.replace("academic", "custom-css");
  await chooseLocalMarkdown(page, "unknown.md", unknownSource);
  await expectSettingSelection(page, "Document theme", "Default");
  await openDocumentSettings(page, "Markdown metadata");
  await expect(page.getByRole("status").filter({ hasText: "invalid" })).toBeVisible();
});

test("document paper and theme remain independent of dark application appearance", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/editor");
  await markdownEditor(page).fill("# Paper stays light\n\nMinimal document styling.");
  await selectSettingOption(page, "Document theme", "minimal");
  await expect(page.locator(".physical-page .document-content").first()).toHaveAttribute("data-docmark-theme", "minimal");
  await expect(page.locator(".physical-page").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".physical-page h1").first()).toHaveCSS("color", "rgb(41, 44, 41)");
});
