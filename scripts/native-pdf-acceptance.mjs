import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "artifacts/m7.2");
await mkdir(out, { recursive: true });
const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: { "@": path.join(root, "src") } },
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});
let browser;

try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Could not resolve the acceptance server port");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  const page = await browser.newPage();
  const externalRequests = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) {
      externalRequests.push(url.href);
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.goto(`${origin}/tests/pdf-native/harness.html`);
  await page.waitForFunction(() => typeof window.generatePdf === "function");

  const fixture = await readFile(path.join(root, "tests/fixtures/pdf-engine-comparison.md"), "utf8");
  const cases = [
    { name: "basic-document", source: "# Título\n\nInformación y **negrita** con *cursiva*, ***ambos*** y `inlineToken`.", expected: ["Título", "Información", "inlineToken"] },
    { name: "unicode-document", source: "# Español\n\nInformación, acción, niño, pingüino, ¿Cómo estás? ¡Excelente!", expected: ["Información", "niño", "pingüino", "¿Cómo"] },
    { name: "tables-and-lists", source: "3. primero\n4. segundo\n   - anidado\n\n| A | B |\n|---|---|\n| celda | valor |", expected: ["primero", "segundo", "anidado", "celda", "valor"] },
    { name: "code-blocks", source: "> cita de prueba\n\n```js\nconst value = 10;\n```", expected: ["cita de prueba", "const value = 10;"] },
    { name: "empty-document", source: "", expectedPages: [[]] },
    { name: "explicit-page-break", source: "# Primera\n\n:::pagebreak\n:::\n\n# Segunda", expectedPages: [["Primera"], ["Segunda"]] },
    { name: "leading-page-break", source: ":::pagebreak\n:::\n\nInicio", expectedPages: [["Inicio"]] },
    { name: "trailing-page-break", source: "Contenido\n\n:::pagebreak\n:::", expectedPages: [["Contenido"], []] },
    { name: "consecutive-page-breaks", source: "Primero\n\n:::pagebreak\n:::\n\n:::pagebreak\n:::\n\nSegundo", expectedPages: [["Primero"], ["Segundo"]] },
    { name: "letter-landscape", source: "# Landscape", options: { landscape: true }, expected: ["Landscape"], paper: "letter-landscape" },
    { name: "code-indentation", source: "```python\ndef outer():\n    first = 1\n\n        nested = first + 1\n    return nested\n```\n\n```yaml\nroot:\n  list:\n    - value\n```\n\n```json\n{\n  \"root\": {\n    \"enabled\": true\n  }\n}\n```", expected: ["def outer():", "first = 1", "nested = first + 1", "return nested", "root:", "- value", '"enabled": true'] },
    { name: "line-height-compact", source: "Paragraph spacing test: alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu. ".repeat(3), options: { settings: { margins: { left: 70, right: 70 }, typography: { lineHeight: 1.2 } } }, expected: ["Paragraph spacing test"] },
    { name: "line-height-loose", source: "Paragraph spacing test: alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu. ".repeat(3), options: { settings: { margins: { left: 70, right: 70 }, typography: { lineHeight: 2 } } }, expected: ["Paragraph spacing test"] },
    { name: "m7.0-fixture", source: fixture, expected: ["Información", "pingüino", "Anidado", "Código"] },
    { name: "security", source: "", options: { links: [
      { label: "safe-https", url: "https://example.com" },
      { label: "safe-http", url: "http://example.com" },
      { label: "relative", url: "/local" },
      { label: "protocol-relative", url: "//example.com/path" },
      { label: "ambiguous", url: "https:example.com" },
      { label: "javascript", url: "javascript:alert(1)" },
    ] }, expected: ["safe-https", "safe-http", "relative", "protocol-relative", "ambiguous", "javascript"] },
  ];
  const retainedPdfs = new Set([...cases.map(({ name }) => `${name}.pdf`), "editor-download.pdf"]);
  for (const existing of await readdir(out)) {
    if (existing.endsWith(".pdf") && !retainedPdfs.has(existing)) await unlink(path.join(out, existing));
  }
  const report = { runtime: "Vite browser harness using the production model and pdfmake adapter", externalRequests, documents: {}, lineHeightMeasurements: {} };

  for (const item of cases) {
    const result = await page.evaluate(([source, options]) => window.generatePdf(source, options), [item.source, item.options ?? {}]);
    const bytes = Buffer.from(result.bytes);
    assert.ok(bytes.subarray(0, 5).equals(Buffer.from("%PDF-")), `${item.name}: PDF signature`);
    const file = path.join(out, `${item.name}.pdf`);
    await writeFile(file, bytes);
    const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    const pages = [];
    const annotations = [];
    const pageViews = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const current = await pdf.getPage(pageNumber);
      const content = await current.getTextContent();
      pages.push(content.items.map((entry) => "str" in entry ? entry.str : "").join(" "));
      annotations.push(...await current.getAnnotations());
      pageViews.push(current.view);
    }
    if (item.expected) {
      const text = pages.join("\n");
      for (const expected of item.expected) assert.ok(text.includes(expected), `${item.name}: missing ${expected}`);
    }
    if (item.expectedPages) {
      assert.equal(pages.length, item.expectedPages.length, `${item.name}: page count`);
      item.expectedPages.forEach((expected, index) => {
        for (const value of expected) assert.ok(pages[index].includes(value), `${item.name}: page ${index + 1} missing ${value}`);
        if (!expected.length) assert.equal(pages[index].trim(), "", `${item.name}: expected blank page ${index + 1}`);
      });
    }
    if (item.name === "letter-landscape") {
      assert.ok(Math.abs(pageViews[0][2] - 792) < 2);
      assert.ok(Math.abs(pageViews[0][3] - 612) < 2);
    } else {
      assert.ok(Math.abs(pageViews[0][2] - 595.28) < 2);
      assert.ok(Math.abs(pageViews[0][3] - 841.89) < 2);
    }

    const fonts = spawnSync("pdffonts", [file], { encoding: "utf8" });
    assert.equal(fonts.status, 0, fonts.stderr);
    if (item.name !== "empty-document") {
      assert.match(fonts.stdout, /LiberationSans/);
      assert.match(fonts.stdout, /yes\s+yes\s+yes/);
    }
    if (item.name === "basic-document") {
      for (const variant of ["LiberationSans-Bold", "LiberationSans-Italic", "LiberationSans-BoldItalic"]) {
        assert.ok(fonts.stdout.includes(variant), `Missing embedded font variant ${variant}`);
      }
      assert.match(fonts.stdout, /\+LiberationSans\s+CID TrueType/, "Missing embedded regular Liberation Sans variant");
    }
    if (item.name === "code-indentation") {
      const codePdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
      const codePage = await codePdf.getPage(1);
      const items = (await codePage.getTextContent()).items.filter((entry) => "str" in entry);
      const find = (needle) => items.find((entry) => entry.str.includes(needle));
      const zero = find("def outer():");
      const one = find("first = 1");
      const nested = find("nested = first + 1");
      assert.ok(zero && one && nested, "Python code lines must be extractable");
      assert.ok(one.transform[4] - zero.transform[4] > 8, "four leading spaces must move the text's physical x position");
      assert.ok(nested.transform[4] - one.transform[4] > 8, "nested indentation must move text further right");
      assert.ok(zero.transform[5] - one.transform[5] > 8, "multiline code must be vertically composed");
    }
    if (item.name === "line-height-compact" || item.name === "line-height-loose") {
      const textItems = (await (await pdf.getPage(1)).getTextContent()).items.filter((entry) => "str" in entry && entry.str.trim());
      const ys = [...new Set(textItems.map((entry) => Math.round(entry.transform[5] * 100) / 100))].sort((left, right) => right - left);
      const gaps = ys.slice(1).map((value, index) => ys[index] - value).filter((gap) => gap > 2);
      assert.ok(gaps.length >= 3, `${item.name}: expected several physically wrapped text lines`);
      const sortedGaps = [...gaps].sort((left, right) => left - right);
      report.lineHeightMeasurements[item.name] = sortedGaps[Math.floor(sortedGaps.length / 2)];
    }
    if (item.name === "security") {
      const actualUrls = annotations.map((annotation) => annotation.url).filter(Boolean);
      assert.deepEqual([...new Set(actualUrls)].sort(), ["http://example.com/", "https://example.com/"]);
      assert.ok(annotations.every((annotation) => annotation.subtype === "Link"));
      assert.equal(await pdf.getAttachments(), null);
      assert.equal(await pdf.getJSActions(), null);
      const inspection = spawnSync("python3", [
        "scripts/inspect_pdf_actions.py", file,
        "--allow-uri", "https://example.com/",
        "--allow-uri", "http://example.com/",
      ], { encoding: "utf8" });
      assert.equal(inspection.status, 0, inspection.stderr);
      report.securityInspection = JSON.parse(inspection.stdout);
    }
    report.documents[item.name] = {
      bytes: bytes.length,
      pages: pdf.numPages,
      pageTexts: pages,
      dimensions: pageViews,
      textAssertions: item.expected ?? [],
      fonts: fonts.stdout,
      annotations: annotations.map(({ subtype, url }) => ({ subtype, url })),
      diagnostics: result.diagnostics,
    };
  }

  assert.ok(
    report.lineHeightMeasurements["line-height-loose"] > report.lineHeightMeasurements["line-height-compact"] * 1.3,
    "the selected line height must change actual PDF line spacing",
  );

  assert.deepEqual(externalRequests, []);
  const adversarial = spawnSync("python3", ["tests/pdf-native/test-action-inspector.py"], { encoding: "utf8" });
  assert.equal(adversarial.status, 0, adversarial.stderr || adversarial.stdout);
  report.actionInspectorAdversarialTests = adversarial.stdout.trim();
  await writeFile(path.join(out, "validation-report.json"), JSON.stringify(report, null, 2));
  console.log(`PDF acceptance passed: ${cases.length} documents, action adversarial fixtures passed in ${out}`);
} finally {
  await browser?.close();
  await server.close();
}
