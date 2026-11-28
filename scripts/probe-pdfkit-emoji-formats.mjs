import PDFDocument from "pdfkit";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const candidates = process.argv.slice(2);
if (!candidates.length) {
  throw new Error("Pass one or more local emoji font paths to test PDFKit embedding and subsetting.");
}

const outputDirectory = path.join(process.cwd(), "artifacts/m7.3/emoji-font-probes");
await (await import("node:fs/promises")).mkdir(outputDirectory, { recursive: true });

async function generate(fontPath) {
  const bytes = await readFile(fontPath);
  return new Promise((resolve) => {
    const document = new PDFDocument({ margin: 48 });
    const chunks = [];
    let settled = false;
    const reject = (error) => {
      if (settled) return;
      settled = true;
      resolve({ supported: false, error: error instanceof Error ? error.message : String(error) });
    };
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", async () => {
      if (settled) return;
      settled = true;
      const pdfBytes = Buffer.concat(chunks);
      const filename = `${path.basename(fontPath, path.extname(fontPath))}.pdf`;
      await writeFile(path.join(outputDirectory, filename), pdfBytes);
      resolve({ supported: true, pdfPath: `artifacts/m7.3/emoji-font-probes/${filename}`, pdfBytes: pdfBytes.length });
    });
    try {
      document.registerFont("CandidateEmoji", bytes);
      document.font("CandidateEmoji").fontSize(28).text("😀 🚀 ✅ ❌ ⚠️ 📄 🔒 👩‍💻 🇺🇳");
      document.end();
    } catch (error) {
      reject(error);
    }
  }).then((result) => ({
    inputName: path.basename(fontPath),
    inputBytes: bytes.byteLength,
    inputSha256: createHash("sha256").update(bytes).digest("hex"),
    ...result,
  }));
}

const results = [];
for (const fontPath of candidates) results.push(await generate(fontPath));
process.stdout.write(`${JSON.stringify({ pdfkit: "0.21.0", fontkit: "3.0.0", candidates: results }, null, 2)}\n`);
