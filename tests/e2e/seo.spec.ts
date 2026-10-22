import { expect, test } from "@playwright/test";
import { markdownEditor } from "./support";

const productionOrigin = "https://docmark.jorgegallardo.cl";
const landingTitle = "Markdown to PDF Converter — Private & Local | Docmark";
const landingDescription =
  "Edit Markdown, preview paginated documents, render Mermaid diagrams, and export PDF through your browser’s print dialog with Docmark.";

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
    "A4 and Letter page layouts",
    "Typography and document themes",
    "Headers, footers, and page numbering",
    "Table of contents",
    "Mermaid diagrams",
    "Local document storage",
    "Open and save Markdown files",
  ]));

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Open the editor/ }).first()).toHaveAttribute("href", "/editor");
  await expect(page.getByRole("heading", { level: 2, name: "Everything you need to go from Markdown to PDF" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "How it works" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Your documents, in your browser" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Frequently asked questions" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Give your Markdown a page." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Render Mermaid diagrams" })).toBeVisible();
  await expect(page.locator("details")).toHaveCount(6);
  await expect(page.getByRole("link", { name: "About Docmark" })).toHaveAttribute("href", "/about");
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "Open the editor" }).last()).toHaveAttribute("href", "/editor");
  expect(html).toContain("Docmark does not upload them to a document-conversion server");
  expect(html).toContain("Cloudflare Web Analytics to measure site use and performance");
  expect(html).toContain('"@type":"WebApplication"');
  expect(html).not.toContain('"@type":"FAQPage"');
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
  const sitemapUrls = Array.from(sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g), ([, url]) => url);
  expect(sitemapUrls).toEqual([
    "https://docmark.jorgegallardo.cl/",
    "https://docmark.jorgegallardo.cl/about",
    "https://docmark.jorgegallardo.cl/privacy",
    "https://docmark.jorgegallardo.cl/contact",
  ]);
  expect(sitemapText).not.toContain("/editor");
  expect(sitemapText).not.toMatch(/localhost|127\.0\.0\.1|\.workers\.dev/i);
  expect(sitemapText).not.toContain("<lastmod>");
});

test("informational pages have route-specific metadata and usable footer navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pages = [
    {
      path: "/about",
      title: "About Docmark | Docmark",
      h1: "Markdown in. Documents out.",
      canonical: `${productionOrigin}/about`,
      description: "Learn how Docmark turns Markdown into paginated, print-ready documents in your browser, with local saving and browser-based PDF export.",
    },
    {
      path: "/privacy",
      title: "Privacy Policy | Docmark",
      h1: "Privacy Policy",
      canonical: `${productionOrigin}/privacy`,
      description: "Read how Docmark handles Markdown documents, browser storage, PDF export, technical website requests, email, and external resources.",
    },
    {
      path: "/contact",
      title: "Contact Docmark | Docmark",
      h1: "Get in touch.",
      canonical: `${productionOrigin}/contact`,
      description: "Contact the Docmark team for general questions, bug reports, feature suggestions, privacy questions, or help using Docmark.",
    },
  ];

  for (const infoPage of pages) {
    const response = await page.goto(infoPage.path);
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain(`<title>${infoPage.title}</title>`);
    expect(html).toContain(`<meta name="description" content="${infoPage.description}"`);
    expect(html).toContain(`<link rel="canonical" href="${infoPage.canonical}"`);
    await expect(page.locator("h1")).toHaveText(infoPage.h1);
    await expect(page.getByRole("navigation", { name: "Footer navigation" }).getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    await expect(page.getByRole("navigation", { name: "Footer navigation" }).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(page.getByRole("navigation", { name: "Footer navigation" }).getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }

  await page.goto("/about");
  await expect(page.getByRole("list").filter({ has: page.getByText("Edit Markdown with a live document preview.") })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Open the Docmark editor" })).toHaveAttribute("href", "/editor");

  await page.goto("/contact");
  const contactCard = page.getByRole("region", { name: "Email Docmark" });
  await expect(contactCard.getByRole("listitem")).toHaveCount(5);
  const emailLink = contactCard.getByRole("link", { name: "contact@docmark.jorgegallardo.cl" });
  await expect(emailLink).toHaveAttribute("href", "mailto:contact@docmark.jorgegallardo.cl");
  await expect(page.getByRole("link", { name: "Privacy Policy", exact: true })).toHaveAttribute("href", "/privacy");
  await expect(page.getByText(/requests to access, correct, or delete personal data/)).toBeVisible();

  await page.goto("/privacy");
  await expect(page.getByText(/stored in IndexedDB in your browser profile/)).toBeVisible();
  await expect(page.getByText(/may request it directly from that host/)).toBeVisible();
  const analyticsSection = page.getByRole("region", { name: "Cloudflare Web Analytics" });
  await expect(analyticsSection.getByText(/enabled for the jorgegallardo\.cl zone with automatic installation/)).toBeVisible();
  await expect(analyticsSection.getByRole("link", { name: "Web Analytics FAQ" })).toHaveAttribute(
    "href",
    "https://developers.cloudflare.com/web-analytics/faq/",
  );
  await expect(analyticsSection.getByRole("link", { name: "Privacy Policy", exact: true })).toHaveAttribute(
    "href",
    "https://www.cloudflare.com/policies/privacy/",
  );
  await expect(analyticsSection.getByText(/measures site use and performance through a browser beacon/)).toBeVisible();
  await expect(analyticsSection).not.toContainText(/seven days|six months|Security Level Medium|Bot Fight Mode/);
  await expect(page.getByText(/Web Analytics beacon does not use cookies/)).toBeVisible();
  const emailSection = page.getByRole("region", { name: "Email communications" });
  await expect(emailSection.getByRole("link", { name: "contact@docmark.jorgegallardo.cl" })).toHaveAttribute(
    "href",
    "mailto:contact@docmark.jorgegallardo.cl",
  );
  await expect(emailSection.getByText(/received through Cloudflare Email Routing and forwarded to Gmail/)).toBeVisible();
  await expect(emailSection.getByText(/kept in Gmail as a history of inquiries and support conversations/)).toBeVisible();
  await expect(emailSection.getByText(/no automatic deletion schedule is currently configured/)).toBeVisible();
  await expect(emailSection.getByText(/Docmark has not verified their retention period/)).toBeVisible();
  await expect(emailSection.getByText(/request access to, correction of, or deletion of personal data/)).toBeVisible();
  await expect(emailSection.getByText(/reviewed under applicable law/)).toBeVisible();
  await expect(emailSection.getByText(/may reasonably verify your identity when appropriate/)).toBeVisible();
  await expect(emailSection.getByText(/does not guarantee immediate or complete deletion/)).toBeVisible();
  await expect(emailSection.getByRole("link", { name: "Privacy Policy", exact: true }).nth(0)).toHaveAttribute(
    "href",
    "https://www.cloudflare.com/policies/privacy/",
  );
  await expect(emailSection.getByRole("link", { name: "Privacy Policy", exact: true }).nth(1)).toHaveAttribute(
    "href",
    "https://policies.google.com/privacy",
  );
  await expect(page.getByRole("heading", { name: "Details to confirm before publication" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Cloudflare’s cookies documentation" })).toHaveAttribute(
    "href",
    "https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/",
  );
});

test("editor footer links are screen-only and stay out of printed documents", async ({ page }) => {
  await page.goto("/editor");
  const footer = page.locator(".app-footer");
  await expect(footer).toBeVisible();
  await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await markdownEditor(page).fill("# Print without application footer");
  await expect(page.getByRole("article", { name: "Page 1" }).getByRole("heading", { name: "Print without application footer" })).toBeVisible();
  await expect(page.locator(".physical-page .app-footer")).toHaveCount(0);

  await page.emulateMedia({ media: "print" });
  await expect(footer).toBeHidden();
  expect(await footer.evaluate((element) => getComputedStyle(element).display)).toBe("none");
  const pdf = await page.pdf({ printBackground: false, preferCSSPageSize: true });
  expect(pdf.byteLength).toBeGreaterThan(1_000);
});
