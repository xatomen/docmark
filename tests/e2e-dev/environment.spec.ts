import { expect, test } from "@playwright/test";

const routes = ["/", "/about", "/contact", "/privacy", "/editor", "/markdown-to-pdf"];

test("DEV routes all emit noindex/nofollow and response header, without promotional URLs", async ({ request }) => {
  for (const route of routes) {
    const response = await request.get(route);
    expect(response.ok(), route).toBeTruthy();
    expect(response.headers()["x-robots-tag"], route).toMatch(/noindex\s*,\s*nofollow/i);
    const html = await response.text();
    expect(html, route).toMatch(/<meta name="robots" content="noindex, nofollow"/i);
    expect(html, route).not.toMatch(/<link[^>]+rel="canonical"/i);
    expect(html, route).not.toContain("og:url");
    expect(html, route).not.toContain("https://docmark-dev.jorgegallardo.cl");
    expect(html, route).not.toContain('application/ld+json');
  }
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toMatch(/Allow:\s*\//);
  expect(await robots.text()).not.toMatch(/Disallow:\s*\//);
  expect(await robots.text()).not.toMatch(/Sitemap:/i);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  expect(await sitemap.text()).not.toMatch(/<loc>/);
});

test("DEV badge appears on landing and editor, and disappears in print", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Development environment")).toBeVisible();
  await page.goto("/editor");
  const badges = page.getByLabel("Development environment");
  await expect(badges).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(badges).toBeHidden();
});

test("DEV editor retains normal paginated preview", async ({ page }) => {
  await page.goto("/editor");
  await expect(page.locator(".physical-page").first()).toBeVisible();
  await expect(page.locator(".page-stage").first()).toBeVisible();
});
