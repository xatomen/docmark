import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const vite = path.join(root, "node_modules/vite/bin/vite.js");
const environment = process.argv[2] ?? "dev";
if (environment !== "dev" && environment !== "prod") throw new Error("Select dev or prod.");
const configHome = await mkdtemp(path.join(os.tmpdir(), "docmark-vinext-dev-"));
const env = {
  ...process.env,
  DOCMARK_ENV: environment,
  HOME: configHome,
  USERPROFILE: configHome,
  APPDATA: path.join(configHome, "AppData/Roaming"),
  XDG_CONFIG_HOME: configHome,
};
const run = (file, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(node, [file, ...args], { cwd: root, env, stdio: options.stdio ?? "inherit", shell: false });
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

let server;
try {
  const buildStatus = await run(vite, ["build"]);
  if (buildStatus !== 0) process.exit(buildStatus);
  const portServer = net.createServer();
  await new Promise((resolve) => portServer.listen(0, "127.0.0.1", resolve));
  const { port } = portServer.address();
  await new Promise((resolve) => portServer.close(resolve));
  server = spawn(node, [vite, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root, env, stdio: ["ignore", "pipe", "inherit"], shell: false,
  });
  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 120 && !ready; attempt++) {
    if (server.exitCode !== null) throw new Error(`vinext preview exited early (${server.exitCode}).`);
    try { ready = (await fetch(origin)).status === 200; } catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  if (!ready) throw new Error("vinext preview did not become ready within 60 seconds.");

  for (const route of ["/", "/about", "/contact", "/privacy", "/editor", "/markdown-to-pdf"]) {
    const response = await fetch(new URL(route, origin));
    const html = await response.text();
    if (!response.ok) throw new Error(`${route}: expected HTTP success, received ${response.status}.`);
    if (environment === "dev") {
      if (!/noindex\s*,\s*nofollow/i.test(response.headers.get("x-robots-tag") ?? "")) throw new Error(`${route}: missing X-Robots-Tag.`);
      if (!/<meta name="robots" content="noindex, nofollow"/i.test(html)) throw new Error(`${route}: missing robots metadata.`);
      if (/<link[^>]+rel="canonical"|og:url|application\/ld\+json|https:\/\/docmark-dev\.jorgegallardo\.cl/i.test(html)) throw new Error(`${route}: contains public SEO metadata.`);
      if (!html.includes("environment-badge")) throw new Error(`${route}: missing DEV badge.`);
    } else {
      if (/<span[^>]+class="environment-badge"/.test(html)) throw new Error(`${route}: PROD contains the DEV badge.`);
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      const openGraphUrl = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
      if (route === "/" && (!canonical || new URL(canonical).origin !== "https://docmark.jorgegallardo.cl" || !openGraphUrl || new URL(openGraphUrl).origin !== "https://docmark.jorgegallardo.cl" || !html.includes('application/ld+json'))) {
        throw new Error("PROD landing SEO metadata changed or is missing.");
      }
      if (route === "/editor" && !/<meta name="robots" content="noindex, follow"/i.test(html)) throw new Error("PROD editor must retain noindex, follow.");
    }
    console.log(`vinext ${environment.toUpperCase()} ${route}: metadata and headers verified`);
  }
  const robots = await (await fetch(new URL("/robots.txt", origin))).text();
  if (environment === "dev" && (!/Allow:\s*\//.test(robots) || /Disallow:|Sitemap:/i.test(robots))) throw new Error("vinext DEV robots.txt is inconsistent.");
  if (environment === "prod" && !robots.includes("Sitemap: https://docmark.jorgegallardo.cl/sitemap.xml")) throw new Error("vinext PROD robots.txt is missing the production sitemap URL.");
  const sitemap = await (await fetch(new URL("/sitemap.xml", origin))).text();
  if (environment === "dev" && /<loc>/.test(sitemap)) throw new Error("vinext DEV sitemap must be empty.");
  if (environment === "prod" && !sitemap.includes("https://docmark.jorgegallardo.cl/")) throw new Error("vinext PROD sitemap is missing production URLs.");
  console.log(`vinext ${environment.toUpperCase()} robots.txt and sitemap verified`);
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  await rm(configHome, { recursive: true, force: true });
}
