import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import PDFDocument from "pdfkit";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const root = process.cwd();
const output = path.join(root, "artifacts/m7.3/font-subset-candidates");
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(path.join(os.tmpdir(), "docmark-font-subset-"));

const fonts = [
  {
    id: "DejaVuMathTeXGyre",
    source: "public/fonts/pdf/dejavu-math/DejaVuMathTeXGyre.ttf",
    license: "Bitstream Vera; public/fonts/pdf/dejavu-math/COPYRIGHT.txt",
    text: "∈ ⇒ ⟨ ⟩",
  },
  {
    id: "NotoSansSymbols2",
    source: "public/fonts/pdf/noto-sans-symbols2/NotoSansSymbols2-Regular.ttf",
    license: "SIL OFL 1.1; public/fonts/pdf/noto-sans-symbols2/OFL.txt",
    text: "🔒 ⚠",
  },
];

const python = (args) => {
  const result = spawnSync("python3", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `python3 ${args.join(" ")} failed`);
  return result.stdout;
};

async function createPdf(fontPath, name, text, prefix = "") {
  const file = path.join(output, `${name}.pdf`);
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 72 });
    const stream = createWriteStream(file);
    stream.once("finish", resolve);
    stream.once("error", reject);
    doc.once("error", reject);
    doc.pipe(stream);
    if (prefix) {
      doc.font(path.join(root, "public/fonts/liberation/LiberationSans-Regular.ttf"))
        .fontSize(14).text(prefix, { continued: true });
    }
    doc.font(fontPath).fontSize(18).text(text);
    doc.end();
  });
  const bytes = await readFile(file);
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const textContent = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    textContent.push((await page.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(""));
  }
  const pdfjsText = textContent.join("\n").trim();
  const poppler = spawnSync("pdftotext", ["-enc", "UTF-8", file, "-"], { encoding: "utf8" });
  if (poppler.status !== 0) throw new Error(`${name}: pdftotext failed: ${poppler.stderr}`);
  const fontReport = spawnSync("pdffonts", [file], { encoding: "utf8" });
  if (fontReport.status !== 0) throw new Error(`${name}: pdffonts failed: ${fontReport.stderr}`);
  if (!/yes\s+yes\s+yes/.test(fontReport.stdout)) throw new Error(`${name}: candidate face was not embedded, subsetted, and Unicode-mapped`);
  const png = spawnSync("pdftoppm", ["-f", "1", "-singlefile", "-png", "-r", "110", file, path.join(output, name)], { encoding: "utf8" });
  if (png.status !== 0) throw new Error(`${name}: pdftoppm failed: ${png.stderr}`);
  const expected = prefix ? `${prefix}${text}` : text;
  if (!pdfjsText.includes(text) || !poppler.stdout.replace(/\s/g, "").includes(text.replace(/\s/g, ""))) {
    throw new Error(`${name}: text extraction did not retain ${JSON.stringify(expected)} (PDF.js=${JSON.stringify(pdfjsText)}, Poppler=${JSON.stringify(poppler.stdout)})`);
  }
  return {
    path: path.relative(root, file),
    bytes: bytes.byteLength,
    pages: pdf.numPages,
    pdfjsText,
    popplerText: poppler.stdout.trim(),
    pdffonts: fontReport.stdout,
    preview: path.relative(root, path.join(output, `${name}.png`)),
  };
}

try {
  const results = [];
  for (const font of fonts) {
    const source = path.join(root, font.source);
    const subset = path.join(temporary, `${font.id}.ttf`);
    python(["-m", "fontTools.subset", source, `--output-file=${subset}`, "--unicodes=*", "--layout-features=*", "--notdef-glyph", "--notdef-outline", "--recommended-glyphs"]);
    const comparison = JSON.parse(python(["-c", [
      "import hashlib, json, sys",
      "from pathlib import Path",
      "from fontTools.ttLib import TTFont",
      "source, subset = map(Path, sys.argv[1:])",
      "def read(path):",
      " f = TTFont(path, lazy=False)",
      " points = set().union(*(set(t.cmap) for t in f['cmap'].tables if t.isUnicode()))",
      " names = [n.toUnicode() for n in f['name'].names if n.nameID in (1, 4, 6, 16, 18)]",
      " tables = sorted(f.keys())",
      " f.close()",
      " return points, names, tables",
      "a, an, at = read(source); b, bn, bt = read(subset)",
      "hash_file = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()",
      "print(json.dumps({'sourceBytes': source.stat().st_size, 'subsetBytes': subset.stat().st_size, 'sourceSha256': hash_file(source), 'subsetSha256': hash_file(subset), 'sourceCmapCodePoints': len(a), 'subsetCmapCodePoints': len(b), 'cmapMissing': sorted(a-b), 'cmapAdded': sorted(b-a), 'sourceTables': at, 'subsetTables': bt, 'lostTables': sorted(set(at)-set(bt)), 'retainedLayoutTables': sorted(set(at)&set(bt)&{'GDEF','GPOS','GSUB','MATH','BASE'}), 'sourceNames': sorted(set(an)), 'subsetNames': sorted(set(bn))}))",
    ].join("\n"), source, subset]));
    if (comparison.cmapMissing.length || comparison.cmapAdded.length) throw new Error(`${font.id}: full cmap coverage was not preserved by the subset candidate`);
    if (font.id === "DejaVuMathTeXGyre" && !comparison.retainedLayoutTables.includes("MATH")) throw new Error("DejaVu subset removed OpenType MATH data");
    const pdf = await createPdf(subset, `${font.id}-subset`, font.text, font.id === "NotoSansSymbols2" ? "Qualified pictographs: " : "");
    results.push({
      family: font.id,
      source: font.source,
      license: font.license,
      ...comparison,
      bytesSaved: comparison.sourceBytes - comparison.subsetBytes,
      retainedCoveragePercent: comparison.sourceCmapCodePoints ? 100 * comparison.subsetCmapCodePoints / comparison.sourceCmapCodePoints : null,
      lostNonLayoutTables: comparison.lostTables,
      generatedPdf: pdf,
    });
  }
  const totalSaved = results.reduce((sum, item) => sum + item.bytesSaved, 0);
  const totalSourceBytes = results.reduce((sum, item) => sum + item.sourceBytes, 0);
  const report = {
    method: "fontTools 4.61.1 pyftsubset with all Unicode cmap entries, all OpenType layout features, .notdef and recommended glyphs; candidates are temporary and production assets are unchanged",
    checkedInOriginalsRetained: true,
    totalSourceBytes,
    totalCandidateBytes: results.reduce((sum, item) => sum + item.subsetBytes, 0),
    totalBytesSaved: totalSaved,
    percentSaved: totalSaved / totalSourceBytes * 100,
    allCmapEntriesPreserved: results.every((item) => item.cmapMissing.length === 0 && item.cmapAdded.length === 0),
    results,
    decision: "Do not replace production assets in Phase D. Full cmap and layout preservation with actual PDF extraction was verified; the approximately 7.7% combined size reduction is useful but modest relative to retaining untouched upstream originals and avoiding modified-font distribution/build provenance for these fallbacks. Revisit only with an agreed asset-size target.",
  };
  await writeFile(path.join(output, "font-subset-candidates.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output: path.relative(root, output), totalSourceBytes, totalCandidateBytes: report.totalCandidateBytes, totalBytesSaved: totalSaved, percentSaved: report.percentSaved.toFixed(2), previews: results.map(({ generatedPdf }) => generatedPdf.preview) }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
