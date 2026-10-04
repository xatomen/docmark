import { expect, test } from "@playwright/test";
import { closeDocumentSettings, markdownEditor, setSwitch } from "./support";

test("viewer navigation follows physical pages, including the cover and manual scrolling", async ({ page }) => {
  await page.goto("/editor");
  await markdownEditor(page).fill([
    "# First content page",
    "",
    ":::pagebreak",
    ":::",
    "",
    "# Second content page",
    "",
    ":::pagebreak",
    ":::",
    "",
    "# Third content page",
  ].join("\n"));
  await setSwitch(page, "Enable cover page", true);
  await closeDocumentSettings(page);

  await expect(page.getByRole("heading", { name: "Preview", exact: true })).toHaveCount(1);
  const navigation = page.getByRole("group", { name: "Page 1 of 4" });
  await expect(page.getByRole("article")).toHaveCount(4);
  await expect(navigation.getByRole("button", { name: "Previous page" })).toBeDisabled();
  await expect(navigation.getByRole("button", { name: "Next page" })).toBeEnabled();
  await expect(page.getByRole("article", { name: "Page 1" })).toHaveAttribute("data-page-kind", "cover");

  await navigation.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("group", { name: "Page 2 of 4" })).toBeVisible();
  await page.getByRole("group", { name: "Page 2 of 4" }).getByRole("button", { name: "Previous page" }).click();
  await expect(page.getByRole("group", { name: "Page 1 of 4" })).toBeVisible();

  for (const pageNumber of [2, 3, 4]) {
    await page.getByRole("group", { name: `Page ${pageNumber - 1} of 4` }).getByRole("button", { name: "Next page" }).click();
    await expect(page.getByRole("group", { name: `Page ${pageNumber} of 4` })).toBeVisible();
  }
  const lastNavigation = page.getByRole("group", { name: "Page 4 of 4" });
  await expect(lastNavigation.getByRole("button", { name: "Next page" })).toBeDisabled();

  await page.locator(".preview-canvas").evaluate((viewport, target) => {
    const pageBounds = target.getBoundingClientRect();
    const viewportBounds = viewport.getBoundingClientRect();
    const styles = window.getComputedStyle(viewport);
    viewport.scrollTop += pageBounds.top - viewportBounds.top - viewport.clientTop - Number.parseFloat(styles.paddingTop);
  }, await page.getByRole("article", { name: "Page 2" }).elementHandle());
  await expect(page.getByRole("group", { name: "Page 2 of 4" })).toBeVisible();
});

test("zoom stays in the viewer, Fit responds to resize, and print keeps physical page dimensions", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/editor");
  await markdownEditor(page).fill("# First page\n\n:::pagebreak\n:::\n\n# Second page");
  await page.getByRole("radiogroup", { name: "Workspace view" })
    .getByRole("radio", { name: "Preview", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(2);

  const zoomControls = page.getByRole("group", { name: "Preview zoom controls" });
  const zoomValue = zoomControls.locator('span[aria-hidden="true"]');
  const initialZoom = Number((await zoomValue.innerText()).replace("%", ""));
  const physicalWidth = await page.locator(".physical-page").first().evaluate((element) => getComputedStyle(element).width);
  await expect(page.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "true");

  await zoomControls.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => Number((await zoomValue.innerText()).replace("%", ""))).toBeGreaterThan(initialZoom);
  const zoomedValue = Number((await zoomValue.innerText()).replace("%", ""));
  await zoomControls.getByRole("button", { name: "Zoom out" }).click();
  await expect.poll(async () => Number((await zoomValue.innerText()).replace("%", ""))).toBeLessThan(zoomedValue);
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page.locator(".physical-page").first()).toHaveCSS("width", physicalWidth);

  await page.getByRole("button", { name: "Fit" }).click();
  await expect(page.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "true");
  const narrowFit = Number((await zoomValue.innerText()).replace("%", ""));
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => Number((await zoomValue.innerText()).replace("%", ""))).toBeLessThan(narrowFit);

  await zoomControls.getByRole("button", { name: "Zoom in" }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".physical-page").first()).toHaveCSS("transform", "none");
  await expect(page.locator(".physical-page").first()).toHaveCSS("width", physicalWidth);
  await expect(page.getByRole("article")).toHaveCount(2);
});
