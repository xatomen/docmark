import {
  expect,
  test } from "@playwright/test";
import { markdownEditor,
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
    __typographyWrites?: string[];
    __releaseTypographyWrite?: () => void;
    __printedTypography?: { fontFamily: string; fontSize: string; lineHeight: string; alignment: string; pageCount: number };
  }
}

test("document typography is shared by measurement and pages, controls paragraph layout, and repaginates", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        const paragraph = document.querySelector(".physical-page .document-content p");
        const style = paragraph ? getComputedStyle(paragraph) : null;
        window.__printedTypography = {
          fontFamily: style?.fontFamily ?? "",
          fontSize: style?.fontSize ?? "",
          lineHeight: style?.lineHeight ?? "",
          alignment: style?.textAlign ?? "",
          pageCount: document.querySelectorAll(".physical-page").length,
        };
      },
    });
  });
  await page.goto("/editor");
  const content = [
    "# Typography report",
    Array.from({ length: 130 }, (_, index) => `Paragraph ${index + 1}: ${"Measured document prose wraps with the selected font and line height. ".repeat(2)}`).join("\n\n"),
    "- First list item\n- Second list item",
    "| Name | Value |\n| --- | ---: |\n| Alpha | 12 |",
    "```ts\nconst fixedWidth = true;\n```",
    `Unbroken token ${"digest".repeat(120)}`,
  ].join("\n\n");
  await markdownEditor(page).fill(content);
  await expect(page.locator(".document-content p").first()).toBeVisible();
  const initialPageCount = await page.getByRole("article").count();
  const paragraph = page.locator(".physical-page .document-content p").first();
  const measuredParagraph = page.locator(".measurement-layer .document-theme p").first();
  await setSwitch(page, "Show page numbers", true);

  await selectSettingOption(page, "Font family", "Georgia");
  await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Georgia");
  await expect.poll(() => page.locator(".page-decorations").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Georgia");
  await selectSettingOption(page, "Base font size", "16");
  await selectSettingOption(page, "Line height", "2");
  await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).fontSize)).toBe("21.3333px");
  await expect.poll(() => measuredParagraph.evaluate((element) => getComputedStyle(element).fontSize)).toBe("21.3333px");
  await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).lineHeight)).toBe("42.6667px");
  await expect.poll(async () => page.getByRole("article").count()).toBeGreaterThan(initialPageCount);

  for (const alignment of ["left", "center", "right", "justify"] as const) {
    await selectSettingOption(page, "Text alignment", alignment);
    await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).textAlign)).toBe(alignment);
    await expect.poll(() => measuredParagraph.evaluate((element) => getComputedStyle(element).textAlign)).toBe(alignment);
    expect(await page.locator(".physical-page .document-content h1").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
    expect(await page.locator(".physical-page .document-content ul").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
    expect(await page.locator(".physical-page .document-content td").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
    expect(await page.locator(".physical-page .document-content pre").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
  }

  await setSwitch(page, "Show header", true);
  await openDocumentSettings(page, "Header & Footer");
  await page.getByLabel("Header text").fill("Report header");
  await selectSettingOption(page, "Header alignment", "left");
  await setSwitch(page, "Show footer", true);
  await openDocumentSettings(page, "Header & Footer");
  await page.getByLabel("Footer text").fill("Internal");
  await selectSettingOption(page, "Footer alignment", "center");
  await selectSettingOption(page, "Page number position", "bottom-right");
  await selectSettingOption(page, "Text alignment", "justify");
  expect(await page.locator("[data-page-decoration=header]").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
  expect(await page.locator("[data-page-decoration=footer]").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("center");
  expect(await page.locator("[data-page-number]").first().evaluate((element) => getComputedStyle(element).fontSize)).toBe("12px");
  await expect(page.locator("[data-page-decoration=header]")).toHaveCount(await page.getByRole("article").count());

  await selectSettingOption(page, "Font family", "Arial");
  await selectSettingOption(page, "Font family", "Courier New");
  await selectSettingOption(page, "Font family", "Times New Roman");
  await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Times New Roman");
  await expect.poll(() => page.locator(".physical-page .document-content pre").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("monospace");
  await selectSettingOption(page, "Page size", "letter");
  await selectSettingOption(page, "Orientation", "landscape");
  await expect.poll(() => page.locator(".physical-page").first().evaluate((element) => (element as HTMLElement).style.width)).toBe("279.4mm");
  expect(await page.locator(".physical-page").first().evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  await closeDocumentSettings(page);
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect.poll(() => page.evaluate(() => window.__printedTypography?.fontFamily)).toContain("Times New Roman");
  expect(await page.evaluate(() => window.__printedTypography)).toMatchObject({ fontSize: "21.3333px", lineHeight: "42.6667px", alignment: "justify" });
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.reload();
  await expectSettingSelection(page, "Font family", "Times New Roman");
  await expectSettingSelection(page, "Base font size", "16 pt");
  await expectSettingSelection(page, "Line height", "2");
  await expectSettingSelection(page, "Text alignment", "Justify");

  await closeDocumentSettings(page);
  await page.getByLabel("Active document: Untitled document. Open document list").click();
  await page.getByRole("button", { name: /^Actions for / }).first().click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expectSettingSelection(page, "Font family", "Times New Roman");
  await expectSettingSelection(page, "Base font size", "16 pt");
  await expectSettingSelection(page, "Line height", "2");
  await expectSettingSelection(page, "Text alignment", "Justify");
});

test("portable typography saves with snapshot semantics and stays file-clean when portability is off", async ({ page }) => {
  const source = [
    "---", "docmark:", "  version: 1", "  typography:", "    fontFamily: Montserrat",
    "    fontSize: 12", "    lineHeight: 1.6", "    alignment: center", "---", "# Portable typography",
  ].join("\n");
  await page.addInitScript((markdownFile) => {
    window.__typographyWrites = [];
    let holdFirstWrite = true;
    const handle = {
      name: "typography.md",
      getFile: async () => new File([markdownFile], "typography.md"),
      createWritable: async () => ({
        write: async (contents: string) => {
          if (holdFirstWrite) {
            holdFirstWrite = false;
            await new Promise<void>((resolveWrite) => { window.__releaseTypographyWrite = resolveWrite; });
          }
          window.__typographyWrites!.push(String(contents));
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
  await expectSettingSelection(page, "Font family", "Montserrat");
  await expectSettingSelection(page, "Base font size", "12 pt");
  await expectSettingSelection(page, "Line height", "1.6");
  await expectSettingSelection(page, "Text alignment", "Center");
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  await expect.poll(() => page.locator(".physical-page .document-content h1").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Montserrat");
  await selectSettingOption(page, "Base font size", "14");
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();
  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saving file…" })).toBeVisible();
  await selectSettingOption(page, "Text alignment", "justify");
  await page.evaluate(() => window.__releaseTypographyWrite?.());
  await expect.poll(() => page.evaluate(() => window.__typographyWrites?.length)).toBe(1);
  expect(await page.evaluate(() => window.__typographyWrites?.[0] ?? "")).toContain("fontFamily: Montserrat");
  expect(await page.evaluate(() => window.__typographyWrites?.[0] ?? "")).toContain("fontSize: 14");
  expect(await page.evaluate(() => window.__typographyWrites?.[0] ?? "")).toContain("alignment: center");
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();

  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__typographyWrites?.length)).toBe(2);
  expect(await page.evaluate(() => window.__typographyWrites?.[1] ?? "")).toContain("alignment: justify");
  await openDocumentSettings(page, "Markdown metadata");
  await setCheckbox(page, "Include Docmark settings in Markdown", false);
  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__typographyWrites?.length)).toBe(3);
  expect(await page.evaluate(() => window.__typographyWrites?.[2] ?? "")).not.toContain("typography:");
  await expect(page.getByText("File saved", { exact: true })).toBeVisible();
  await selectSettingOption(page, "Base font size", "16");
  await expect(page.getByText("File saved", { exact: true })).toBeVisible();
});
