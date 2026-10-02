import { expect, test } from "@playwright/test";
import { markdownEditor } from "./support";

declare global {
  interface Window {
    __docmarkInjected?: boolean;
    __decorationsAtPrint?: string[];
  }
}

test("headers, footers, collisions, and literal text stay on physical pages without repagination", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        window.__decorationsAtPrint = Array.from(document.querySelectorAll("[data-page-decoration], [data-page-number]"), (node) => node.textContent ?? "");
      },
    });
  });
  await page.goto("/editor");
  const editor = markdownEditor(page);
  await editor.fill(["# Multi-page report", "", ...Array.from({ length: 80 }, (_, i) => `Paragraph ${i + 1}: ${"content fills pages without decoration affecting measurement. ".repeat(2)}`)].join("\n\n"));
  await expect(page.getByRole("article", { name: "Page 2" })).toBeVisible();
  const count = await page.getByRole("article").count();
  await page.getByLabel("Show header").check();
  await page.getByLabel("Header text").fill("<script>window.__docmarkInjected = true</script>");
  await page.getByLabel("Header alignment").selectOption("center");
  await page.getByLabel("Show footer").check();
  await page.getByLabel("Footer text").fill("Internal use only");
  await page.getByLabel("Footer alignment").selectOption("left");
  await page.getByLabel("Show page numbers").check();
  await expect(page.locator("[data-page-decoration=header]")).toHaveCount(count);
  await expect(page.locator("[data-page-decoration=footer]")).toHaveCount(count);
  await expect(page.locator("[data-page-number]")).toHaveCount(count);
  await expect(page.locator("[data-page-decoration=header]").first()).toHaveText("<script>window.__docmarkInjected = true</script>");
  expect(await page.evaluate(() => window.__docmarkInjected)).toBeUndefined();
  expect(await page.getByRole("article").count()).toBe(count);
  await expect.poll(() => page.locator(".page-decoration-text-center").first().evaluate((el) => {
    const text = el.getBoundingClientRect();
    const sheet = el.closest("article")!.getBoundingClientRect();
    return Math.abs((text.left + text.right) / 2 - (sheet.left + sheet.right) / 2);
  })).toBeLessThan(4);

  await page.getByLabel("Footer text").fill(`Confidential-${"x".repeat(300)}`);
  const longTextBounds = await page.locator("[data-page-decoration=footer]").first().evaluate((el) => {
    const text = el.getBoundingClientRect();
    const sheet = el.closest("article") as HTMLElement;
    return { left: text.left, right: text.right, pageLeft: sheet.getBoundingClientRect().left, pageRight: sheet.getBoundingClientRect().right, horizontalOverflow: sheet.scrollWidth > sheet.clientWidth + 1 };
  });
  expect(longTextBounds.left).toBeGreaterThanOrEqual(longTextBounds.pageLeft);
  expect(longTextBounds.right).toBeLessThanOrEqual(longTextBounds.pageRight);
  expect(longTextBounds.horizontalOverflow).toBe(false);
  expect(await page.getByRole("article").count()).toBe(count);
  await page.getByLabel("Footer text").fill("Internal use only");

  const footer = page.locator("[data-page-decoration=footer]").first();
  await page.getByLabel("Footer alignment").selectOption("right");
  await page.getByLabel("Page number position").selectOption("bottom-right");
  const collisionRects = await page.evaluate(() => {
    const text = document.querySelector("[data-page-decoration=footer]")!.getBoundingClientRect();
    const number = document.querySelector("[data-page-number]")!.getBoundingClientRect();
    return { text: { top: text.top, bottom: text.bottom, left: text.left, right: text.right }, number: { top: number.top, bottom: number.bottom, left: number.left, right: number.right }, page: document.querySelector("article")!.getBoundingClientRect().toJSON() };
  });
  expect(collisionRects.text.bottom).toBeLessThanOrEqual(collisionRects.number.top + 1);
  expect(collisionRects.text.left).toBeGreaterThanOrEqual(collisionRects.page.x);
  expect(collisionRects.text.right).toBeLessThanOrEqual(collisionRects.page.x + collisionRects.page.width);
  expect(footer).toBeVisible();

  await page.getByLabel("Footer alignment").selectOption("center");
  await page.getByLabel("Page number position").selectOption("bottom-center");
  const centerCollision = await page.evaluate(() => {
    const text = document.querySelector("[data-page-decoration=footer]")!.getBoundingClientRect();
    const number = document.querySelector("[data-page-number]")!.getBoundingClientRect();
    return { textBottom: text.bottom, numberTop: number.top };
  });
  expect(centerCollision.textBottom).toBeLessThanOrEqual(centerCollision.numberTop + 1);

  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect.poll(() => page.evaluate(() => window.__decorationsAtPrint?.length)).toBe(count * 3);
  await expect.poll(() => page.locator("[data-page-decoration=header]").first().evaluate((el) => getComputedStyle(el.closest(".page-decorations")!).display)).not.toBe("none");

  await page.getByLabel("Show header").uncheck();
  await expect(page.getByLabel("Header text")).toBeDisabled();
  await page.getByLabel("Show header").check();
  await expect(page.getByLabel("Header text")).toHaveValue("<script>window.__docmarkInjected = true</script>");
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Header alignment")).toHaveValue("center");
  await expect(page.getByLabel("Footer alignment")).toHaveValue("center");
  await expect(page.locator("[data-page-decoration=header]")).toHaveCount(count);
});

test("header safe area tracks small top margins without changing the physical page count", async ({ page }) => {
  await page.goto("/editor");
  await page.getByLabel("Show header").check();
  await page.getByLabel("Header text").fill("Architecture Report");
  const count = await page.getByRole("article").count();
  for (const margin of [20, 10, 5, 2, 0]) {
    await page.getByText("Margins", { exact: true }).click();
    const input = page.getByLabel("Top");
    await input.fill(String(margin));
    await page.getByText("Margins", { exact: true }).click();
    const metrics = await page.locator("[data-page-decoration=header]").first().evaluate((el) => {
      const zone = el.closest(".page-decoration-area") as HTMLElement;
      const sheet = el.closest("article") as HTMLElement;
      const zoneRect = zone.getBoundingClientRect();
      const textRect = el.getBoundingClientRect();
      const sheetRect = sheet.getBoundingClientRect();
      return { center: (textRect.top + textRect.bottom) / 2 - sheetRect.top, height: zoneRect.height, pageHeight: sheetRect.height, scale: sheetRect.height / sheet.offsetHeight };
    });
    const mm = 96 / 25.4 * metrics.scale;
    expect(Math.abs(metrics.center - Math.max(margin / 2, 5) * mm)).toBeLessThan(3);
    expect(metrics.height).toBeLessThan(metrics.pageHeight);
    expect(await page.getByRole("article").count()).toBe(count);
  }
});

test("decorations render on blank physical pages created by manual breaks", async ({ page }) => {
  await page.goto("/editor");
  await markdownEditor(page).fill(["# First", "", ":::pagebreak", ":::", "", ":::pagebreak", ":::", "", "# Third"].join("\n"));
  await expect(page.getByRole("article", { name: "Page 2, blank" })).toBeVisible();
  await page.getByLabel("Show header").check();
  await page.getByLabel("Header text").fill("Every page");
  await page.getByLabel("Show footer").check();
  await page.getByLabel("Footer text").fill("Internal");
  await page.getByLabel("Show page numbers").check();
  const blankPage = page.getByRole("article", { name: "Page 2, blank" });
  await expect(blankPage.locator("[data-page-decoration=header]")).toHaveText("Every page");
  await expect(blankPage.locator("[data-page-decoration=footer]")).toHaveText("Internal");
  await expect(blankPage.locator("[data-page-number]")).toHaveText("2");
});
