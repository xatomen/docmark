import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/markdown-to-pdf", "/about", "/privacy", "/contact"];

test("public topbar is available across routes with the correct active link", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const path of publicRoutes) {
    await page.goto(path);

    const header = page.locator(".site-header");
    const navigation = header.getByRole("navigation", { name: "Primary navigation" });
    await expect(header).toBeVisible();
    await expect(header.getByRole("link", { name: "Docmark home" })).toHaveAttribute("href", "/");
    await expect(navigation.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/");
    await expect(navigation.getByRole("link", { name: "Guide", exact: true })).toHaveAttribute("href", "/markdown-to-pdf");
    await expect(navigation.getByRole("link", { name: "About", exact: true })).toHaveAttribute("href", "/about");
    await expect(navigation.getByRole("link", { name: "Open editor", exact: true })).toHaveAttribute("href", "/editor");

    const currentLink = path === "/" ? "Home" : path === "/markdown-to-pdf" ? "Guide" : path === "/about" ? "About" : null;
    for (const label of ["Home", "Guide", "About"]) {
      const link = navigation.getByRole("link", { name: label, exact: true });
      if (label === currentLink) {
        await expect(link).toHaveAttribute("aria-current", "page");
      } else {
        await expect(link).not.toHaveAttribute("aria-current", "page");
      }
    }
  }
});

test("mobile topbar supports keyboard open, Escape, navigation, and narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about");

  const header = page.locator(".site-header");
  const toggle = header.getByRole("button", { name: "Open navigation menu" });
  const mobileNavigation = header.getByRole("navigation", { name: "Mobile navigation" });
  await expect(header.getByRole("link", { name: "Open editor", exact: true })).toBeVisible();
  await expect(toggle).toBeVisible();
  await expect(mobileNavigation).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(header.getByRole("button", { name: "Close navigation menu" })).toHaveAttribute("aria-expanded", "true");
  await expect(mobileNavigation).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(mobileNavigation.getByRole("link", { name: "Home", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(mobileNavigation).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.press("Enter");
  await mobileNavigation.getByRole("link", { name: "Guide", exact: true }).click();
  await expect(page).toHaveURL(/\/markdown-to-pdf$/);
  await expect(page.locator(".site-header").getByRole("navigation", { name: "Mobile navigation" })).toBeHidden();
  await expect(page.locator("#site-mobile-navigation a[aria-current='page']")).toHaveAttribute("href", "/markdown-to-pdf");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("public navigation is hidden for print while the editor keeps its own header", async ({ page }) => {
  await page.goto("/about");
  await expect(page.locator(".site-header")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".site-header")).toBeHidden();
  await expect(page.locator(".app-footer")).toBeHidden();

  await page.emulateMedia({ media: "screen" });
  await page.goto("/editor");
  await expect(page.locator(".site-header")).toHaveCount(0);
  await expect(page.locator(".app-header")).toBeVisible();
  await expect(page.locator(".app-footer")).toBeVisible();
});
