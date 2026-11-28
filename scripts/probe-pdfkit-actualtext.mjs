import PDFDocument from "pdfkit";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const output = path.join(process.cwd(), "artifacts/m7.3/pdfkit-actualtext-nfd-probe.pdf");
const precomposed = "café";
const decomposed = "cafe\u0301";
await mkdir(path.dirname(output), { recursive: true });

const document = new PDFDocument({ margin: 64 });
const chunks = [];
document.on("data", (chunk) => chunks.push(chunk));
document.on("end", async () => {
  await writeFile(output, Buffer.concat(chunks));
  process.stdout.write(`${output}\n`);
});

document.font("Helvetica").fontSize(14);
document.markContent("Span", { actual: decomposed });
document.text(precomposed, { continued: false });
document.endMarkedContent();
document.end();
