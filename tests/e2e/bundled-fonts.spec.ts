import { expect, test } from "@playwright/test";
import { markdownEditor } from "./support";

declare global {
  interface Window {
    __fontLoadingStarted?: boolean;
    __releaseFontLoading?: () => void;
    __printedFontFamily?: string;
  }
}

test("Montserrat is local, ready before pagination, shared with preview/print, and keeps code monospace", async ({ page }) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") fontRequests.push(request.url());
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        const paragraph = document.querySelector(".physical-page .document-content p");
        window.__printedFontFamily = paragraph ? getComputedStyle(paragraph).fontFamily : "";
      },
    });
  });
  await page.goto("/editor");
  await markdownEditor(page).fill([
    "A paragraph rendered with Montserrat.",
    Array.from({ length: 45 }, (_, index) => `Paragraph ${index + 1}: Local fonts are measured before pagination. ${"The selected typeface wraps physical document content consistently. ".repeat(2)}`).join("\n\n"),
    `Long token ${"docmark".repeat(70)} and URL https://example.invalid/${"segment".repeat(30)}`,
    `\`\`\`ts\nconst longCodeLine = "${"wrap-safe-code-".repeat(40)}";\n\`\`\``,
    "| Name | Alpha | Beta | Gamma | Delta | Epsilon | Zeta |\n| --- | --- | --- | --- | --- | --- | --- |\n| Long row | one | two | three | four | five | six |",
  ].join("\n\n"));
  await page.getByLabel("Show header").check();
  await page.getByLabel("Header text").fill("Montserrat report");
  await page.getByLabel("Show footer").check();
  await page.getByLabel("Footer text").fill("Local font");
  await page.getByLabel("Show page numbers").check();
  await page.getByLabel("Font family").selectOption("Montserrat");

  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  const paragraph = page.locator(".physical-page .document-content p").first();
  const measurement = page.locator(".measurement-layer .document-theme p").first();
  await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Montserrat");
  expect(await measurement.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Montserrat");
  expect(await page.locator(".page-decorations").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Montserrat");
  await expect.poll(() => page.getByRole("article").count()).toBeGreaterThan(1);
  await expect(page.locator(".physical-page .document-content th")).toHaveCount(7);
  expect(await page.locator(".physical-page .document-content pre").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("monospace");
  expect(await page.locator(".physical-page").first().evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const fontState = await page.evaluate(() => ({
    regular: document.fonts.check('400 11pt "Montserrat"'),
    semibold: document.fonts.check('600 11pt "Montserrat"'),
    bold: document.fonts.check('700 11pt "Montserrat"'),
    faces: Array.from(document.fonts).filter((face) => face.family === "Montserrat").map((face) => face.status),
  }));
  expect(fontState).toMatchObject({ regular: true, semibold: true, bold: true, faces: ["loaded", "loaded", "loaded"] });
  expect(fontRequests.length).toBeGreaterThan(0);
  expect(fontRequests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(fontRequests.every((url) => url.includes("/fonts/montserrat/") && url.endsWith(".woff2"))).toBe(true);

  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect.poll(() => page.evaluate(() => window.__printedFontFamily)).toContain("Montserrat");

  await page.getByLabel("Page size").selectOption("a4");
  await page.getByLabel("Orientation").selectOption("portrait");
  await expect.poll(() => page.locator(".physical-page").first().evaluate((element) => (element as HTMLElement).style.width)).toBe("210mm");
  await page.getByLabel("Page size").selectOption("letter");
  await page.getByLabel("Orientation").selectOption("landscape");
  await expect.poll(() => page.locator(".physical-page").first().evaluate((element) => (element as HTMLElement).style.width)).toBe("279.4mm");
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  expect(await page.locator(".physical-page").first().evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});

test("a failed bundled font load falls back to Arial and still enables print", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document.fonts, "load", {
      configurable: true,
      value: async () => { throw new Error("simulated font load failure"); },
    });
  });
  await page.goto("/editor");
  await markdownEditor(page).fill("Fallback stays measurable.");
  await page.getByLabel("Font family").selectOption("Montserrat");
  await expect(page.getByRole("status").filter({ hasText: "Montserrat could not be loaded" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  await expect.poll(() => page.locator(".physical-page .document-content p").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Arial");
  await expect.poll(() => page.locator(".measurement-layer p").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Arial");
});

test("Montserrat survives IndexedDB reload and document duplication", async ({ page }) => {
  await page.goto("/editor");
  await markdownEditor(page).fill("Persistent bundled font.");
  await page.getByLabel("Font family").selectOption("Montserrat");
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Font family")).toHaveValue("Montserrat");
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  await expect.poll(() => page.locator(".physical-page .document-content p").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Montserrat");

  await page.getByLabel("Active document: Untitled document. Open document list").click();
  await page.getByRole("button", { name: /^Actions for / }).first().click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(page.getByLabel("Font family")).toHaveValue("Montserrat");
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  await expect.poll(() => page.locator(".physical-page .document-content p").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Montserrat");
});

test("a late Montserrat load cannot overwrite a later system font selection", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__fontLoadingStarted", { configurable: true, writable: true, value: false });
    const pending: Array<() => void> = [];
    Object.defineProperty(document.fonts, "load", {
      configurable: true,
      value: async (descriptor: string) => {
        if (!descriptor.includes('"Montserrat"')) return [];
        window.__fontLoadingStarted = true;
        return new Promise((resolve) => {
          pending.push(() => resolve([{ family: "Montserrat", status: "loaded" } as FontFace]));
          window.__releaseFontLoading = () => pending.splice(0).forEach((release) => release());
        });
      },
    });
    Object.defineProperty(document.fonts, "check", { configurable: true, value: () => true });
  });
  await page.goto("/editor");
  await markdownEditor(page).fill("Latest selection wins.");
  await page.getByLabel("Font family").selectOption("Montserrat");
  await expect.poll(() => page.evaluate(() => window.__fontLoadingStarted)).toBe(true);
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeDisabled();
  await page.getByLabel("Font family").selectOption("Georgia");
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  await page.evaluate(() => window.__releaseFontLoading?.());
  await expect.poll(() => page.locator(".physical-page .document-content p").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Georgia");
  expect(await page.getByLabel("Font family").inputValue()).toBe("Georgia");
});
