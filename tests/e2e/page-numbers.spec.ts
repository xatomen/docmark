import { expect, test } from "@playwright/test";
import { markdownEditor } from "./support";

declare global {
  interface Window {
    __docmarkPrintCalls?: number;
    __printedPageNumbers?: string[];
    __numberedFileWrites?: string[];
    __releasePageNumberWrite?: () => void;
  }
}

function pageNumbers(page: import("@playwright/test").Page) {
  return page.locator("[data-page-number]");
}

test("page numbers are separate decorations and do not change pagination", async ({ page }) => {
  await page.goto("/editor");
  await page.getByText("Margins", { exact: true }).click();
  await page.getByLabel("Bottom").fill("0");
  await page.getByText("Margins", { exact: true }).click();
  const content = ["# Long document", "", ...Array.from({ length: 90 }, (_, index) =>
    `Paragraph ${index + 1}: ${"A few words keep this document flowing across physical pages. ".repeat(2)}`,
  )].join("\n\n");
  await markdownEditor(page).fill(content);
  await expect(page.getByRole("article", { name: "Page 2" })).toBeVisible();

  const physicalPageCount = await page.getByRole("article").count();
  const pageCountBefore = physicalPageCount;
  const settingsCheckbox = page.getByRole("checkbox", { name: "Show page numbers" });
  await expect(settingsCheckbox).not.toBeChecked();
  await settingsCheckbox.check();
  await expect(pageNumbers(page)).toHaveCount(pageCountBefore);
  expect(await pageNumbers(page).allTextContents()).toEqual(
    Array.from({ length: pageCountBefore }, (_, index) => String(index + 1)),
  );
  expect(await page.getByRole("article").count()).toBe(pageCountBefore);
  await expect(page.locator(".document-content [data-page-number]")).toHaveCount(0);
  await expect(page.locator(".measurement-layer [data-page-number]")).toHaveCount(0);

  const firstPage = page.getByRole("article").first();
  const number = pageNumbers(page).first();
  const positions: Record<string, { left: number; right: number; center: number }> = {};
  for (const position of ["bottom-left", "bottom-center", "bottom-right"] as const) {
    await page.getByLabel("Page number position").selectOption(position);
    positions[position] = await number.evaluate((element) => {
      const numberRect = element.getBoundingClientRect();
      const pageRect = element.closest("article")!.getBoundingClientRect();
      return {
        left: numberRect.left - pageRect.left,
        right: pageRect.right - numberRect.right,
        center: numberRect.left + numberRect.width / 2,
      };
    });
  }
  const pageBox = await firstPage.boundingBox();
  expect(pageBox).not.toBeNull();
  const tolerance = 4;
  expect(positions["bottom-left"].left).toBeLessThan(positions["bottom-center"].left);
  expect(positions["bottom-right"].left).toBeGreaterThan(positions["bottom-center"].left);
  expect(Math.abs(positions["bottom-center"].center - (pageBox!.x + pageBox!.width / 2))).toBeLessThan(tolerance);
  expect(positions["bottom-left"].left).toBeGreaterThanOrEqual(0);
  expect(positions["bottom-right"].right).toBeGreaterThanOrEqual(0);

  await page.getByLabel("Page number start at").fill("999999");
  await expect(number).toHaveText("999999");
  const numberBox = await number.boundingBox();
  const sheetBox = await firstPage.boundingBox();
  expect(numberBox).not.toBeNull();
  expect(sheetBox).not.toBeNull();
  expect(numberBox!.x).toBeGreaterThanOrEqual(sheetBox!.x);
  expect(numberBox!.x + numberBox!.width).toBeLessThanOrEqual(sheetBox!.x + sheetBox!.width + tolerance);
  expect(numberBox!.y + numberBox!.height).toBeLessThanOrEqual(sheetBox!.y + sheetBox!.height);
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();

  await settingsCheckbox.uncheck();
  await expect(pageNumbers(page)).toHaveCount(0);
  expect(await page.getByRole("article").count()).toBe(pageCountBefore);
});

test("page number line stays centered in normal margins and safely inset for small margins", async ({ page }) => {
  await page.goto("/editor");
  await markdownEditor(page).fill("# Margin geometry\n\nA short page for measuring footer placement.");
  await page.getByRole("checkbox", { name: "Show page numbers" }).check();
  const number = pageNumbers(page).first();
  await expect(number).toHaveText("1");
  const pageCount = await page.getByRole("article").count();

  for (const bottomMargin of [20, 10, 5, 2, 0]) {
    await page.getByText("Margins", { exact: true }).click();
    const marginInput = page.getByLabel("Bottom");
    await marginInput.fill(String(bottomMargin));
    await expect(marginInput).toHaveValue(String(bottomMargin));
    await page.getByText("Margins", { exact: true }).click();
    await expect.poll(() => number.evaluate((element) => {
      const decorations = element.closest(".page-decorations") as HTMLElement;
      return decorations.style.getPropertyValue("--page-margin-bottom");
    })).toBe(`${bottomMargin}mm`);

    const metrics = await number.evaluate((element) => {
      const sheet = element.closest("article") as HTMLElement;
      const pageRect = sheet.getBoundingClientRect();
      const numberRect = element.getBoundingClientRect();
      const scale = pageRect.height / sheet.offsetHeight;
      return {
        pageTop: pageRect.top,
        pageBottom: pageRect.bottom,
        numberTop: numberRect.top,
        numberBottom: numberRect.bottom,
        numberCenter: (numberRect.top + numberRect.bottom) / 2,
        scale,
        horizontalOverflow: sheet.scrollWidth > sheet.clientWidth + 1,
      };
    });
    const millimeter = (96 / 25.4) * metrics.scale;
    const actualCenterInset = metrics.pageBottom - metrics.numberCenter;
    const expectedCenterInset = Math.max(bottomMargin / 2, 5) * millimeter;
    expect(Math.abs(actualCenterInset - expectedCenterInset)).toBeLessThan(2);
    expect(metrics.numberTop).toBeGreaterThanOrEqual(metrics.pageTop);
    expect(metrics.numberBottom).toBeLessThanOrEqual(metrics.pageBottom);
    expect(metrics.pageBottom - metrics.numberBottom).toBeGreaterThanOrEqual(2.5 * millimeter);
    expect(metrics.horizontalOverflow).toBe(false);

    if (bottomMargin >= 10) {
      const contentBottom = metrics.pageBottom - bottomMargin * millimeter;
      const contentToNumber = metrics.numberCenter - contentBottom;
      const numberToPageEdge = metrics.pageBottom - metrics.numberCenter;
      expect(Math.abs(contentToNumber - numberToPageEdge)).toBeLessThan(2);
    }
    expect(await page.getByRole("article").count()).toBe(pageCount);
  }
});

test("startAt counts empty physical pages and print uses the visible page decorations", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        window.__docmarkPrintCalls = (window.__docmarkPrintCalls ?? 0) + 1;
        window.__printedPageNumbers = Array.from(
          document.querySelectorAll("[data-page-number]"),
          (element) => element.textContent ?? "",
        );
      },
    });
  });
  await page.goto("/editor");
  await markdownEditor(page).fill([
    "# First",
    "",
    ":::pagebreak",
    ":::",
    "",
    ":::pagebreak",
    ":::",
    "",
    "# Third",
  ].join("\n"));
  await expect(page.getByRole("article", { name: "Page 3" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Show page numbers" }).check();
  await page.getByLabel("Page number start at").fill("5");

  await expect(pageNumbers(page)).toHaveCount(3);
  await expect(pageNumbers(page).nth(0)).toHaveText("5");
  await expect(pageNumbers(page).nth(1)).toHaveText("6");
  await expect(pageNumbers(page).nth(2)).toHaveText("7");
  await expect(page.getByRole("article", { name: "Page 2, blank" })).toBeVisible();
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect.poll(() => page.evaluate(() => window.__docmarkPrintCalls)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__printedPageNumbers)).toEqual(["5", "6", "7"]);
});

test("portable page numbers restore from IndexedDB and Front Matter, and settings changes stay physical", async ({ page }) => {
  const source = [
    "---",
    "title: External title",
    "docmark:",
    "  version: 1",
    "  page:",
    "    size: A4",
    "  pageNumbers:",
    "    enabled: true",
    "    position: bottom-right",
    "    startAt: 5",
    "---",
    "# Portable page numbers",
    "",
    ":::pagebreak",
    ":::",
    "",
    "# Second page",
  ].join("\n");

  await page.addInitScript((markdownFile) => {
    window.__numberedFileWrites = [];
    let holdFirstWrite = true;
    const handle = {
      name: "numbered.md",
      getFile: async () => new File([markdownFile], "numbered.md"),
      createWritable: async () => ({
        write: async (content: string) => {
          if (holdFirstWrite) {
            holdFirstWrite = false;
            await new Promise<void>((resolveWrite) => {
              window.__releasePageNumberWrite = resolveWrite;
            });
          }
          window.__numberedFileWrites!.push(String(content));
        },
        close: async () => undefined,
        abort: async () => undefined,
      }),
    };
    window.showOpenFilePicker = async () => [handle as FileSystemFileHandle];
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        window.__docmarkPrintCalls = (window.__docmarkPrintCalls ?? 0) + 1;
        window.__printedPageNumbers = Array.from(
          document.querySelectorAll("[data-page-number]"),
          (element) => element.textContent ?? "",
        );
      },
    });
  }, source);
  await page.goto("/editor");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open Markdown…", exact: true }).click();

  await expect(page.getByLabel("Show page numbers")).toBeChecked();
  await expect(page.getByLabel("Page number position")).toHaveValue("bottom-right");
  await expect(page.getByLabel("Page number start at")).toHaveValue("5");
  await expect(pageNumbers(page)).toHaveText(["5", "6"]);

  await page.getByLabel("Page number position").selectOption("bottom-left");
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();
  await page.getByLabel("Page size").selectOption("letter");
  await page.getByLabel("Orientation").selectOption("landscape");
  await expect.poll(() => page.getByRole("article").first().evaluate((element) =>
    (element as HTMLElement).style.width,
  )).toBe("279.4mm");
  await expect(pageNumbers(page)).toHaveText(["5", "6"]);
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect.poll(() => page.evaluate(() => window.__printedPageNumbers)).toEqual(["5", "6"]);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saving file…" })).toBeVisible();
  await page.getByLabel("Page number start at").fill("9");
  await page.evaluate(() => window.__releasePageNumberWrite?.());
  await expect.poll(() => page.evaluate(() => window.__numberedFileWrites?.length)).toBe(1);
  const saved = await page.evaluate(() => window.__numberedFileWrites?.[0] ?? "");
  expect(saved).toContain("title: External title");
  expect(saved).toContain("position: bottom-left");
  expect(saved).toContain("startAt: 5");
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__numberedFileWrites?.length)).toBe(2);
  expect(await page.evaluate(() => window.__numberedFileWrites?.[1] ?? "")).toContain("startAt: 9");
  await expect(page.getByText("File saved", { exact: true })).toBeVisible();

  await page.getByRole("checkbox", { name: "Include Docmark settings in Markdown" }).uncheck();
  await expect(page.getByText("File modified", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__numberedFileWrites?.length)).toBe(3);
  expect(await page.evaluate(() => window.__numberedFileWrites?.[2] ?? "")).not.toContain("docmark:");
  await expect(page.getByText("File saved", { exact: true })).toBeVisible();

  await page.getByLabel("Page number position").selectOption("bottom-right");
  await expect(page.getByText("File saved", { exact: true })).toBeVisible();
  await expect(pageNumbers(page).first()).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Show page numbers")).toBeChecked();
  await expect(page.getByLabel("Page number position")).toHaveValue("bottom-right");
  await expect(page.getByLabel("Page number start at")).toHaveValue("9");
  await expect(page.getByLabel("Page size")).toHaveValue("letter");
  await expect(page.getByLabel("Orientation")).toHaveValue("landscape");
  await expect(pageNumbers(page)).toHaveText(["9", "10"]);
});
