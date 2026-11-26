import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { readFreshArtifact, validateArtifact } from "../../scripts/environment-validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(root, "scripts/environment-command.mjs");
const tempDirs: string[] = [];
afterEach(() => tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function repo(branch: "main" | "feature/test" | "detached") {
  const cwd = mkdtempSync(path.join(tmpdir(), "docmark-deploy-guard-"));
  tempDirs.push(cwd);
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"].includes(key))) as NodeJS.ProcessEnv;
  const git = (args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8", shell: false, env: cleanEnv });
  expect(git(["init"]).status).toBe(0);
  expect(git(["config", "user.name", "Test"]).status).toBe(0);
  expect(git(["config", "user.email", "test@example.invalid"]).status).toBe(0);
  writeFileSync(path.join(cwd, "seed"), "test");
  expect(git(["add", "seed"]).status).toBe(0);
  expect(git(["commit", "-m", "seed"]).status).toBe(0);
  if (branch === "detached") expect(git(["checkout", "--detach"]).status).toBe(0);
  else expect(git(["branch", "-M", branch]).status).toBe(0);
  return cwd;
}

function runPreflight({ branch = "feature/test", environment, target = "docmark", override }: {
  branch?: "main" | "feature/test" | "detached";
  environment?: string;
  target?: string;
  override?: string;
}) {
  const cwd = repo(branch);
  return spawnSync(process.execPath, [script, "prod", "deploy"], {
    cwd,
    encoding: "utf8",
    shell: false,
    env: { ...cleanEnvironment(), DOCMARK_ENV: environment, DOCMARK_DEPLOY_WORKER: target, DOCMARK_ALLOW_DETACHED_PROD: override, DOCMARK_PREFLIGHT_ONLY: "true" },
  });
}

describe("deployment preflight in an isolated Git checkout", () => {
  it("blocks when environment is absent before build/deploy", () => {
    const result = runPreflight({ environment: undefined });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("DOCMARK_ENV must explicitly be prod");
    expect(result.stdout).not.toContain("Deployment preflight passed");
  });
  it("blocks an invalid environment value", () => {
    const result = runPreflight({ environment: "stage" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Invalid DOCMARK_ENV: stage");
  });
  it("blocks an incorrect Worker", () => {
    const result = runPreflight({ environment: "prod", target: "docmark-dev", branch: "main" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("DOCMARK_DEPLOY_WORKER must equal docmark");
  });
  it("blocks PROD from a named branch other than main", () => {
    const result = runPreflight({ environment: "prod", target: "docmark", branch: "feature/test" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("from branch feature/test");
  });
  it("passes preflight from main", () => {
    const result = runPreflight({ environment: "prod", target: "docmark", branch: "main" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Deployment preflight passed");
  });
  it("blocks detached HEAD without explicit authorization", () => {
    const result = runPreflight({ environment: "prod", target: "docmark", branch: "detached" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("detached HEAD without DOCMARK_ALLOW_DETACHED_PROD=true");
  });
  it("passes detached HEAD with explicit authorization", () => {
    const result = runPreflight({ environment: "prod", target: "docmark", branch: "detached", override: "true" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Deployment preflight passed");
  });
  it("does not allow the detached override on another named branch", () => {
    const result = runPreflight({ environment: "prod", target: "docmark", branch: "feature/test", override: "true" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("from branch feature/test");
  });
});

function cleanEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"].includes(key))) as NodeJS.ProcessEnv;
}

describe("fresh artifact validation", () => {
  it("rejects a nonexistent artifact before deployment", async () => {
    const temp = mkdtempSync(path.join(tmpdir(), "docmark-artifact-")); tempDirs.push(temp);
    const artifact = await readFreshArtifact(path.join(temp, "missing-worker"));
    expect(artifact.error).toContain("missing");
  });
  it("rejects invalid artifact JSON before deployment", () => {
    expect(validateArtifact("{broken", "", "prod")).toContain("invalid JSON");
  });
  it("rejects a DEV Worker artifact when PROD is selected", () => {
    expect(validateArtifact('{"name":"docmark-dev"}', "https://docmark.jorgegallardo.cl", "prod")).toContain("expected docmark");
  });
  it("rejects a PROD Worker artifact when DEV is selected", () => {
    expect(validateArtifact('{"name":"docmark"}', "https://docmark-dev.jorgegallardo.cl noindex, nofollow", "dev")).toContain("expected docmark-dev");
  });
  it("checks compiled contents as well as Worker name", () => {
    expect(validateArtifact('{"name":"docmark-dev"}', "https://docmark-dev.jorgegallardo.cl DOCMARK_BUILD_ENV= function n(e=`dev`) noindex, nofollow", "dev")).toBeNull();
    expect(validateArtifact('{"name":"docmark-dev"}', "wrong output", "dev")).toContain("does not contain");
    expect(validateArtifact('{"name":"docmark-dev"}', "https://docmark-dev.jorgegallardo.cl DOCMARK_BUILD_ENV= function n(e=`dev`)", "dev")).toContain("missing noindex");
  });
});
