import { expect, test } from "@playwright/test";
import { markdownEditor } from "./support";

test("desktop keeps the split workspace without the narrow view switcher", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/editor");

  await expect(markdownEditor(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Workspace view" })).toBeHidden();
});

test("narrow workspace switches views without resetting editor history or preview state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor");

  const editor = markdownEditor(page);
  const previewHeading = page.getByRole("heading", { name: "Preview" });
  const viewSwitcher = page.getByRole("radiogroup", { name: "Workspace view" });
  const markdownView = viewSwitcher.getByRole("radio", { name: "Markdown", exact: true });
  const previewView = viewSwitcher.getByRole("radio", { name: "Preview", exact: true });

  await expect(markdownView).toBeChecked();
  await expect(editor).toBeVisible();
  await expect(previewHeading).toBeHidden();
  await editor.fill("# First page\n\n:::pagebreak\n:::\n\n# Second page\n\nContent stays mounted.");
  await editor.press("End");
  await page.keyboard.type(" undo marker");
  await expect(editor).toContainText("undo marker");
  await expect(page.locator(".physical-page")).toHaveCount(2);

  await previewView.click();
  await expect(previewHeading).toBeVisible();
  const zoomControls = page.getByRole("group", { name: "Preview zoom controls" });
  await zoomControls.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("group", { name: "Page 2 of 2" })).toBeVisible();
  let previousScrollTop = -1;
  await expect.poll(async () => {
    const currentScrollTop = await page.locator(".preview-canvas").evaluate((viewport) => viewport.scrollTop);
    const isSettled = currentScrollTop === previousScrollTop;
    previousScrollTop = currentScrollTop;
    return isSettled;
  }).toBe(true);

  await markdownView.click();
  await expect(editor).toContainText("Content stays mounted.");
  await previewView.click();
  await expect(page.getByRole("group", { name: "Page 2 of 2" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("article")).toHaveCount(2);

  await markdownView.click();
  await editor.press("Control+z");
  await expect(editor).not.toContainText("undo marker");
});

test("tablet layout and runtime resizing keep the selected workspace view", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/editor");

  const viewSwitcher = page.getByRole("radiogroup", { name: "Workspace view" });
  const markdownView = viewSwitcher.getByRole("radio", { name: "Markdown", exact: true });
  const previewView = viewSwitcher.getByRole("radio", { name: "Preview", exact: true });
  await expect(viewSwitcher).toBeVisible();
  await expect(markdownView).toBeChecked();
  await previewView.click();
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(viewSwitcher).toBeHidden();
  await expect(markdownEditor(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();

  await page.setViewportSize({ width: 600, height: 800 });
  await expect(viewSwitcher).toBeVisible();
  await expect(previewView).toBeChecked();
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  await expect.poll(() => page.locator(".app-header").evaluate((header) => header.scrollWidth <= header.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(viewSwitcher).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit" })).toBeVisible();
});

test("narrow header actions, Settings drawer, and browser print remain available", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => document.documentElement.setAttribute("data-print-requested", "true"),
    });
  });
  await page.goto("/editor");

  await expect(page.getByRole("button", { name: /^Active document:/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "File", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Document settings" })).toBeVisible();
  const exportButton = page.getByRole("button", { name: "Export PDF" });
  await expect(exportButton).toBeVisible();
  await expect(exportButton).toBeEnabled();

  await page.getByRole("button", { name: /^Active document:/ }).click();
  const documentList = page.getByRole("dialog", { name: "Documents" });
  await expect(documentList).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Open Markdown…", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Document settings" }).click();
  const drawer = page.locator('[data-slot="drawer-dialog"]');
  await expect(drawer).toBeVisible();
  await expect.poll(() => drawer.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return Math.abs(bounds.right - window.innerWidth) <= 1 && bounds.width >= window.innerWidth - 1;
  })).toBe(true);
  await page.locator('[data-slot="drawer-close-trigger"]').click();
  await expect(drawer).toBeHidden();

  await exportButton.click();
  await expect(page.locator("html")).toHaveAttribute("data-print-requested", "true");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("article").first()).toBeVisible();
  await expect.poll(() => page.locator(".preview-panel").evaluate((element) => getComputedStyle(element).visibility)).toBe("visible");
  await expect.poll(() => page.locator(".editor-panel").evaluate((element) => getComputedStyle(element).display)).toBe("none");
});
