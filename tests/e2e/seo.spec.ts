import { expect, test } from "@playwright/test";

const productionOrigin = "https://docmark.jorgegallardo.cl";
const landingTitle = "Markdown to PDF Converter — Private & Local | Docmark";
const landingDescription =
  "Convert Markdown into polished PDF documents directly in your browser. Live preview, pagination, themes, Mermaid diagrams and no file uploads.";

test("landing SEO metadata and WebApplication JSON-LD are in the initial HTML", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  const html = await response!.text();

  const escapedLandingTitle = landingTitle.replace(/&/g, "&amp;");
  expect(html).toContain(`<title>${escapedLandingTitle}</title>`);
  expect(html).toContain(`<meta name="description" content="${landingDescription}"`);
  const canonicalHref = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  expect(canonicalHref).toBeTruthy();
  expect(new URL(canonicalHref!).href).toBe(`${productionOrigin}/`);
  expect(html).toContain('<meta property="og:type" content="website"');
  expect(html).toContain('<meta property="og:site_name" content="Docmark"');
  expect(html).toContain(`<meta property="og:title" content="${escapedLandingTitle}"`);
  expect(html).toContain(`<meta property="og:description" content="${landingDescription}"`);
  const openGraphUrl = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  expect(openGraphUrl).toBeTruthy();
  expect(new URL(openGraphUrl!).href).toBe(`${productionOrigin}/`);
  expect(html).toContain('<meta property="og:locale" content="en_US"');
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
  expect(html).toContain(`<meta name="twitter:title" content="${escapedLandingTitle}"`);
  expect(html).toContain(`<meta name="twitter:description" content="${landingDescription}"`);
  expect(html).toContain('<html lang="en"');
  expect(html).not.toMatch(/localhost|127\.0\.0\.1|\.workers\.dev/i);

  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  expect(jsonLdMatch).not.toBeNull();
  const jsonLd = JSON.parse(jsonLdMatch![1]) as Record<string, unknown>;
  expect(jsonLd).toMatchObject({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Docmark",
    url: `${productionOrigin}/`,
    description: landingDescription,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
  });
  expect(jsonLd.featureList).toEqual(expect.arrayContaining([
    "Markdown editing",
    "Live document preview",
    "Browser print to PDF",
    "Automatic pagination",
    "Table of contents",
    "Mermaid diagrams",
    "Document themes",
    "Local in-browser processing",
  ]));

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Open the editor/ })).toHaveAttribute("href", "/editor");
});

test("editor has route-specific canonical and noindex, follow in the initial HTML", async ({ page }) => {
  const response = await page.goto("/editor");
  expect(response).not.toBeNull();
  const html = await response!.text();

  expect(html).toContain("<title>Markdown Editor | Docmark</title>");
  expect(html).toContain('<meta name="robots" content="noindex, follow"');
  expect(html).toContain(`<link rel="canonical" href="${productionOrigin}/editor"`);
  expect(html).toContain('<meta property="og:url" content="https://docmark.jorgegallardo.cl/editor"');
  expect(html).not.toContain("noindex, nofollow");
});

test("robots and sitemap expose only the public production landing", async ({ request }) => {
  const [robotsResponse, sitemapResponse] = await Promise.all([
    request.get("/robots.txt"),
    request.get("/sitemap.xml"),
  ]);
  expect(robotsResponse.ok()).toBeTruthy();
  expect(sitemapResponse.ok()).toBeTruthy();

  const robotsText = await robotsResponse.text();
  expect(robotsText).toContain("User-Agent: *");
  expect(robotsText).toContain("Allow: /");
  expect(robotsText).toContain("Sitemap: https://docmark.jorgegallardo.cl/sitemap.xml");
  expect(robotsText).not.toMatch(/Disallow:\s*\/\s*(?:\r?\n|$)/);

  const sitemapText = await sitemapResponse.text();
  expect(sitemapText).toContain("https://docmark.jorgegallardo.cl/");
  expect(sitemapText).not.toContain("/editor");
  expect(sitemapText).not.toMatch(/localhost|127\.0\.0\.1|\.workers\.dev/i);
  expect(sitemapText).not.toContain("<lastmod>");
});
