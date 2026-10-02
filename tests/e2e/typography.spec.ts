import { expect, test } from "@playwright/test";
import { markdownEditor } from "./support";

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
  await page.getByLabel("Show page numbers").check();

  await page.getByLabel("Font family").selectOption("Georgia");
  await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Georgia");
  await expect.poll(() => page.locator(".page-decorations").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Georgia");
  await page.getByLabel("Base font size").selectOption("16");
  await page.getByLabel("Line height").selectOption("2");
  await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).fontSize)).toBe("21.3333px");
  await expect.poll(() => measuredParagraph.evaluate((element) => getComputedStyle(element).fontSize)).toBe("21.3333px");
  await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).lineHeight)).toBe("42.6667px");
  await expect.poll(async () => page.getByRole("article").count()).toBeGreaterThan(initialPageCount);

  for (const alignment of ["left", "center", "right", "justify"] as const) {
    await page.getByLabel("Text alignment").selectOption(alignment);
    await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).textAlign)).toBe(alignment);
    await expect.poll(() => measuredParagraph.evaluate((element) => getComputedStyle(element).textAlign)).toBe(alignment);
    expect(await page.locator(".physical-page .document-content h1").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
    expect(await page.locator(".physical-page .document-content ul").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
    expect(await page.locator(".physical-page .document-content td").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
    expect(await page.locator(".physical-page .document-content pre").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
  }

  await page.getByLabel("Show header").check();
  await page.getByLabel("Header text").fill("Report header");
  await page.getByLabel("Header alignment").selectOption("left");
  await page.getByLabel("Show footer").check();
  await page.getByLabel("Footer text").fill("Internal");
  await page.getByLabel("Footer alignment").selectOption("center");
  await page.getByLabel("Page number position").selectOption("bottom-right");
  await page.getByLabel("Text alignment").selectOption("justify");
  expect(await page.locator("[data-page-decoration=header]").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
  expect(await page.locator("[data-page-decoration=footer]").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("center");
  expect(await page.locator("[data-page-number]").first().evaluate((element) => getComputedStyle(element).fontSize)).toBe("12px");
  await expect(page.locator("[data-page-decoration=header]")).toHaveCount(await page.getByRole("article").count());

  await page.getByLabel("Font family").selectOption("Arial");
  await page.getByLabel("Font family").selectOption("Courier New");
  await page.getByLabel("Font family").selectOption("Times New Roman");
  await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Times New Roman");
  await expect.poll(() => page.locator(".physical-page .document-content pre").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("monospace");
  await page.getByLabel("Page size").selectOption("letter");
  await page.getByLabel("Orientation").selectOption("landscape");
  await expect.poll(() => page.locator(".physical-page").first().evaluate((element) => (element as HTMLElement).style.width)).toBe("279.4mm");
  expect(await page.locator(".physical-page").first().evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect.poll(() => page.evaluate(() => window.__printedTypography?.fontFamily)).toContain("Times New Roman");
  expect(await page.evaluate(() => window.__printedTypography)).toMatchObject({ fontSize: "21.3333px", lineHeight: "42.6667px", alignment: "justify" });
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Font family")).toHaveValue("Times New Roman");
  await expect(page.getByLabel("Base font size")).toHaveValue("16");
  await expect(page.getByLabel("Line height")).toHaveValue("2");
  await expect(page.getByLabel("Text alignment")).toHaveValue("justify");

  await page.getByLabel("Active document: Untitled document. Open document list").click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByLabel("Font family")).toHaveValue("Times New Roman");
  await expect(page.getByLabel("Base font size")).toHaveValue("16");
  await expect(page.getByLabel("Line height")).toHaveValue("2");
  await expect(page.getByLabel("Text alignment")).toHaveValue("justify");
});

test("portable typography saves with snapshot semantics and stays file-clean when portability is off", async ({ page }) => {
  const source = [
    "---", "docmark:", "  version: 1", "  typography:", "    fontFamily: Georgia",
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
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Open Markdown…" }).click();
  await expect(page.getByLabel("Font family")).toHaveValue("Georgia");
  await expect(page.getByLabel("Base font size")).toHaveValue("12");
  await expect(page.getByLabel("Line height")).toHaveValue("1.6");
  await expect(page.getByLabel("Text alignment")).toHaveValue("center");
  await page.getByLabel("Base font size").selectOption("14");
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status", { name: "Saving file…" })).toBeVisible();
  await page.getByLabel("Text alignment").selectOption("justify");
  await page.evaluate(() => window.__releaseTypographyWrite?.());
  await expect.poll(() => page.evaluate(() => window.__typographyWrites?.length)).toBe(1);
  expect(await page.evaluate(() => window.__typographyWrites?.[0] ?? "")).toContain("fontSize: 14");
  expect(await page.evaluate(() => window.__typographyWrites?.[0] ?? "")).toContain("alignment: center");
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();

  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__typographyWrites?.length)).toBe(2);
  expect(await page.evaluate(() => window.__typographyWrites?.[1] ?? "")).toContain("alignment: justify");
  await page.getByLabel("Include Docmark settings in Markdown").uncheck();
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__typographyWrites?.length)).toBe(3);
  expect(await page.evaluate(() => window.__typographyWrites?.[2] ?? "")).not.toContain("typography:");
  await expect(page.getByText("File saved", { exact: true })).toBeVisible();
  await page.getByLabel("Base font size").selectOption("16");
  await expect(page.getByText("File saved", { exact: true })).toBeVisible();
});
