import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const out = path.resolve(process.argv[2] || 'artifacts/m7.0');
await mkdir(path.join(out, 'pages'), { recursive: true });
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${cmd} failed: ${result.stderr}`);
  return result.stdout;
};
const files = ['browser-baseline.pdf', 'pdfmake-poc.pdf', 'pdfkit-poc.pdf'];
const reports = {};
for (const file of files) {
  const pdf = path.join(out, file);
  const stem = file.replace('.pdf', '');
  reports[stem] = {
    bytes: (await readFile(pdf)).byteLength,
    info: run('pdfinfo', [pdf]),
    fonts: run('pdffonts', [pdf]),
    text: run('pdftotext', [pdf, '-']),
    layout: run('pdftotext', ['-layout', pdf, '-']),
    pdfjs: '',
    links: run('python3', ['-c', "import sys,json; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print(json.dumps([{'page':i+1,'annotations':[a.get_object().get('/A') or a.get_object().get('/Subtype') for a in p.get('/Annots',[])]} for i,p in enumerate(r.pages)],default=str,indent=2))", pdf]),
  };
  const data = new Uint8Array(await readFile(pdf));
  const document = await getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let n = 1; n <= document.numPages; n++) {
    const page = await document.getPage(n);
    pages.push((await page.getTextContent()).items.map(item => item.str).join(' '));
  }
  reports[stem].pdfjs = pages.join('\n--- PAGE ---\n');
  await writeFile(path.join(out, `${stem}.pdfinfo.txt`), reports[stem].info);
  await writeFile(path.join(out, `${stem}.pdffonts.txt`), reports[stem].fonts);
  await writeFile(path.join(out, `${stem}.pdftotext.txt`), reports[stem].text);
  await writeFile(path.join(out, `${stem}.pdftotext-layout.txt`), reports[stem].layout);
  await writeFile(path.join(out, `${stem}.annotations.txt`), reports[stem].links);
  await writeFile(path.join(out, `${stem}.pdfjs.txt`), reports[stem].pdfjs);
  run('pdftoppm', ['-png', '-r', '90', pdf, path.join(out, 'pages', stem)]);
}
await writeFile(path.join(out, 'measurements.json'), JSON.stringify(reports, null, 2));
