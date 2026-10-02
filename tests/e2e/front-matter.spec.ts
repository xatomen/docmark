import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { activeDocumentSummary, chooseLocalMarkdown, forceFilePickerFallback, markdownEditor } from "./support";

const fixturePath = (name: string) => resolve(process.cwd(), "tests", "fixtures", name);

declare global {
  interface Window {
    __openedMarkdownFile?: string;
    __markdownFileWrites?: string[];
    __saveAsNames?: string[];
    __saveAsWrites?: Record<string, string>;
    __releaseMarkdownWrite?: () => void;
    __plainFileOutput?: string;
  }
}

async function downloadCurrentMarkdown(page: import("@playwright/test").Page): Promise<string> {
  await page.getByText("File", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!, "utf8");
}

test("plain Markdown stays plain when portability is off, even if local settings change", async ({ page }) => {
  await forceFilePickerFallback(page);
  await page.goto("/editor");
  const source = await readFile(fixturePath("basic.md"), "utf8");
  await chooseLocalMarkdown(page, "plain.md", source);

  await expect(markdownEditor(page)).toContainText("Basics");
  await expect(page.getByLabel("Page size")).toHaveValue("a4");
  await expect(page.getByLabel("Orientation")).toHaveValue("portrait");
  await expect(page.getByRole("checkbox", { name: "Include Docmark settings in Markdown" })).not.toBeChecked();
  await page.getByLabel("Page size").selectOption("letter");

  expect(await downloadCurrentMarkdown(page)).toBe(source);
});

test("settings stay file-clean while off, then opt a plain file into v1 portability", async ({ page }) => {
  const source = await readFile(fixturePath("basic.md"), "utf8");
  await page.addInitScript((markdownFile) => {
    const handle = {
      name: "plain.md",
      getFile: async () => new File([markdownFile], "plain.md"),
      createWritable: async () => ({
        write: async (content: string) => { window.__plainFileOutput = String(content); },
        close: async () => undefined,
        abort: async () => undefined,
      }),
    };
    window.showOpenFilePicker = async () => [handle as FileSystemFileHandle];
  }, source);
  await page.goto("/editor");
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Open Markdown…" }).click();
  await expect(page.getByText("File saved", { exact: true })).toBeVisible();

  await page.getByLabel("Page size").selectOption("letter");
  await expect(page.getByText("File saved", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Include Docmark settings in Markdown" }).check();
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__plainFileOutput)).toContain("version: 1");
  await expect.poll(() => page.evaluate(() => window.__plainFileOutput)).toContain("size: Letter");
  await expect(page.getByText("File saved", { exact: true })).toBeVisible();
});

test("external front matter survives body edits without enabling Docmark metadata", async ({ page }) => {
  await forceFilePickerFallback(page);
  await page.goto("/editor");
  await chooseLocalMarkdown(page, "external.md", await readFile(fixturePath("external-frontmatter.md"), "utf8"));

  await expect(markdownEditor(page)).toContainText("External Metadata");
  await expect(markdownEditor(page)).not.toContainText("External Tool Title");
  await expect(page.getByRole("checkbox", { name: "Include Docmark settings in Markdown" })).not.toBeChecked();
  await markdownEditor(page).fill("# Edited body\n\nStill local Markdown.");

  const saved = await downloadCurrentMarkdown(page);
  expect(saved).toContain("title: External Tool Title");
  expect(saved).toContain("author: Example Author");
  expect(saved).toContain("nested: true");
  expect(saved).not.toContain("docmark:");
  expect(saved).toContain("# Edited body\n\nStill local Markdown.");
});

test("portable metadata restores settings, remains out of the editor, and preserves page breaks", async ({ page }) => {
  await forceFilePickerFallback(page);
  await page.goto("/editor");
  const source = await readFile(fixturePath("portable-report.md"), "utf8");
  await chooseLocalMarkdown(page, "portable-report.md", source);

  await expect(markdownEditor(page)).toContainText("# Portable Report");
  await expect(markdownEditor(page)).not.toContainText("docmark:");
  await expect(markdownEditor(page)).not.toContainText("External Report Title");
  await expect(page.getByLabel("Page size")).toHaveValue("letter");
  await expect(page.getByLabel("Orientation")).toHaveValue("landscape");
  await expect(page.getByRole("checkbox", { name: "Include Docmark settings in Markdown" })).toBeChecked();
  await expect(page.getByRole("article", { name: "Page 1" }).getByRole("heading", { name: "Portable Report" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Page 2" }).getByRole("heading", { name: "Second page" })).toBeVisible();
  await expect(page.locator("article script")).toHaveCount(0);
  const pageOne = page.getByRole("article", { name: "Page 1" });
  await expect.poll(() => pageOne.evaluate((element) => (element as HTMLElement).style.width)).toBe("279.4mm");

  await page.reload();
  await expect(page.getByLabel("Page size")).toHaveValue("letter");
  await expect(page.getByLabel("Orientation")).toHaveValue("landscape");
  await expect(page.getByRole("checkbox", { name: "Include Docmark settings in Markdown" })).toBeChecked();
  await expect(markdownEditor(page)).toContainText(":::pagebreak");

  const saved = await downloadCurrentMarkdown(page);
  expect(saved).toContain("title: External Report Title");
  expect(saved).toContain("custom:");
  expect(saved).toContain("preserve: true");
  expect(saved).toContain("version: 1");
  expect(saved).toContain("size: Letter");
  expect(saved).toContain("orientation: landscape");
  expect(saved).toContain(":::pagebreak\n:::");
});

test("Save tracks portable settings snapshots and a duplicate gets its own file association", async ({ page }) => {
  const source = await readFile(fixturePath("portable-report.md"), "utf8");
  await page.addInitScript((markdownFile) => {
    window.__openedMarkdownFile = markdownFile;
    window.__markdownFileWrites = [];
    window.__saveAsNames = [];
    window.__saveAsWrites = {};
    let holdFirstWrite = true;
    const openHandle = {
      name: "portable-report.md",
      getFile: async () => new File([window.__openedMarkdownFile ?? ""], "portable-report.md"),
      createWritable: async () => ({
        write: async (content: string) => {
          if (holdFirstWrite) {
            holdFirstWrite = false;
            await new Promise<void>((resolveWrite) => {
              window.__releaseMarkdownWrite = resolveWrite;
            });
          }
          window.__markdownFileWrites!.push(String(content));
        },
        close: async () => undefined,
        abort: async () => undefined,
      }),
    };
    window.showOpenFilePicker = async () => [openHandle as FileSystemFileHandle];
    window.showSaveFilePicker = async (options) => {
      const filename = options?.suggestedName ?? "document.md";
      window.__saveAsNames!.push(filename);
      return {
        name: filename,
        getFile: async () => new File([window.__saveAsWrites![filename] ?? ""], filename),
        createWritable: async () => ({
          write: async (content: string) => { window.__saveAsWrites![filename] = String(content); },
          close: async () => undefined,
          abort: async () => undefined,
        }),
      } as FileSystemFileHandle;
    };
  }, source);
  await page.goto("/editor");
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Open Markdown…" }).click();

  await expect(page.getByLabel("Page size")).toHaveValue("letter");
  await expect(page.getByLabel("Orientation")).toHaveValue("landscape");
  await expect(page.getByText("File saved", { exact: true })).toBeVisible();
  await page.getByLabel("Page size").selectOption("a4");
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();

  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status", { name: "Saving file…" })).toBeVisible();
  await page.getByLabel("Orientation").selectOption("portrait");
  await page.evaluate(() => window.__releaseMarkdownWrite?.());
  await expect.poll(() => page.evaluate(() => window.__markdownFileWrites?.length)).toBe(1);
  const firstSnapshot = await page.evaluate(() => window.__markdownFileWrites?.[0] ?? "");
  expect(firstSnapshot).toContain("size: A4");
  expect(firstSnapshot).toContain("orientation: landscape");
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();

  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__markdownFileWrites?.length)).toBe(2);
  expect(await page.evaluate(() => window.__markdownFileWrites?.[1] ?? "")).toContain("orientation: portrait");
  await expect(page.getByText("File saved", { exact: true })).toBeVisible();

  const portability = page.getByRole("checkbox", { name: "Include Docmark settings in Markdown" });
  await portability.uncheck();
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__markdownFileWrites?.length)).toBe(3);
  const withoutDocmark = await page.evaluate(() => window.__markdownFileWrites?.[2] ?? "");
  expect(withoutDocmark).not.toContain("docmark:");
  expect(withoutDocmark).toContain("title: External Report Title");

  await portability.check();
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__markdownFileWrites?.length)).toBe(4);
  await activeDocumentSummary(page).click();
  await page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "portable-report Active", exact: true }) })
    .getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Include Docmark settings in Markdown" })).toBeChecked();
  await expect(page.getByLabel("Page size")).toHaveValue("a4");
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__saveAsNames?.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__saveAsNames?.[0])).toBe("portable-report-copy.md");
  const duplicateFile = await page.evaluate(() => window.__saveAsWrites?.["portable-report-copy.md"] ?? "");
  expect(duplicateFile).toContain("title: External Report Title");
  expect(duplicateFile).toContain("size: A4");
  expect(duplicateFile).toContain("orientation: portrait");
});
