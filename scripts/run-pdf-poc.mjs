import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const out = path.resolve(process.argv[2] || 'artifacts/m7.0');
await mkdir(out, { recursive: true });
const listener = net.createServer();
await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', process.cwd()], { stdio: 'ignore' });
let serverError; server.on('error', error => { serverError = error; });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) { if (serverError || server.exitCode !== null) throw serverError || new Error(`HTTP server exited: ${server.exitCode}`); try { ready = (await fetch(origin)).ok; } catch {} if (ready) break; await delay(250); }
  if (!ready) throw new Error('PoC HTTP server did not start');
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('BROWSER', m.text()); });
  const requests = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== origin) { requests.push(url.href); await route.abort(); }
    else await route.continue();
  });
  await page.goto(`${origin}/tests/pdf-poc/index.html`);
  const downloads = [];
  page.on('download', async d => { const file = d.suggestedFilename(); await d.saveAs(`${out}/${file}`); downloads.push(file); });
  const pdfmakeStart = Date.now();
  await page.evaluate(() => document.querySelector('#make').click());
  for (let i = 0; i < 40 && downloads.length < 2; i++) await delay(100);
  if (downloads.length !== 2) throw new Error(`Expected 2 candidate PDFs, got ${downloads.join(', ')}`);
  const candidateGenerationMs = Date.now() - pdfmakeStart;
  await page.addStyleTag({ content: 'button, #status { display: none !important; }' });
  const baseline = await page.pdf({ format: 'A4', printBackground: true, path: `${out}/browser-baseline.pdf` });
  await writeFile(path.join(out, 'network.json'), JSON.stringify({ unexpectedRequests: requests }, null, 2));
  if (requests.length) throw new Error(`Unexpected external requests: ${requests.join(', ')}`);
  console.log(JSON.stringify({ baselineBytes: baseline.length, candidateGenerationMs, requests, artifacts: out }));
} finally { await browser?.close(); server.kill('SIGTERM'); }
