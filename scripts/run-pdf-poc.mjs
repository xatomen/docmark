import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const out = path.resolve(process.argv[2] || 'artifacts/m7.0');
await mkdir(out, { recursive: true });
  const server = spawn('python3', ['-m', 'http.server', '4179', '--bind', '127.0.0.1', '--directory', process.cwd()], { stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) { try { ready = (await fetch('http://127.0.0.1:4179/')).ok; } catch {} if (ready) break; await delay(250); }
  if (!ready) throw new Error('Vite PoC server did not start');
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('BROWSER', m.text()); });
  const requests = [];
  page.on('request', req => requests.push(req.url()));
  await page.goto('http://127.0.0.1:4179/tests/pdf-poc/index.html');
  const downloads = [];
  page.on('download', async d => { const file = d.suggestedFilename(); await d.saveAs(`${out}/${file}`); downloads.push(file); });
  const pdfmakeStart = Date.now();
  await page.evaluate(() => document.querySelector('#make').click());
  for (let i = 0; i < 40 && downloads.length < 2; i++) await delay(100);
  if (downloads.length !== 2) throw new Error(`Expected 2 candidate PDFs, got ${downloads.join(', ')}`);
  const pdfmakeMs = Date.now() - pdfmakeStart;
  await page.addStyleTag({ content: 'button, #status { display: none !important; }' });
  const baseline = await page.pdf({ format: 'A4', printBackground: true, path: `${out}/browser-baseline.pdf` });
  console.log(JSON.stringify({ baselineBytes: baseline.length, pdfmakeMs, requests: [...new Set(requests.filter(u => !u.includes('127.0.0.1')))], artifacts: out }));
} finally { await browser?.close(); server.kill('SIGTERM'); }
