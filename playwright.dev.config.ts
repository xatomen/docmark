import { defineConfig } from "@playwright/test";
const port = Number(process.env.PLAYWRIGHT_DEV_PORT ?? "3101");
const origin = `http://127.0.0.1:${port}`;
const runId = new Date().toISOString().replace(/[:.]/g, "-");

export default defineConfig({
  testDir: "./tests/e2e-dev",
  fullyParallel: true,
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? "1"),
  outputDir: `test-results/dev-${runId}`,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: origin,
    browserName: "chromium",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${origin}/editor`,
    env: { ...process.env, DOCMARK_ENV: "dev", DOCMARK_NEXT_DIST_DIR: ".next-e2e-dev" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
