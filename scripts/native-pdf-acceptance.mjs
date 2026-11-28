import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { copyFile, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "artifacts/m7.3");
await mkdir(out, { recursive: true });
const toCodePoints = (value) => Array.from(value, (character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`);
const extractBracketed = (text, label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}\\[([^\\]]*)\\]`));
  assert.ok(match, `extracted text must contain ${label}[…]`);
  return match[1];
};
const coverageCheck = spawnSync("python3", ["scripts/generate-pdf-font-coverage.py", "--check"], { encoding: "utf8" });
assert.equal(coverageCheck.status, 0, `${coverageCheck.stderr}${coverageCheck.stdout}`);
const coverageFile = path.join(root, "src/lib/pdf/fonts/coverage.generated.json");
const coverageMetadata = JSON.parse(await readFile(coverageFile, "utf8"));
const coverageMetadataBytes = (await readFile(coverageFile)).byteLength;
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
  const { PDF_FONT_REGISTRY, DOCUMENT_PDF_FONT_MAPPINGS } = await server.ssrLoadModule("/src/lib/pdf/fonts/registry.ts");
  const { DOCUMENT_FONT_REGISTRY } = await server.ssrLoadModule("/src/lib/document/font-registry.ts");
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  const page = await browser.newPage();
  const externalRequests = [];
  const resourceTransfers = [];
  const pendingTransferReads = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== origin || !(url.pathname.includes("pdfmake") || (url.pathname.startsWith("/fonts/") && url.pathname.endsWith(".ttf")))) return;
    pendingTransferReads.push(response.body().then((bytes) => {
      resourceTransfers.push({ path: url.pathname, bytes: bytes.byteLength });
    }).catch(() => {}));
  });
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
    { name: "code-blocks", source: "> cita de prueba\n\n```js\nconst value = 10;\n```", expected: ["cita de prueba", "const", "value", "10;"] },
    { name: "code-only", source: "```txt\nconst value = 1;\n```", expected: ["const", "value", "1;"], expectedFontFamilies: ["LiberationMono"], expectedOnlyFonts: ["LiberationMono"] },
    { name: "code-only-page-breaks", source: "```txt\nfirstCode\n```\n\n:::pagebreak\n:::\n\n```txt\nsecondCode\n```", expectedPages: [["firstCode"], ["secondCode"]], expectedOnlyFonts: ["LiberationMono"] },
    { name: "inline-code-only", source: "`onlyInlineCode`", expected: ["onlyInlineCode"], expectedOnlyFonts: ["LiberationMono"] },
    { name: "empty-table-cells-with-code", source: "| code | empty |\n|---|---|\n| `tableCode` | |", expected: ["tableCode"], expectedOnlyFonts: ["LiberationSans", "LiberationMono"] },
    { name: "fallback-glyphs-only", source: "₽₹₸₺₼", expected: ["₽", "₹", "₸", "₺", "₼"], expectedOnlyFonts: ["DocmarkSignatureSans-Regular"] },
    { name: "fallback-priority-unsupported-tail", source: "ԤԥԦԧԨԩԮԯ⁒⁰ⁱ₸₹₺₼₽KÅ⅄Ↄ∅▷◁ⱮⱯ😀", expected: ["Ԥ", "Ɐ", "U+1F600"], expectedDiagnostics: ["U+1F600"], expectedOnlyFonts: ["LiberationSans", "DocmarkSignatureSans-Regular"] },
    { name: "empty-document", source: "", expectedPages: [[]], expectedOnlyFonts: [] },
    { name: "explicit-page-break", source: "# Primera\n\n:::pagebreak\n:::\n\n# Segunda", expectedPages: [["Primera"], ["Segunda"]] },
    { name: "leading-page-break", source: ":::pagebreak\n:::\n\nInicio", expectedPages: [["Inicio"]] },
    { name: "trailing-page-break", source: "Contenido\n\n:::pagebreak\n:::", expectedPages: [["Contenido"], []] },
    { name: "consecutive-page-breaks", source: "Primero\n\n:::pagebreak\n:::\n\n:::pagebreak\n:::\n\nSegundo", expectedPages: [["Primero"], ["Segundo"]] },
    { name: "letter-landscape", source: "# Landscape", options: { landscape: true }, expected: ["Landscape"], paper: "letter-landscape" },
    { name: "code-indentation", source: "```python\ndef outer():\n    first = 1\n\n        nested = first + 1\n    return nested\n```\n\n```yaml\nroot:\n  list:\n    - value\n```\n\n```json\n{\n  \"root\": {\n    \"enabled\": true\n  }\n}\n```", expected: ["def", "outer():", "first", "nested", "return", "root:", "-", '"enabled":'] },
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
    { name: "unicode-primary-font", source: "Primary: café; cafe\u0301; acción; Ελληνικά; Кириллица; ∑ → ≤ ≥.", expected: ["café", "acción", "Ελληνικά", "Кириллица", "∑", "→", "≤", "≥"] },
    { name: "unicode-fallback", source: "before A₽B after", expected: ["before", "A", "₽", "B", "after"], expectedTextSequence: "before A₽B after", expectedFallbackFamilies: ["DocmarkSignatureSans"] },
    { name: "unicode-combining-marks", source: "NFC café; NFD cafe\u0301; stacked a\u0308\u0304.", expected: ["NFC", "café", "NFD", "stacked"] },
    { name: "unicode-greek-cyrillic", source: "Greek: Ελληνικά, final ς; Cyrillic: Кириллица, Ёж.", expected: ["Ελληνικά", "ς", "Кириллица", "Ёж"] },
    { name: "unicode-mathematical-symbols", source: "Supported: ∑ − → ≤ ≥ ±. Fallback: ⟨x⟩ ∈ ⇒.", expected: ["∑", "−", "→", "≤", "≥", "±", "⟨", "x", "⟩", "∈", "⇒"], expectedTextSequence: "Fallback:", expectedFallbackFamilies: ["DejaVuMathTeXGyre"] },
    { name: "unicode-styled-fallback", source: "**bold ₽**, *italic ₽*, ***both ₽***, ~~strike ₽~~.", expected: ["bold", "italic", "both", "strike", "₽"], expectedTextSequence: "bold ₽, italic ₽, both ₽, strike ₽.", expectedFallbackFamilies: ["DocmarkSignatureSans"], expectedFontFamilies: ["DocmarkSignatureSans-Bold", "DocmarkSignatureSans-Italic", "DocmarkSignatureSans-BoldItalic"] },
    { name: "unicode-monospace", source: "```text\n    price = \"₽\"\n    next = \"e\u0301\"\n```", expected: ["price", "=", "₽", "next", "é"], expectedFallbackFamilies: ["DocmarkSignatureSans"], expectedFontFamilies: ["LiberationMono", "DocmarkSignatureSans"] },
    { name: "unicode-unsupported-glyphs", source: "Unavailable: 😀 漢字.", expected: ["Unavailable", "[U+1F600]", "[U+6F22]", "[U+5B57]"], expectedUnsupportedCodePoints: ["U+1F600", "U+6F22", "U+5B57"] },
    { name: "unicode-fallback-link", source: "[A₽B](https://example.com/fallback)", expected: ["A", "₽", "B"], expectedTextSequence: "A₽B", expectedFallbackFamilies: ["DocmarkSignatureSans"], expectedLinks: ["https://example.com/fallback"] },
    { name: "unicode-advanced-latin", source: "Crème brûlée — “Office”, ‘affinity’… £ € ¥ ₽ © ® ™; fi fl ffi.", expected: ["Crème", "brûlée", "Office", "affinity", "ffi"], expectedFallbackFamilies: ["DocmarkSignatureSans"] },
    {
      name: "unicode-nfc-nfd-comparison",
      source: "NFC_cafe[café]; NFD_cafe[cafe\u0301]; NFC_n[ñ]; NFD_n[n\u0303]; NFC_u[ü]; NFD_u[u\u0308]; stacked[a\u0308\u0304].",
      expected: ["NFC_cafe", "NFD_cafe", "NFC_n", "NFD_n", "NFC_u", "NFD_u", "stacked"],
      expectedTextSequence: "NFC_cafe[café]; NFD_cafe[café]; NFC_n[ñ]; NFD_n[ñ]; NFC_u[ü]; NFD_u[ü]; stacked[ǟ].",
      extractionSamples: [
        { label: "NFC_cafe", source: "café" }, { label: "NFD_cafe", source: "cafe\u0301" },
        { label: "NFC_n", source: "ñ" }, { label: "NFD_n", source: "n\u0303" },
        { label: "NFC_u", source: "ü" }, { label: "NFD_u", source: "u\u0308" },
        { label: "stacked", source: "a\u0308\u0304" },
      ],
      expectedDiagnostics: ["Decomposed Unicode", "code-point-identical"],
    },
    {
      name: "unicode-code-extraction",
      source: "Plain_NFD[cafe\u0301]; inline `NFD_inline[cafe\u0301]`.\n\n```text\n    NFD_fenced[cafe\u0301]\n```",
      expected: ["Plain_NFD", "NFD_inline", "NFD_fenced"],
      extractionSamples: [
        { label: "Plain_NFD", source: "cafe\u0301" },
        { label: "NFD_inline", source: "cafe\u0301" },
        { label: "NFD_fenced", source: "cafe\u0301" },
      ],
      expectedDiagnostics: ["Decomposed Unicode", "exact code retrieval"],
    },
    {
      name: "unicode-technical-symbols",
      source: "∑ ∏ √ ∞ ≠ ≤ ≥ ± → ← ↔ ⇒ ⇔ € £ ¥ ₽ © ® ™ ∈ 🔒 ⚠ ⚠️",
      expected: ["∑", "∏", "√", "∞", "≠", "≤", "≥", "±", "→", "←", "↔", "⇒", "⇔", "€", "£", "¥", "₽", "©", "®", "™", "🔒", "⚠", "[U+26A0+U+FE0F]"],
      expectedFallbackFamilies: ["DocmarkSignatureSans", "DejaVuMathTeXGyre", "NotoSansSymbols2"],
      expectedUnsupportedCodePoints: ["U+26A0", "U+FE0F"],
    },
    {
      name: "emoji-standalone",
      source: "Qualified monochrome glyphs: 🔒 ⚠. Unresolved emoji: 😀 🚀 ✅ ❌ 📄.",
      expected: ["🔒", "⚠", "[U+1F600]", "[U+1F680]", "[U+2705]", "[U+274C]", "[U+1F4C4]"],
      expectedFallbackFamilies: ["NotoSansSymbols2"],
      expectedUnsupportedCodePoints: ["U+1F600", "U+1F680", "U+2705", "U+274C", "U+1F4C4"],
    },
    {
      name: "emoji-complex-sequences",
      source: "Unqualified sequences: ⚠️ 👩🏽‍💻 🇺🇳 1️⃣.",
      expected: ["[U+26A0+U+FE0F]", "[U+1F469+U+1F3FD+U+200D+U+1F4BB]", "[U+1F1FA+U+1F1F3]", "[U+0031+U+FE0F+U+20E3]"],
      expectedUnsupportedCodePoints: ["U+FE0F", "U+1F469", "U+1F3FD", "U+200D", "U+1F1FA", "U+20E3"],
    },
    {
      name: "unicode-unsupported-scripts",
      source: "Japanese こんにちは; Chinese 漢字; Korean 한글; Arabic مرحبا; Hebrew שלום; Hindi नमस्ते.",
      expected: ["Japanese", "Chinese", "Korean", "Arabic", "Hebrew", "Hindi", "[U+0645]", "[U+05E9]"],
      expectedUnsupportedCodePoints: ["U+0645", "U+05E9"],
      expectedDiagnostics: ["Bidirectional ordering is not supported"],
    },
    {
      name: "integrated-technical-document",
      source: "# Integrated technical export\n\nEspañol: acción, niño, pingüino; NFD cafe\u0301; **bold**, *italic*, ***both***. Safe [link](https://example.com/integrated).\n\n- Lista uno ₽\n- Lista dos ∈ ⇒ 🔒 ⚠\n\n| Elemento | Valor |\n|---|---:|\n| Precio | ₽ 12 |\n| Emoji | 🔒 ⚠️ 😀 |\n\n```python\n    total = 12\n    print(total)\n```\n\nMixed: Hello (שלום), Arabic مرحبا, 123.\n\n:::pagebreak\n:::\n\n## Continuation\n\nSecond page remains selectable; code-point markers are explicit.",
      expected: ["Integrated technical export", "acción", "U+05E9", "U+0645", "U+1F600", "Continuation", "Second page"],
      expectedPages: [["Integrated technical export"], ["Continuation"]],
      expectedFallbackFamilies: ["DocmarkSignatureSans", "DejaVuMathTeXGyre", "NotoSansSymbols2"],
      expectedLinks: ["https://example.com/integrated"],
      expectedDiagnostics: ["Decomposed Unicode", "Bidirectional ordering is not supported", "Qualified shaping is unsupported"],
      securityInspection: true,
    },
    {
      name: "integrated-font-fallback",
      source: "# Serif and fallback integration\n\nPrimary serif text, **bold**, *italic*, and ***combined emphasis***.\n\nCurrency ₽; operators ∈ ⇒; pictographs 🔒 ⚠.\n\n```text\n    fixed width = true\n```\n\n[Safe destination](https://example.com/font-integration)",
      options: { settings: { typography: { fontFamily: "Georgia" } } },
      expected: ["Serif and fallback integration", "Currency", "₽", "∈", "⇒", "🔒", "⚠", "fixed", "width"],
      expectedFallbackFamilies: ["LiberationSerif", "DocmarkSignatureSans", "DejaVuMathTeXGyre", "NotoSansSymbols2", "LiberationMono"],
      expectedLinks: ["https://example.com/font-integration"],
      securityInspection: true,
    },
  ];
  const familyMarkdown = `# Tipografía española\n\nNormal: acción, niño, pingüino, ¿Qué tal? ¡Sí!\n\n**Negrita**, *cursiva* y ***negrita cursiva***.\n\nCódigo en línea: \`monoToken\`.\n\n\`\`\`text\niiii\nWWWW\n    cuatro espacios\n\`\`\``;
  const familyCases = [
    ["font-family-arial", "Arial", "LiberationSans"],
    ["font-family-helvetica", "Helvetica", "LiberationSans"],
    ["font-family-georgia", "Georgia", "LiberationSerif"],
    ["font-family-times-new-roman", "Times New Roman", "LiberationSerif"],
    ["font-family-courier-new", "Courier New", "LiberationMono"],
    ["font-family-montserrat", "Montserrat", "DocmarkSignatureSans"],
  ].map(([name, fontFamily, expectedFontFamily]) => ({
    name,
    source: familyMarkdown,
    options: { settings: { typography: { fontFamily } } },
    expected: ["acción", "niño", "pingüino", "Negrita", "cursiva", "monoToken", "cuatro", "espacios"],
    expectedFontFamily,
    expectedVariants: ["Regular", "Bold", "Italic", "BoldItalic"],
    documentFontFamily: fontFamily,
  }));
  cases.push(...familyCases);

  const artifactAliases = [
    ["font-variants.pdf", "font-family-montserrat.pdf"],
    ["sans-serif-document.pdf", "font-family-arial.pdf"],
    ["serif-document.pdf", "font-family-georgia.pdf"],
    ["monospace-code.pdf", "code-indentation.pdf"],
    ["spanish-unicode.pdf", "unicode-document.pdf"],
    ["font-substitution.pdf", "font-family-georgia.pdf"],
  ];
  const retainedPdfs = new Set([
    ...cases.map(({ name }) => `${name}.pdf`),
    ...artifactAliases.map(([alias]) => alias),
    "font-family-comparison.pdf",
    "editor-download.pdf",
    "editor-montserrat-download.pdf",
    "editor-vinext-download.pdf",
  ]);
  for (const existing of await readdir(out)) {
    if (existing.endsWith(".pdf") && !retainedPdfs.has(existing)) await unlink(path.join(out, existing));
  }
  const report = {
    runtime: "Vite browser harness using Docmark's production semantic model, PDF adapter, registry, and pdfmake 0.3.15 browser build",
    externalRequests,
    documents: {},
    lineHeightMeasurements: {},
    generationMeasurements: [],
    fontCoverage: {
      metadataPath: "src/lib/pdf/fonts/coverage.generated.json",
      metadataBytes: coverageMetadataBytes,
      schemaVersion: coverageMetadata.schemaVersion,
      generator: coverageMetadata.generator,
      fontToolsVersion: coverageMetadata.fontToolsVersion,
      assets: Object.fromEntries(Object.entries(coverageMetadata.assets).map(([assetPath, asset]) => [assetPath, {
        sha256: asset.sha256,
        bytes: asset.bytes,
        codePoints: asset.codePoints,
        ranges: asset.ranges.length,
      }])),
    },
  };

  for (const item of cases) {
    const generationStart = performance.now();
    const result = await page.evaluate(([source, options]) => window.generatePdf(source, options), [item.source, item.options ?? {}]);
    assert.ok(!result.error, `${item.name}: ${result.error ?? ""} ${result.cause ?? ""} fonts=${JSON.stringify(result.fonts)} assets=${JSON.stringify(result.assets)}`);
    const generationMs = performance.now() - generationStart;
    const bytes = Buffer.from(result.bytes);
    assert.ok(bytes.subarray(0, 5).equals(Buffer.from("%PDF-")), `${item.name}: PDF signature`);
    const file = path.join(out, `${item.name}.pdf`);
    await writeFile(file, bytes);
    const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    const pages = [];
    const pdfjsRawPages = [];
    const annotations = [];
    const pageViews = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const current = await pdf.getPage(pageNumber);
      const content = await current.getTextContent();
      const textItems = content.items.map((entry) => "str" in entry ? entry.str : "");
      pages.push(textItems.join(" "));
      pdfjsRawPages.push(textItems.join(""));
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
    if (item.expectedFontFamily) {
      const fontNames = fonts.stdout.split("\n").slice(2).map((line) => line.trim().split(/\s+/)[0]).filter(Boolean);
      for (const variant of item.expectedVariants ?? ["Regular"]) {
        const expectedName = variant === "Regular" && !item.expectedFontFamily.startsWith("Docmark")
          ? item.expectedFontFamily
          : `${item.expectedFontFamily}-${variant}`;
        assert.ok(fontNames.some((name) => name.endsWith(expectedName)), `${item.name}: expected embedded ${expectedName}; found ${fontNames.join(", ")}`);
      }
      const relevantRows = fonts.stdout.split("\n").slice(2).filter((line) => line.trim() && line.includes(item.expectedFontFamily));
      assert.ok(relevantRows.length > 0, `${item.name}: expected embedded family ${item.expectedFontFamily}`);
      assert.ok(relevantRows.every((line) => /yes\s+yes\s+yes/.test(line)), `${item.name}: every ${item.expectedFontFamily} face must be embedded, subset, and have Unicode mapping`);
    }
    const fontNames = fonts.stdout.split("\n").slice(2).map((line) => line.trim().split(/\s+/)[0]).filter(Boolean);
    if (item.expectedOnlyFonts) {
      const actualFamilies = fontNames.map((name) => name.replace(/^[A-Z]{6}\+/, "")).sort();
      assert.deepEqual(actualFamilies, [...item.expectedOnlyFonts].sort(), `${item.name}: unexpected font assets were embedded`);
    }
    for (const family of item.expectedFontFamilies ?? []) {
      assert.ok(fontNames.some((name) => name.includes(family)), `${item.name}: expected actual embedded font ${family}; found ${fontNames.join(", ")}`);
    }
    for (const family of item.expectedFallbackFamilies ?? []) {
      assert.ok(fontNames.some((name) => name.includes(family)), `${item.name}: expected actual fallback font ${family}; found ${fontNames.join(", ")}`);
    }
    if (item.name === "code-indentation") {
      const codePdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
      const codePage = await codePdf.getPage(1);
      const items = (await codePage.getTextContent()).items.filter((entry) => "str" in entry);
      const find = (needle) => items.find((entry) => entry.str.includes(needle));
      const zero = find("def");
      const one = find("first");
      const nested = find("nested");
      assert.ok(zero && one && nested, "Python code lines must be extractable");
      assert.ok(one.transform[4] - zero.transform[4] > 8, "four leading spaces must move the text's physical x position");
      assert.ok(nested.transform[4] - one.transform[4] > 8, "nested indentation must move text further right");
      assert.ok(zero.transform[5] - one.transform[5] > 8, "multiline code must be vertically composed");
      const narrow = items.find((entry) => entry.str.trim() === "iiii");
      const wide = items.find((entry) => entry.str.trim() === "WWWW");
      if (narrow && wide) assert.ok(Math.abs(narrow.width - wide.width) < 0.05, "equal-length code strings must have equal mono advances");
      assert.ok(fonts.stdout.includes("LiberationMono"), "fenced code must embed the dedicated mono family");
    }
    if (item.name === "unicode-monospace") {
      const codeItems = (await (await pdf.getPage(1)).getTextContent()).items.filter((entry) => "str" in entry);
      const price = codeItems.find((entry) => entry.str.includes("price"));
      const next = codeItems.find((entry) => entry.str.includes("next"));
      assert.ok(price && next, "Unicode code lines remain extractable");
      assert.ok(price.transform[4] > 70, "fenced code retains four-space indentation despite font fallback");
      assert.ok(Math.abs(price.transform[4] - next.transform[4]) < 0.05, "code indentation remains aligned across fallback runs");
      assert.ok(fontNames.some((name) => name.includes("LiberationMono")), "code embeds its configured monospace face");
    }
    if (item.documentFontFamily) {
      const codePage = await pdf.getPage(1);
      const codeItems = (await codePage.getTextContent()).items.filter((entry) => "str" in entry);
      const narrow = codeItems.find((entry) => entry.str.trim() === "iiii");
      const wide = codeItems.find((entry) => entry.str.trim() === "WWWW");
      assert.ok(narrow && wide, `${item.name}: representative code strings must remain extractable`);
      assert.ok(Math.abs(narrow.width - wide.width) < 0.05, `${item.name}: monospaced characters must have equal advances`);
      assert.match(fonts.stdout, /LiberationMono/);
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
    if (item.securityInspection) {
      const actualUrls = annotations.map((annotation) => annotation.url).filter(Boolean);
      assert.deepEqual([...new Set(actualUrls)].sort(), [...(item.expectedLinks ?? [])].sort(), `${item.name}: only its declared safe URI links are present`);
      assert.ok(annotations.every((annotation) => annotation.subtype === "Link"), `${item.name}: annotations are limited to links`);
      assert.equal(await pdf.getAttachments(), null, `${item.name}: no embedded files`);
      assert.equal(await pdf.getJSActions(), null, `${item.name}: no JavaScript actions`);
      const inspection = spawnSync("python3", [
        "scripts/inspect_pdf_actions.py", file,
        ...(item.expectedLinks ?? []).flatMap((url) => ["--allow-uri", url]),
      ], { encoding: "utf8" });
      assert.equal(inspection.status, 0, `${item.name}: ${inspection.stderr}`);
      (report.integratedSecurityInspections ??= {})[item.name] = JSON.parse(inspection.stdout);
    }
    const textFile = spawnSync("pdftotext", ["-enc", "UTF-8", file, "-"], { encoding: "utf8" });
    assert.equal(textFile.status, 0, `${item.name}: pdftotext failed: ${textFile.stderr}`);
    if (item.expectedTextSequence) assert.ok(textFile.stdout.includes(item.expectedTextSequence), `${item.name}: fallback inserted whitespace or changed text order`);
    if (item.extractionSamples) {
      for (const sample of item.extractionSamples) {
        const pdfjsText = extractBracketed(pdfjsRawPages.join("\n"), sample.label);
        const popplerText = extractBracketed(textFile.stdout, sample.label);
        const comparison = {
          label: sample.label,
          sourceCodePoints: toCodePoints(sample.source),
          pdfjsCodePoints: toCodePoints(pdfjsText),
          popplerCodePoints: toCodePoints(popplerText),
          pdfjsExactCodePointMatch: pdfjsText === sample.source,
          popplerExactCodePointMatch: popplerText === sample.source,
          pdfjsCanonicallyEquivalent: pdfjsText.normalize("NFC") === sample.source.normalize("NFC"),
          popplerCanonicallyEquivalent: popplerText.normalize("NFC") === sample.source.normalize("NFC"),
        };
        assert.equal(comparison.pdfjsCanonicallyEquivalent, true, `${item.name}/${sample.label}: PDF.js text must remain canonically equivalent`);
        assert.equal(comparison.popplerCanonicallyEquivalent, true, `${item.name}/${sample.label}: Poppler text must remain canonically equivalent`);
        (report.unicodeExtractionComparisons ??= []).push({ document: item.name, ...comparison });
      }
    }
    for (const codePoint of item.expectedUnsupportedCodePoints ?? []) {
      assert.ok(result.diagnostics.some(({ message }) => message.includes(codePoint)), `${item.name}: missing visible diagnostic for ${codePoint}`);
    }
    for (const diagnostic of item.expectedDiagnostics ?? []) {
      assert.ok(result.diagnostics.some(({ message }) => message.includes(diagnostic)), `${item.name}: missing diagnostic ${diagnostic}`);
    }
    for (const link of item.expectedLinks ?? []) assert.ok(annotations.some(({ url }) => url === link), `${item.name}: missing safe link annotation ${link}`);
    if (item.name === "unicode-combining-marks") {
      assert.ok((textFile.stdout.match(/café/g) ?? []).length >= 2, "both NFC and NFD source examples remain extractable; the PDF shaper may canonical-compose NFD output");
      assert.ok(textFile.stdout.includes("a\u0308\u0304".normalize("NFC")), "stacked marks remain extractable after the font shaper's canonical composition");
    }
    if (item.name === "unicode-monospace") {
      assert.ok(textFile.stdout.includes('next = "é"'), "pdfmake/fontkit currently canonical-composes NFD inside code during PDF shaping; source Markdown is not changed");
    }
    if (item.name.startsWith("font-family-")) {
      for (const expected of ["acción", "niño", "pingüino"]) assert.ok(textFile.stdout.includes(expected), `${item.name}: pdftotext omitted ${expected}`);
      if (item.documentFontFamily === "Montserrat") {
        assert.ok(!result.diagnostics.some(({ message }) => message.includes("Montserrat is approximated")), "the OFL Montserrat design mapping should not report a substitution");
      } else {
        assert.ok(result.diagnostics.some(({ kind, message }) => kind === "approximation" && message.includes("embedded")), `${item.name}: selected document family should disclose its embedded approximation`);
      }
    }
    report.documents[item.name] = {
      bytes: bytes.length,
      pages: pdf.numPages,
      generationMs,
      documentFontFamily: item.documentFontFamily ?? null,
      pageTexts: pages,
      dimensions: pageViews,
      textAssertions: item.expected ?? [],
      fonts: fonts.stdout,
      annotations: annotations.map(({ subtype, url }) => ({ subtype, url })),
      diagnostics: result.diagnostics,
      fontResolution: {
        embeddedFonts: fontNames,
        expectedFallbackFamilies: item.expectedFallbackFamilies ?? [],
        unsupportedCodePoints: item.expectedUnsupportedCodePoints ?? [],
        qualifiedFallbackFamilies: item.expectedFallbackFamilies ?? [],
        extractedRawTextCodePoints: toCodePoints(pdfjsRawPages.join("\n")),
      },
    };
    report.generationMeasurements.push({ name: item.name, generationMs, outputBytes: bytes.length });
  }

  assert.ok(
    report.lineHeightMeasurements["line-height-loose"] > report.lineHeightMeasurements["line-height-compact"] * 1.3,
    "the selected line height must change actual PDF line spacing",
  );

  const comparisonFile = path.join(out, "font-family-comparison.pdf");
  const merge = spawnSync("python3", ["-c", "import sys; from pypdf import PdfWriter; w=PdfWriter(); [w.append(p) for p in sys.argv[2:]]; w.write(sys.argv[1])", comparisonFile, ...familyCases.map(({ name }) => path.join(out, `${name}.pdf`))], { encoding: "utf8" });
  assert.equal(merge.status, 0, merge.stderr);
  for (const [alias, source] of artifactAliases) await copyFile(path.join(out, source), path.join(out, alias));
  const comparisonPdf = await getDocument({ data: new Uint8Array(await readFile(comparisonFile)), useSystemFonts: true }).promise;
  assert.equal(comparisonPdf.numPages, familyCases.length, "comparison PDF must include one production-generated page per selectable family");
  report.comparisonDocument = { path: "font-family-comparison.pdf", pages: comparisonPdf.numPages, componentDocuments: familyCases.map(({ name }) => `${name}.pdf`) };

  const featureProbe = await page.evaluate(() => window.probePdfmakeFontFeatures("NFD[cafe\u0301]", { ccmp: false, liga: false }));
  const featureProbeBytes = Buffer.from(featureProbe.bytes);
  const featureProbePath = path.join(out, "unicode-fontfeatures-disabled.pdf");
  await writeFile(featureProbePath, featureProbeBytes);
  const featureProbePdf = await getDocument({ data: new Uint8Array(featureProbeBytes), useSystemFonts: true }).promise;
  const featureProbeText = (await (await featureProbePdf.getPage(1)).getTextContent()).items.filter((entry) => "str" in entry).map((entry) => entry.str).join("");
  const featureProbePoppler = spawnSync("pdftotext", ["-enc", "UTF-8", featureProbePath, "-"], { encoding: "utf8" });
  assert.equal(featureProbePoppler.status, 0, featureProbePoppler.stderr);
  assert.ok(featureProbeText.includes("NFD[café]"), "disabling ccmp and liga does not stop fontkit's canonical composition stage");
  assert.ok(featureProbePoppler.stdout.includes("NFD[café]"), "Poppler reports the same canonical composition with ccmp and liga disabled");

  const precomposedProbeText = "café";
  const decomposedProbeText = "cafe\u0301";
  const actualTextProbe = spawnSync("node", ["scripts/probe-pdfkit-actualtext.mjs"], { encoding: "utf8" });
  assert.equal(actualTextProbe.status, 0, `${actualTextProbe.stderr}${actualTextProbe.stdout}`);
  const actualTextPath = path.join(out, "pdfkit-actualtext-nfd-probe.pdf");
  const actualTextBytes = await readFile(actualTextPath);
  const actualTextPdf = await getDocument({ data: new Uint8Array(actualTextBytes), useSystemFonts: true }).promise;
  const actualTextPdfJs = (await (await actualTextPdf.getPage(1)).getTextContent()).items.filter((entry) => "str" in entry).map((entry) => entry.str).join("");
  const actualTextPoppler = spawnSync("pdftotext", ["-enc", "UTF-8", actualTextPath, "-"], { encoding: "utf8" });
  assert.equal(actualTextPoppler.status, 0, actualTextPoppler.stderr);
  const actualTextContainsNfd = (text) => text.includes("cafe\u0301");
  assert.equal(actualTextContainsNfd(actualTextPdfJs), false, "PDF.js ignores this non-structural ActualText marked-content value and extracts the visible NFC glyph");
  assert.equal(actualTextContainsNfd(actualTextPoppler.stdout), true, "Poppler extracts the NFD ActualText value in the direct PDFKit API probe");
  const actualTextStream = spawnSync("python3", ["-c", "from pypdf import PdfReader; import sys; print('/ActualText' in PdfReader(sys.argv[1]).pages[0].get_contents().get_data().decode('latin1'))", actualTextPath], { encoding: "utf8" });
  assert.equal(actualTextStream.status, 0, actualTextStream.stderr);
  assert.equal(actualTextStream.stdout.trim(), "True", "PDFKit writes an ActualText marked-content property");
  const toUnicodeInspection = spawnSync("python3", ["-c", [
    "import json, sys",
    "from pypdf import PdfReader",
    "reader = PdfReader(sys.argv[1])",
    "fonts = reader.pages[0]['/Resources']['/Font'].get_object()",
    "result = []",
    "for name, ref in fonts.items():",
    " font = ref.get_object(); stream = font.get('/ToUnicode')",
    " if stream:",
    "  cmap = stream.get_object().get_data().decode('latin1')",
    "  result.append({'font': str(font.get('/BaseFont')), 'cmap': cmap})",
    "print(json.dumps(result))",
  ].join("\n"), path.join(out, "unicode-nfc-nfd-comparison.pdf")], { encoding: "utf8" });
  assert.equal(toUnicodeInspection.status, 0, toUnicodeInspection.stderr);
  const toUnicodeMaps = JSON.parse(toUnicodeInspection.stdout);
  assert.ok(toUnicodeMaps.some(({ cmap }) => cmap.toLowerCase().includes("<00e9>")), "ToUnicode maps the composed e-acute code point");
  assert.ok(toUnicodeMaps.every(({ cmap }) => !cmap.toLowerCase().includes("<0301>")), "ToUnicode has no decomposed acute mapping when fontkit composed the source cluster");
  report.nfdInvestigation = {
    versions: { pdfmake: "0.3.15", pdfkit: "0.21.0", fontkit: "3.0.0", pdfjsDist: "6.5.438", poppler: "25.03.0" },
    findings: [
      { stage: "Docmark segmentation and resolver", result: "Preserve source code points; unit tests assert run concatenation equals the original input." },
      { stage: "pdfmake text API", result: "The supported fontFeatures option reaches PDFKit, but ccmp:false and liga:false do not disable fontkit's earlier grapheme mark composition." },
      { stage: "fontkit shaping", result: "DefaultShaper.assignFeatures calls composeGlyphs; composeCodePoints decomposes to NFD and recomposes to a cmap-supported NFC glyph before OpenType feature application." },
      { stage: "PDFKit ToUnicode", result: "PDFKit records each shaped glyph's glyph.codePoints; therefore the precomposed glyph's code point is what appears in ToUnicode." },
      { stage: "PDF.js and Poppler", result: "Both extract canonical NFC from the production pdfmake fixture, including code, while remaining visually canonical-equivalent." },
      { stage: "ActualText", result: "The direct public PDFKit markContent('Span', { actual }) API writes /ActualText; Poppler honors it but this PDF.js version ignores non-structural ActualText and extracts the visible NFC glyph. pdfmake has no supported per-inline ActualText option or hook to call it during Renderer.drawLine, so this cannot safely fix production output." },
    ],
    toUnicodeInspection: { document: "unicode-nfc-nfd-comparison.pdf", maps: toUnicodeMaps, containsComposedEAcuteMapping: true, containsCombiningAcuteMapping: false },
    fontFeaturesProbe: { path: "unicode-fontfeatures-disabled.pdf", fontFeatures: featureProbe.fontFeatures, pdfjsText: featureProbeText, popplerText: featureProbePoppler.stdout.trim(), nfdPreservedByEither: false },
    directPdfkitActualTextProbe: { path: "pdfkit-actualtext-nfd-probe.pdf", containsActualTextMarkedContent: true, visibleText: precomposedProbeText, sourceActualText: decomposedProbeText, pdfjsCodePoints: toCodePoints(actualTextPdfJs), pdfjsHonorsActualText: false, popplerCodePoints: toCodePoints(actualTextPoppler.stdout.trim()), popplerExtractsExactNfd: true, productionPdfmakeUsesThisApi: false },
  };

  const woff2Probe = await page.evaluate(() => window.probePdfFontFormat("/fonts/montserrat/Montserrat-Regular.woff2", "woff2"));
  report.formatCompatibility = {
    pdfmakeVersion: "0.3.15",
    trueType: { status: "supported-and-verified", evidence: "All supported family and variant acceptance PDFs parsed with PDF.js and reported embedded/subset/Unicode mappings with pdffonts." },
    woff: { status: "supported-and-verified", probe: "Transient WOFF conversion of Liberation Sans Regular using fontTools 4.61.1; not redistributed", inputBytes: 209924, generatedPdfBytes: 7027 },
    woff2: { status: woff2Probe.supported ? "supported" : "unsupported", error: woff2Probe.error ?? null, probePdfBytes: woff2Probe.bytes ?? null },
    staticOpenTypeCff: { status: "supported-and-verified", probe: "NimbusSans-Regular.otf (system-only test input, not redistributed)", inputBytes: 82264, generatedPdfBytes: 4624, note: "A separate Chromium call through the same installed pdfmake browser build generated a PDF Blob from a static CFF OpenType face. Phase A registry assets remain TrueType." },
    trueTypeCollections: { status: "unsupported-in-probe", probe: "Two-face Liberation Sans collection built transiently with fontTools 4.61.1; not redistributed", inputBytes: 821448, error: "this.font.createSubset is not a function", note: "The browser PDFMake code accepts TTC-style array descriptors, but embedding/subsetting failed for this collection." },
    variableFonts: { status: "parsed-but-not-axis-selectable", probe: "Pinned Montserrat variable TTF parsed by PDFMake browser build and generated a PDF Blob", inputBytes: 744936, generatedPdfBytes: 6220, note: "pdfmake font registration exposes separate normal/bold/italic file slots but no variable-axis selection; Phase A uses static 400/700 instances to produce reliable variants." },
  };

  const nativeFontInventory = {};
  for (const [familyId, family] of Object.entries(PDF_FONT_REGISTRY)) {
    const variants = {};
    for (const [variant, asset] of Object.entries(family.variants)) {
      const file = path.join(root, "public", asset.path.slice(1));
      const bytes = await readFile(file);
      const hash = createHash("sha256").update(bytes).digest("hex");
      assert.equal(hash, asset.sha256, `registry hash mismatch for ${asset.path}`);
      assert.deepEqual([...bytes.subarray(0, 4)], [0, 1, 0, 0], `${asset.fileName} must be a TrueType outline font`);
      variants[variant] = { path: asset.path, bytes: bytes.length, sha256: hash, format: "TrueType sfnt" };
    }
    const licensePath = path.join(root, "public", family.license.path.slice(1));
    const licenseText = await readFile(licensePath, "utf8");
    if (family.license.id === "SIL-OFL-1.1") assert.match(licenseText, /SIL OPEN FONT LICENSE Version 1\.1/);
    else if (family.license.id === "Bitstream-Vera") assert.match(licenseText, /Permission is hereby granted, free of charge/);
    else assert.fail(`Unvalidated font license ${family.license.id}`);
    nativeFontInventory[familyId] = {
      displayName: family.displayName,
      category: family.category,
      variants,
      uniqueAssetPaths: [...new Set(Object.values(variants).map(({ path }) => path))],
      totalVariantBytes: [...new Map(Object.values(variants).map((variant) => [variant.path, variant.bytes])).values()].reduce((sum, bytes) => sum + bytes, 0),
      license: { id: family.license.id, path: family.license.path, sourceUrl: family.license.sourceUrl },
      provenance: family.provenance,
    };
  }
  const browserMontserrat = {};
  for (const fileName of ["Montserrat-Regular.woff2", "Montserrat-SemiBold.woff2", "Montserrat-Bold.woff2"]) {
    const filePath = path.join(root, "public/fonts/montserrat", fileName);
    const bytes = await readFile(filePath);
    browserMontserrat[fileName] = { path: `/fonts/montserrat/${fileName}`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), format: "WOFF2, HTML/print only" };
  }
  const expectedBinaryPaths = new Set([
    ...Object.values(nativeFontInventory).flatMap(({ variants }) => Object.values(variants).map(({ path: assetPath }) => assetPath)),
    ...Object.values(browserMontserrat).map(({ path: assetPath }) => assetPath),
  ]);
  const listPublicFontBinaries = async (directory = "public/fonts") => {
    const result = [];
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) result.push(...await listPublicFontBinaries(relative));
      else if (/\.(?:ttf|woff2)$/i.test(entry.name)) result.push(`/${relative.slice("public/".length)}`);
    }
    return result;
  };
  const actualBinaryPaths = await listPublicFontBinaries();
  assert.deepEqual([...actualBinaryPaths].sort(), [...expectedBinaryPaths].sort(), "Every distributed font binary is inventoried and no proprietary/unregistered face is shipped");
  const fontIntegrityAssets = [];
  for (const [familyId, family] of Object.entries(PDF_FONT_REGISTRY)) {
    const uniqueVariants = new Map(Object.entries(family.variants).map(([variant, asset]) => [asset.path, { variant, asset }]));
    for (const { variant, asset } of uniqueVariants.values()) {
      const file = path.join(root, "public", asset.path.slice(1));
      const fontNames = spawnSync("python3", ["-c", [
        "import json, sys",
        "from fontTools.ttLib import TTFont",
        "font = TTFont(sys.argv[1], lazy=True)",
        "table = font['name']",
        "print(json.dumps([{'id': record.nameID, 'name': record.toUnicode()} for record in table.names if record.nameID in (1, 4, 6, 16, 18)]))",
        "font.close()",
      ].join("\n"), file], { encoding: "utf8" });
      assert.equal(fontNames.status, 0, `${asset.path}: ${fontNames.stderr}`);
      const names = JSON.parse(fontNames.stdout).map(({ name }) => name);
      assert.ok(names.some((name) => name === family.internalFamilyName || name.startsWith(`${family.internalFamilyName} `)), `${asset.path}: internal name should identify ${family.internalFamilyName}`);
      if (familyId === "DocmarkSignatureSans") assert.ok(names.every((name) => !/Montserrat/i.test(name)), "modified Montserrat derivatives must not retain the OFL-reserved family name");
      fontIntegrityAssets.push({
        familyId,
        variant,
        path: asset.path,
        bytes: (await readFile(file)).length,
        sha256: createHash("sha256").update(await readFile(file)).digest("hex"),
        expectedSha256: asset.sha256,
        internalNames: [...new Set(names)],
      });
    }
  }
  const fontIntegrity = {
    checkedAt: new Date().toISOString(),
    distributedBinaryCount: actualBinaryPaths.length,
    nativeFamilyCount: Object.keys(PDF_FONT_REGISTRY).length,
    uniqueNativeAssetCount: new Set(fontIntegrityAssets.map(({ path: assetPath }) => assetPath)).size,
    noUnregisteredOrProprietaryBinaryAssets: true,
    assets: fontIntegrityAssets,
    browserOnlyMontserratAssets: Object.entries(browserMontserrat).map(([fileName, asset]) => ({ fileName, ...asset })),
    licenseChecks: Object.entries(nativeFontInventory).map(([familyId, family]) => ({ familyId, ...family.license })),
    cacheNotes: {
      loader: "The module-level loader retains one Uint8Array per successfully loaded path and deduplicates concurrent/repeated fetches. Failed promises are removed so subsequent exports retry.",
      pdfmake: "Installed pdfmake 0.3.15 addVirtualFileSystem decodes each base64 VFS value to a Buffer and writes it into persistent shared VirtualFileSystem storage. Same filenames overwrite; distinct previously used font files remain for the browser session. addFonts replaces top-level descriptors per family, so previous variant mappings do not leak into the next export.",
      duplicates: "One raw Uint8Array cache and one pdfmake VFS Buffer persist per requested face, plus transient base64 conversion and PDF embedding/subset buffers during generation. pdfmake exposes no supported VFS eviction API; no internal storage mutation or persistent browser cache was added.",
    },
  };
  await writeFile(path.join(out, "font-integrity-report.json"), JSON.stringify(fontIntegrity, null, 2));
  const fontInventory = {
    documentFamilies: Object.entries(DOCUMENT_FONT_REGISTRY).map(([id, definition]) => ({ id, cssFamily: definition.cssFamily, source: definition.source, weights: definition.weights ?? [] })),
    nativeMappings: DOCUMENT_PDF_FONT_MAPPINGS,
    defaultDocumentFamily: "Arial",
    defaultMonospaceFamily: "LiberationMono",
    nativeFonts: nativeFontInventory,
    integrityReport: "font-integrity-report.json",
    existingHtmlMontserrat: browserMontserrat,
    coverage: report.fontCoverage,
    formatCompatibility: report.formatCompatibility,
    dependency: { pdfmake: "0.3.15", additionalRuntimeFontDependencies: [] },
  };
  await writeFile(path.join(out, "font-inventory.json"), JSON.stringify(fontInventory, null, 2));

  await Promise.all(pendingTransferReads);
  const uniqueTransfers = [...new Map(resourceTransfers.map((item) => [item.path, item])).values()];
  report.resourceMeasurements = {
    observedColdAssetTransfers: uniqueTransfers,
    observedUniqueTransferBytes: uniqueTransfers.reduce((sum, item) => sum + item.bytes, 0),
    pdfmakeBytes: uniqueTransfers.filter(({ path }) => path.includes("pdfmake")).reduce((sum, item) => sum + item.bytes, 0),
    pdfFontBytes: uniqueTransfers.filter(({ path }) => path.startsWith("/fonts/") && path.endsWith(".ttf")).reduce((sum, item) => sum + item.bytes, 0),
    note: "Measured response-body bytes from the actual browser harness. Repeated family variants and exports share the browser loader cache during this run; these are observations, not a performance budget.",
  };
  report.unicodeNormalization = {
    sourceMutation: false,
    rendererObservation: "Markdown and semantic text remain unchanged. pdfmake/fontkit composes Latin NFD sequences to NFC in generated PDF text extraction, including code runs; the engine does not normalize source or code before calling pdfmake.",
    compatibilityNormalizationNfkcAppliedByDocmark: false,
  };
  report.unicodeQualificationMatrix = {
    qualifiedTextSamples: [
      { range: "Spanish and extended Latin", evidence: "NFC text, PDF.js/Poppler extraction, real embedded fonts; NFD equivalents are canonically composed by fontkit." },
      { range: "Greek and Cyrillic", evidence: "Representative Greek/Cyrillic acceptance document; glyphs embedded and extracted." },
      { range: "selected math and technical symbols", evidence: "Primary-face symbols plus measured DejaVu Math TeX Gyre fallback for U+2208 (∈) and U+21D2 (⇒); exact PDF.js/Poppler text extraction." },
      { range: "monochrome pictographs", evidence: "Noto Sans Symbols2 standalone U+1F512 (🔒) and U+26A0 (⚠) generated with an embedded subset and extracted in PDF.js and Poppler." },
    ],
    notQualifiedSamples: [
      { value: "U+26A0 U+FE0F (⚠️)", result: "whole grapheme replaced by a code-point marker; emoji presentation sequence is not qualified." },
      { value: "U+1F469 U+1F3FD U+200D U+1F4BB (👩🏽‍💻)", result: "whole ZWJ/modifier grapheme replaced by one marker." },
      { value: "U+1F1FA U+1F1F3 (🇺🇳)", result: "regional-indicator sequence replaced by one marker." },
      { value: "U+0031 U+FE0F U+20E3 (1️⃣)", result: "keycap sequence replaced by one marker." },
      { value: "😀 🚀 ✅ ❌ 📄", result: "not covered by the configured text fonts; individual code-point markers are emitted." },
    ],
    scripts: {
      japaneseChineseKoreanArabicDevanagari: "The tested phrases use explicit markers because registered fonts do not cover those sample clusters.",
      hebrewAndArabic: "Unqualified Hebrew and Arabic grapheme clusters are replaced by explicit code-point markers because no bidi layout engine is present, even where a cmap has the glyphs. LTR content remains readable and the source model is unchanged.",
    },
    measuredCmapCoverageIsNotShapingGuarantee: true,
  };
  try {
    report.emojiFontCompatibility = JSON.parse(await readFile(path.join(out, "emoji-font-compatibility.json"), "utf8"));
  } catch {
    report.emojiFontCompatibility = { status: "Font-format experiments are recorded separately; run scripts/probe-pdfkit-emoji-formats.mjs with local CBDT and COLRv1 test fonts to regenerate the report." };
  }

  assert.deepEqual(externalRequests, []);
  const adversarial = spawnSync("python3", ["tests/pdf-native/test-action-inspector.py"], { encoding: "utf8" });
  assert.equal(adversarial.status, 0, adversarial.stderr || adversarial.stdout);
  report.actionInspectorAdversarialTests = adversarial.stdout.trim();
  await writeFile(path.join(out, "validation-report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(out, "unicode-compatibility-matrix.json"), JSON.stringify({
    generatedFrom: "validation-report.json",
    unicodeNormalization: report.unicodeNormalization,
    exactAndCanonicalExtractionComparisons: report.unicodeExtractionComparisons,
    qualification: report.unicodeQualificationMatrix,
    diagnosticPolicy: {
      decomposedUnicode: "Warn once if text containing decomposed Unicode may be composition-normalized by pdfmake/fontkit; source Markdown and semantic model remain unchanged. Exact code retrieval relies on Markdown until M7.8 attachments.",
      directionality: "Hebrew, Arabic and bidi controls are represented with explicit code-point markers; cmap presence alone is not treated as bidi support.",
      complexSequences: "Unqualified VS, ZWJ, modifier, regional indicator and keycap sequences remain whole-cluster markers.",
      missingGlyphs: "Uncovered graphemes use explicit [U+…] markers. Export diagnostics are deduplicated, capped at 20 messages, and capped at 240 characters per message.",
    },
  }, null, 2));
  console.log(`PDF acceptance passed: ${cases.length} documents, action adversarial fixtures passed in ${out}`);
} finally {
  await browser?.close();
  await server.close();
}
