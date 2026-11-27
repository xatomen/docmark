import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = process.cwd(), out = path.join(root, 'artifacts/m7.2');
await mkdir(out, { recursive: true });
const server = await createServer({ configFile:false, root, resolve:{alias:{'@':path.join(root,'src')}}, server:{host:'127.0.0.1',port:0,strictPort:false} });
let browser;
try {
  await server.listen();
  const address=server.httpServer.address();
  const origin=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  const page=await browser.newPage();
  const external=[];
  await page.route('**/*', async route => { const url=new URL(route.request().url()); if (['http:','https:'].includes(url.protocol) && url.origin!==origin) { external.push(url.href); await route.abort(); } else await route.continue(); });
  await page.goto(`${origin}/tests/pdf-native/harness.html`);
  await page.waitForFunction(() => typeof window.generatePdf === 'function');
  const fixture=await readFile(path.join(root,'tests/fixtures/pdf-engine-comparison.md'),'utf8');
  const cases=[
    ['basic-document','# Título\n\nInformación y **negrita** con *cursiva* y ***ambos***.',{},['Título','Información']],
    ['unicode-document','# Español\n\nInformación, acción, niño, pingüino, ¿Cómo estás? ¡Excelente!',{},['Información','niño','pingüino','¿Cómo']],
    ['tables-and-lists','3. primero\n4. segundo\n   - anidado\n\n| A | B |\n|---|---|\n| celda | valor |',{},['primero','segundo','anidado','celda','valor']],
    ['code-blocks','> cita de prueba\n\n```js\nconst value = 10;\n```',{},['cita de prueba','const value = 10;']],
    ['page-breaks','# Primera\n\n:::pagebreak\n:::\n\n# Segunda',{},['Primera','Segunda']],
    ['letter-landscape','# Landscape', {landscape:true}, ['Landscape']],
    ['m7.0-fixture',fixture,{},['Información','pingüino','Anidado','Código']],
    ['security','[safe](https://example.com) [http](http://example.com) [relative](/local) [internal](#missing) ![remote](https://example.com/image.png)',{unsafe:true},['safe','relative','unsafe']],
  ];
  const report={externalRequests:external,documents:{}};
  for (const [name,source,options,expected] of cases) {
    const result=await page.evaluate(([s,o])=>window.generatePdf(s,o),[source,options]);
    const bytes=Buffer.from(result.bytes); assert.ok(bytes.subarray(0,5).equals(Buffer.from('%PDF-')));
    const file=path.join(out,`${name}.pdf`); await writeFile(file,bytes);
    const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
    let text=''; const annotations=[]; const sizes=[];
    for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n);sizes.push(p.view);text+=(await p.getTextContent()).items.map(x=>x.str).join(' ')+'\n';annotations.push(...await p.getAnnotations());}
    for(const value of expected) assert.ok(text.includes(value),`${name}: missing ${value}`);
    if(name==='page-breaks') assert.equal(pdf.numPages,2);
    if(name==='letter-landscape') { assert.ok(Math.abs(sizes[0][2]-792)<2); assert.ok(Math.abs(sizes[0][3]-612)<2); }
    else { assert.ok(Math.abs(sizes[0][2]-595.28)<2); assert.ok(Math.abs(sizes[0][3]-841.89)<2); }
    const fonts=spawnSync('pdffonts',[file],{encoding:'utf8'}); assert.equal(fonts.status,0,fonts.stderr); assert.match(fonts.stdout,/LiberationSans/); assert.match(fonts.stdout,/yes\s+yes\s+yes/);
    if(name==='basic-document') { for (const variant of ['LiberationSans-BoldItalic','LiberationSans-Italic','LiberationSans-Bold']) assert.ok(fonts.stdout.includes(variant), `Missing font variant ${variant}`); }
    if(name==='security') {
      const urls=annotations.map(a=>a.url).filter(Boolean); assert.deepEqual(urls.sort(),['http://example.com/','https://example.com/']);
      const inspection=spawnSync('python3',['-c', `import sys,json
from pypdf import PdfReader
r=PdfReader(sys.argv[1])
root=r.trailer['/Root']
from pypdf.generic import IndirectObject, DictionaryObject, ArrayObject
names=root.get('/Names', {})
assert '/EmbeddedFiles' not in names
assert '/JavaScript' not in names
assert '/AA' not in root
assert '/OpenAction' not in root
seen=set()
def inspect(obj):
 if isinstance(obj, IndirectObject):
  key=(obj.idnum,obj.generation)
  if key in seen: return
  seen.add(key); return inspect(obj.get_object())
 if isinstance(obj, DictionaryObject):
  assert '/AA' not in obj, 'additional action found'
  assert '/JS' not in obj, 'JavaScript action payload found'
  assert obj.get('/S') != '/JavaScript', 'named JavaScript action found'
  assert '/EmbeddedFiles' not in obj, 'embedded-file name tree found'
  action=obj.get('/A')
  if action is not None:
   action=action.get_object() if isinstance(action, IndirectObject) else action
   assert action.get('/S') in [None, '/URI'], 'unexpected action type'
   if action.get('/S') == '/URI': assert str(action.get('/URI')).startswith(('https://example.com', 'http://example.com'))
  for value in obj.values(): inspect(value)
 elif isinstance(obj, ArrayObject):
  for value in obj: inspect(value)
inspect(root)
print(json.dumps({'embeddedFiles':False,'openAction':False,'additionalActions':False,'javascriptActions':False,'unsafeActions':False}))`,file],{encoding:'utf8'});
      assert.equal(inspection.status,0,inspection.stderr); report.securityInspection=JSON.parse(inspection.stdout);
    }
    report.documents[name]={bytes:bytes.length,pages:pdf.numPages,dimensions:sizes,textAssertions:expected,fonts:fonts.stdout,annotations:annotations.map(a=>({subtype:a.subtype,url:a.url})),diagnostics:result.diagnostics};
  }
  assert.deepEqual(external,[]);
  await writeFile(path.join(out,'validation-report.json'),JSON.stringify(report,null,2));
  console.log(`PDF acceptance passed: ${cases.length} documents in ${out}`);
} finally { await browser?.close(); await server.close(); }
