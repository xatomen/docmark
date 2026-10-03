import {
  readFile } from "node:fs/promises";
import { expect,
  test,
  type Page } from "@playwright/test";
import { chooseLocalMarkdown,
  createNewDocument,
  forceFilePickerFallback,
  markdownEditor,
  openDocumentSettings,
  selectSettingOption,
  setSwitch,
  closeDocumentSettings,
  openFileMenu,
} from "./support";

async function waitUntilReady(page: Page) {
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
}

test("renders Mermaid diagram types locally, sequentially, and keeps normal code fences", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:3100") {
      externalRequests.push(request.url());
    }
  });
  await page.goto("/editor");
  const source = [
    "```mermaid", "flowchart LR", "A[Markdown] --> B[PDF]", "```", "",
    "```mermaid", "sequenceDiagram", "A->>B: Hello", "```", "",
    "```mermaid", "classDiagram", "class Account", "```", "",
    "```mermaid", "stateDiagram-v2", "[*] --> Ready", "```", "",
    "```mermaid", "erDiagram", "USER ||--o{ ORDER : places", "```", "",
    "```javascript", "const mermaid = true;", "```",
  ].join("\n");
  await markdownEditor(page).fill(source);

  await expect(page.locator("article .docmark-mermaid svg")).toHaveCount(5);
  await expect(page.locator("article pre code.language-javascript")).toContainText("const mermaid = true;");
  await expect(page.locator("article pre code")).not.toContainText("flowchart LR");
  await waitUntilReady(page);
  const svgIds = await page.locator("article .docmark-mermaid svg").evaluateAll((svgs) => svgs.map((svg) => svg.id));
  expect(new Set(svgIds).size).toBe(5);
  expect(externalRequests).toEqual([]);

  await page.evaluate(() => {
    (window as Window & { __printSvgCount?: number }).print = () => {
      (window as Window & { __printSvgCount?: number }).__printSvgCount = document.querySelectorAll("article .docmark-mermaid svg").length;
    };
  });
  await closeDocumentSettings(page);
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __printSvgCount?: number }).__printSvgCount)).toBe(5);
  expect(await page.locator("article .docmark-mermaid svg").evaluateAll((svgs) => svgs.map((svg) => svg.id))).toEqual(svgIds);
});

test("isolates invalid syntax, empty diagrams, and potentially unsafe diagram markup", async ({ page }) => {
  let scriptRan = false;
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:3100") externalRequests.push(request.url());
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__mermaidScriptRan", { value: false, writable: true });
  });
  await page.goto("/editor");
  const source = [
    "```mermaid", "not a valid diagram", "```", "",
    "```mermaid", "```", "",
    "```mermaid",
    '%%{init: {"theme":"dark","htmlLabels":true,"themeCSS":"body{background-image:url(https://example.invalid/theme.png)}"}}%%',
    "flowchart LR",
    'A[<img src="https://example.invalid/pixel" onerror="window.__mermaidScriptRan=true">] --> B',
    'click A "https://example.invalid/"', "```",
    "", "```mermaid", "flowchart LR", "A --> B", "```",
  ].join("\n");
  await markdownEditor(page).fill(source);

  await expect(page.locator("article .docmark-mermaid-error")).toHaveCount(2);
  await expect(page.locator("article .docmark-mermaid svg")).toHaveCount(2);
  await expect(page.locator("article .docmark-mermaid script, article .docmark-mermaid [onload], article .docmark-mermaid [onclick], article .docmark-mermaid [onerror]")).toHaveCount(0);
  await expect(page.locator("article .docmark-mermaid foreignObject, article .docmark-mermaid image")).toHaveCount(0);
  await expect(page.locator("article .docmark-mermaid a[href^='http']")).toHaveCount(0);
  await waitUntilReady(page);
  scriptRan = await page.evaluate(() => Boolean((window as Window & { __mermaidScriptRan?: boolean }).__mermaidScriptRan));
  expect(scriptRan).toBe(false);
  expect(externalRequests).toEqual([]);
});

test("diagram scaling preserves the SVG and keeps a tall block on one physical page", async ({ page }) => {
  await page.goto("/editor");
  const nodes = Array.from({ length: 45 }, (_, index) => `N${index} --> N${index + 1}`).join("\n");
  await markdownEditor(page).fill(`\`\`\`mermaid\nflowchart TB\n${nodes}\n\`\`\``);
  await expect(page.locator("article .document-content").first()).not.toContainText("Welcome to Docmark");
  await expect(page.locator("article .docmark-mermaid svg")).toHaveCount(1);
  await waitUntilReady(page);

  const result = await page.locator("article .docmark-mermaid").evaluate((diagram) => {
    const svg = diagram.querySelector("svg")!;
    const article = diagram.closest("article")!;
    const pages = document.querySelectorAll("article .docmark-mermaid");
    const height = Number(svg.getAttribute("height"));
    const contentHeight = Number.parseFloat(getComputedStyle(article.querySelector(".document-content")!).getPropertyValue("--document-content-height")) * 96 / 25.4;
    return { height, contentHeight, pageCount: pages.length, viewBox: svg.getAttribute("viewBox"), scrollWidth: diagram.scrollWidth, clientWidth: diagram.clientWidth };
  });
  expect(result.viewBox).toBeTruthy();
  expect(result.height).toBeLessThanOrEqual(result.contentHeight + 1);
  expect(result.pageCount).toBe(1);
  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth + 1);
});

test("Mermaid is ready before TOC page mapping and resizes for orientation without rerendering", async ({ page }) => {
  await page.goto("/editor");
  const longDiagram = Array.from({ length: 18 }, (_, index) => `N${index} --> N${index + 1}`).join("\n");
  const source = [
    ":::toc", ":::", "", "# Before", "", ":::pagebreak", ":::", "",
    "```mermaid", "flowchart TB", longDiagram, "```", "", "## After Diagram",
  ].join("\n");
  await markdownEditor(page).fill(source);
  await expect(page.locator("article .docmark-mermaid svg")).toHaveCount(1);
  await waitUntilReady(page);

  const entry = page.locator('article .docmark-toc-entry[data-docmark-toc-entry="docmark-heading-1"]');
  await expect(entry.locator(".docmark-toc-page")).toHaveText("3");
  await expect.poll(async () => Number(await page.locator(".page-list").getAttribute("data-toc-stabilization-passes"))).toBeGreaterThan(1);
  const firstSvg = await page.locator("article .docmark-mermaid svg").getAttribute("viewBox");

  const firstSvgId = await page.locator("article .docmark-mermaid svg").getAttribute("id");
  const firstSvgWidth = Number(await page.locator("article .docmark-mermaid svg").getAttribute("width"));
  await selectSettingOption(page, "Orientation", "landscape");
  await selectSettingOption(page, "Page size", "letter");
  await openDocumentSettings(page, "Margins");
  const margins = page.getByRole("button", { name: "Margins", exact: true });
  if (await margins.getAttribute("aria-expanded") !== "true") await margins.click();
  await page.getByLabel("Left (mm)").fill("26");
  await selectSettingOption(page, "Font family", "Montserrat");
  await expect(page.locator("article .docmark-mermaid svg")).toHaveCount(1);
  await waitUntilReady(page);
  expect(await page.locator("article .docmark-mermaid svg").getAttribute("id")).toBe(firstSvgId);
  expect(Number(await page.locator("article .docmark-mermaid svg").getAttribute("width"))).toBeLessThan(firstSvgWidth);
  expect(firstSvg).toBeTruthy();
  await setSwitch(page, "Show header", true);
  await setSwitch(page, "Show footer", true);
  await setSwitch(page, "Show page numbers", true);
  await closeDocumentSettings(page);
  await expect(page.locator("article .docmark-mermaid svg")).toHaveCount(1);
  await waitUntilReady(page);

  // Rapid edits leave the final generation in the preview.
  await markdownEditor(page).fill(source.replace("N0 --> N1", "N0 --> N1 --> N2"));
  await openDocumentSettings(page);
  await closeDocumentSettings(page);
  await markdownEditor(page).fill(source.replace("flowchart TB", "flowchart LR"));
  await expect(page.locator("article .docmark-mermaid svg")).toHaveCount(1);
  await waitUntilReady(page);
  expect(await page.locator("article .docmark-mermaid svg").getAttribute("id")).not.toBe(firstSvgId);
  const finalViewBox = await page.locator("article .docmark-mermaid svg").getAttribute("viewBox");
  const [, , width, height] = (finalViewBox ?? "").split(/[ ,]+/).map(Number);
  expect(width).toBeGreaterThan(height);
  await expect(markdownEditor(page)).toContainText("flowchart LR");
});

test("a diagram moves intact to the next page when the remaining space is too short", async ({ page }) => {
  await page.goto("/editor");
  const filler = Array.from(
    { length: 8 },
    (_, index) => `${index === 7 ? "FINAL_FILLER" : `FILLER_${index}`} ${"Physical page measurement keeps paragraph content together. ".repeat(7)}`,
  );
  const links = Array.from({ length: 20 }, (_, index) => `N${index} --> N${index + 1}`);
  const diagram = ["```mermaid", "flowchart TB", ...links, "```"].join("\n");
  await markdownEditor(page).fill(["## Lead-in", ...filler, diagram].join("\n\n"));
  await expect(page.locator("article .docmark-mermaid svg")).toHaveCount(1);
  await waitUntilReady(page);

  const fillerPage = Number((await page.locator("article").filter({ hasText: "FINAL_FILLER" }).last().getAttribute("aria-label"))?.match(/^Page (\d+)/)?.[1]);
  const diagramPage = Number((await page.locator("article").filter({ has: page.locator(".docmark-mermaid") }).first().getAttribute("aria-label"))?.match(/^Page (\d+)/)?.[1]);
  expect(diagramPage).toBeGreaterThan(fillerPage);
  expect(await page.locator("article .docmark-mermaid svg").count()).toBe(1);
});

test("a very wide flowchart stays within the physical content width", async ({ page }) => {
  await page.goto("/editor");
  await selectSettingOption(page, "Text alignment", "justify");
  const edges = Array.from({ length: 14 }, (_, index) =>
    `N${index}[${`A deliberately long diagram label ${index} `.repeat(3)}] --> N${index + 1}`,
  ).join("\n");
  await closeDocumentSettings(page);
  await markdownEditor(page).fill(`\`\`\`mermaid\nflowchart LR\n${edges}\n\`\`\``);
  await expect(page.locator("article .docmark-mermaid svg")).toHaveCount(1);
  await waitUntilReady(page);
  const geometry = await page.locator("article .docmark-mermaid").evaluate((diagram) => ({
    scrollWidth: diagram.scrollWidth,
    parentWidth: diagram.parentElement!.clientWidth,
    textAlign: getComputedStyle(diagram).textAlign,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.parentWidth + 1);
  expect(geometry.textAlign).toBe("center");
});

test("a late diagram render cannot leak across a document switch", async ({ page }) => {
  await page.goto("/editor");
  const nodes = Array.from({ length: 30 }, (_, index) => `N${index} --> N${index + 1}`).join("\n");
  await markdownEditor(page).fill(`\`\`\`mermaid\nflowchart TB\n${nodes}\n\`\`\``);
  await createNewDocument(page);
  await markdownEditor(page).fill("# Document B\n\nPlain Markdown only.");
  await expect(page.locator("article .docmark-mermaid svg, article .docmark-mermaid-error")).toHaveCount(0);
  await expect(page.locator("article h1")).toHaveText("Document B");
  await waitUntilReady(page);
});

test("Markdown Open, Save, reload, and duplicate preserve Mermaid source and render it again", async ({ page }) => {
  await forceFilePickerFallback(page);
  await page.goto("/editor");
  const source = "# Local diagram\n\n```mermaid\nflowchart LR\nA --> B\n```\n";
  await chooseLocalMarkdown(page, "local-diagram.md", source);
  await expect(page.locator("article .docmark-mermaid svg")).toHaveCount(1);
  await waitUntilReady(page);
  await expect(markdownEditor(page)).toContainText("flowchart LR");

  await openFileMenu(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  await expect(readFile(path!, "utf8")).resolves.toBe(source);

  await page.reload();
  await expect(page.locator("article .docmark-mermaid svg")).toHaveCount(1);
  await waitUntilReady(page);
  await closeDocumentSettings(page);
  await page.getByLabel("Active document: local-diagram. Open document list").click();
  await page.getByRole("button", { name: /^Actions for / }).first().click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).first().click();
  await expect(page.locator("article .docmark-mermaid svg")).toHaveCount(1);
  await waitUntilReady(page);
  await expect(markdownEditor(page)).toContainText("flowchart LR");
});
