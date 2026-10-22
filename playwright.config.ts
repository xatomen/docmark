import { defineConfig } from "@playwright/test";
import { e2eBaseURL } from "./tests/e2e/runtime";

const port = new URL(e2eBaseURL).port;
const serverMode = process.env.PLAYWRIGHT_SERVER ?? "dev";
const workers = Number(process.env.PLAYWRIGHT_WORKERS ?? "1");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = `test-results/${runId}`;

if (serverMode !== "dev" && serverMode !== "production") {
  throw new Error('PLAYWRIGHT_SERVER must be either "dev" or "production".');
}
if (!Number.isInteger(workers) || workers < 1) {
  throw new Error("PLAYWRIGHT_WORKERS must be a positive integer.");
}

const serverCommand = serverMode === "production"
  ? `pnpm exec next start --hostname 127.0.0.1 --port ${port}`
  : `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers,
  outputDir,
  reporter: [
    ["list"],
    ["html", { outputFolder: `playwright-report/${runId}`, open: "never" }],
  ],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: e2eBaseURL,
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: serverCommand,
    url: `${e2eBaseURL}/editor`,
    env: {
      ...process.env,
      DOCMARK_NEXT_DIST_DIR: process.env.DOCMARK_NEXT_DIST_DIR ?? ".next-e2e",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
