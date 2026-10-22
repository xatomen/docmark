# Running E2E tests on Windows 11

Playwright starts the application server itself and always uses the same configured origin for both `baseURL` and `webServer.url`. It does not reuse an already-running development server. If the selected port is occupied, the run fails instead of silently attaching to that process.

The default command runs the development server:

```powershell
pnpm test:e2e
```

To select another port, set `PLAYWRIGHT_PORT` before running the suite. Mermaid request checks use the origin derived from this same setting:

```powershell
$env:PLAYWRIGHT_PORT = "3115"
pnpm test:e2e
Remove-Item Env:PLAYWRIGHT_PORT
```

For a production-server run, build into the isolated E2E directory first, then tell Playwright to start `next start` from that directory:

```powershell
$env:DOCMARK_NEXT_DIST_DIR = ".next-e2e"
pnpm exec next build
$env:PLAYWRIGHT_SERVER = "production"
pnpm test:e2e
Remove-Item Env:PLAYWRIGHT_SERVER
Remove-Item Env:DOCMARK_NEXT_DIST_DIR
```

If Playwright reports `EADDRINUSE`, identify the listener before choosing another port. Do not terminate an unknown process:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3100 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Each invocation writes its own timestamped report directory under `playwright-report/` and failure artifacts under `test-results/`. Failed tests retain traces and screenshots. These ignored output directories are not reused or cleared by later runs.

Playwright creates a fresh browser context for each test, so IndexedDB and local storage do not carry between tests. The suite defaults to one worker because editor scenarios can be resource-heavy on Windows; set `PLAYWRIGHT_WORKERS` to a positive integer to opt into parallelism or compare execution modes.
