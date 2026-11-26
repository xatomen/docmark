import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];
afterEach(() => tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function invokeGuard(environment: string | undefined, target: string | undefined, branch = "feature/test", detachedOverride?: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "docmark-deploy-guard-"));
  tempDirs.push(dir);
  const marker = path.join(dir, "remote-called");
  const fakePnpm = path.join(dir, "pnpm");
  writeFileSync(fakePnpm, `#!/bin/sh\ntouch '${marker}'\nexit 0\n`);
  chmodSync(fakePnpm, 0o755);
  const git = spawnSync("git", ["init", "-b", branch, dir], { encoding: "utf8" });
  expect(git.status).toBe(0);
  const result = spawnSync(process.execPath, ["scripts/environment-command.mjs", "prod", "deploy"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dir}${path.delimiter}${process.env.PATH}`,
      DOCMARK_ENV: environment,
      DOCMARK_DEPLOY_WORKER: target,
      DOCMARK_ALLOW_DETACHED_PROD: detachedOverride,
    },
  });
  return { result, markerExists: (() => { try { readFileSync(marker); return true; } catch { return false; } })() };
}

describe("deployment guard", () => {
  it("rejects missing environment before running the build or remote CLI", () => {
    const { result, markerExists } = invokeGuard(undefined, "docmark");
    expect(result.status).toBe(2);
    expect(markerExists).toBe(false);
  });

  it("rejects a wrong destination before running the build or remote CLI", () => {
    const { result, markerExists } = invokeGuard("prod", "docmark-dev");
    expect(result.status).toBe(2);
    expect(markerExists).toBe(false);
  });

  it("does not let the detached override permit a named non-main branch", () => {
    const { result, markerExists } = invokeGuard("prod", "docmark", "develop", "true");
    expect(result.status).toBe(2);
    expect(markerExists).toBe(false);
  });
});
