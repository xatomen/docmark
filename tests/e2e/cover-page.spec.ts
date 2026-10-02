import { expect, test } from "@playwright/test";
import { chooseLocalMarkdown, forceFilePickerFallback, markdownEditor } from "./support";

declare global {
  interface Window {
    __coverWrites?: string[];
    __releaseCoverWrite?: () => void;
  }
}

test("cover is a physical page, renders literal text, and suppresses its decorations", async ({ page }) => {
  await page.goto("/editor");
  await expect(markdownEditor(page)).toBeVisible();
  await markdownEditor(page).fill("# Introduction\n\nCover test body");
  await page.getByRole("checkbox", { name: "Enable cover page" }).check();
  await page.getByRole("textbox", { name: "Cover title" }).fill("**Architecture** <script>safe</script>");
  await page.getByRole("textbox", { name: "Cover author" }).fill("Jorge");
  await page.getByRole("checkbox", { name: "Show page numbers" }).check();
  await page.getByRole("checkbox", { name: "Show header" }).check();
  await page.getByRole("textbox", { name: "Header text" }).fill("Shared header");

  const physicalPages = page.locator(".physical-page");
  await expect(physicalPages).toHaveCount(2);
  await expect(physicalPages.nth(0)).toHaveAttribute("data-page-kind", "cover");
  await expect(physicalPages.nth(1)).toHaveAttribute("data-page-kind", "content");
  await expect(physicalPages.nth(0).locator("[data-document-cover]")).toContainText("**Architecture** <script>safe</script>");
  await expect(physicalPages.nth(0).locator("script")).toHaveCount(0);
  await expect(physicalPages.nth(0).locator("[data-page-decoration], [data-page-number]")).toHaveCount(0);
  await expect(physicalPages.nth(1).locator("[data-page-number]")).toHaveText("1");
  await expect(physicalPages.nth(1).locator("[data-page-decoration=header]")).toHaveText("Shared header");
  await page.getByRole("checkbox", { name: "Enable cover page" }).uncheck();
  await page.getByRole("checkbox", { name: "Enable cover page" }).check();
  await expect(page.getByRole("textbox", { name: "Cover title" })).toHaveValue("**Architecture** <script>safe</script>");

  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".page-stage")).toHaveCount(2);
  await page.emulateMedia({ media: "screen" });
});

test("an enabled cover with an empty Markdown body is a single blank cover page", async ({ page }) => {
  await page.goto("/editor");
  await expect(markdownEditor(page)).toBeVisible();
  await markdownEditor(page).fill("");
  await page.getByRole("checkbox", { name: "Enable cover page" }).check();
  await expect(page.locator(".physical-page")).toHaveCount(1);
  await expect(page.locator(".physical-page")).toHaveAttribute("data-page-kind", "cover");
  await expect(page.locator("[data-document-cover]")).toBeVisible();
});

test("cover settings persist across reload and duplicate, while TOC uses logical page numbers", async ({ page }) => {
  await page.goto("/editor");
  await expect(markdownEditor(page)).toBeVisible();
  await markdownEditor(page).fill("# Introduction\n\n:::toc\n:::");
  await page.getByRole("checkbox", { name: "Enable cover page" }).check();
  await page.getByRole("textbox", { name: "Cover title" }).fill("Physical cover");
  await expect(page.locator(".docmark-toc-page").first()).toHaveText("1");
  await expect(page.locator(".physical-page").first()).toHaveAttribute("data-page-kind", "cover");
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Enable cover page" })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Cover title" })).toHaveValue("Physical cover");

  await page.locator('button[aria-label^="Active document:"]').click();
  await page.getByRole("button", { name: /^Actions for / }).first().click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Cover title" })).toHaveValue("Physical cover");
  await expect(page.locator(".physical-page").first()).toHaveAttribute("data-page-kind", "cover");
});

test("cover follows theme and selected typography across paper sizes and orientation", async ({ page }) => {
  await page.goto("/editor");
  await expect(markdownEditor(page)).toBeVisible();
  await markdownEditor(page).fill("# Body");
  await page.getByRole("checkbox", { name: "Enable cover page" }).check();
  await page.getByRole("textbox", { name: "Cover title" }).fill("A long cover title ".repeat(24));
  await page.getByLabel("Font family").selectOption("Montserrat");

  for (const theme of ["default", "technical", "academic", "minimal"] as const) {
    await page.getByLabel("Document theme").selectOption(theme);
    await expect(page.locator(".document-cover-theme")).toHaveAttribute("data-docmark-theme", theme);
    await expect(page.getByLabel("Font family")).toHaveValue("Montserrat");
    await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  }
  const title = page.locator(".document-cover-title");
  expect(await title.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await title.evaluate((node) => getComputedStyle(node).textAlign)).toBe("center");
  expect(await title.evaluate((node) => getComputedStyle(node).fontFamily)).toContain("Montserrat");

  await page.getByLabel("Page size").selectOption("letter");
  await page.getByLabel("Orientation").selectOption("landscape");
  await expect.poll(() => page.locator(".physical-page").first().evaluate((node) => (node as HTMLElement).style.width)).toBe("279.4mm");
  await expect(page.locator(".physical-page").first()).toHaveAttribute("data-page-kind", "cover");
});

test("portable cover Front Matter opens and saves while OFF leaves ordinary Markdown clean", async ({ page }) => {
  await forceFilePickerFallback(page);
  await page.goto("/editor");
  const source = "---\ndocmark:\n  version: 1\n  cover:\n    enabled: true\n    title: Portable report\n    subtitle: Local draft\n    author: Jorge\n    organization: Example\n    date: '2026-10-02'\n---\n# Body";
  await chooseLocalMarkdown(page, "cover.md", source);
  await expect(page.getByRole("checkbox", { name: "Enable cover page" })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Cover title" })).toHaveValue("Portable report");
  await expect(page.getByRole("textbox", { name: "Cover date" })).toHaveValue("2026-10-02");
  await page.getByRole("textbox", { name: "Cover subtitle" }).fill("Updated subtitle");
  await page.getByRole("button", { name: "File", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const { readFile } = await import("node:fs/promises");
  const saved = await readFile(path!, "utf8");
  expect(saved).toContain("cover:");
  expect(saved).toContain("subtitle: Updated subtitle");
  expect(saved).toContain("# Body");

  await page.getByRole("checkbox", { name: "Include Docmark settings in Markdown" }).uncheck();
  await page.getByRole("button", { name: "File", exact: true }).click();
  const localDownloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const localDownload = await localDownloadPromise;
  const localPath = await localDownload.path();
  expect(localPath).not.toBeNull();
  const localSaved = await readFile(localPath!, "utf8");
  expect(localSaved).not.toContain("docmark:");
  expect(localSaved).toContain("# Body");
});

test("portable cover saves use the immutable settings snapshot", async ({ page }) => {
  const source = "---\ndocmark:\n  version: 1\n  cover:\n    enabled: true\n    title: Snapshot A\n---\n# Body";
  await page.addInitScript((markdownFile) => {
    window.__coverWrites = [];
    let holdFirstWrite = true;
    const handle = {
      name: "cover.md",
      getFile: async () => new File([markdownFile], "cover.md"),
      createWritable: async () => ({
        write: async (contents: string) => {
          if (holdFirstWrite) {
            holdFirstWrite = false;
            await new Promise<void>((resolveWrite) => { window.__releaseCoverWrite = resolveWrite; });
          }
          window.__coverWrites!.push(String(contents));
        },
        close: async () => undefined,
        abort: async () => undefined,
      }),
    };
    window.showOpenFilePicker = async () => [handle as FileSystemFileHandle];
  }, source);
  await page.goto("/editor");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open Markdown…", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Cover title" })).toHaveValue("Snapshot A");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saving file…" })).toBeVisible();
  await page.getByRole("textbox", { name: "Cover title" }).fill("Snapshot B");
  await page.evaluate(() => window.__releaseCoverWrite?.());
  await expect.poll(() => page.evaluate(() => window.__coverWrites?.length)).toBe(1);
  expect(await page.evaluate(() => window.__coverWrites?.[0] ?? "")).toContain("title: Snapshot A");
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__coverWrites?.length)).toBe(2);
  expect(await page.evaluate(() => window.__coverWrites?.[1] ?? "")).toContain("title: Snapshot B");
});
