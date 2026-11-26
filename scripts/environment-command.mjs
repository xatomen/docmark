import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getEnvironmentConfig } from "../src/lib/environment.mjs";
import { readFreshArtifact, validateArtifact, validateDeployment } from "./environment-validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [environment, action, ...extra] = process.argv.slice(2);
if (!["dev", "prod"].includes(environment) || !["build", "deploy"].includes(action) || extra.length) {
  console.error("Usage: node scripts/environment-command.mjs <dev|prod> <build|deploy>");
  process.exit(2);
} else {
  const config = getEnvironmentConfig(environment);
  const env = { ...process.env, DOCMARK_ENV: environment };
  const run = (file, args, cwd = root) => spawnSync(process.execPath, [file, ...args], { cwd, env, stdio: "inherit", shell: false });
  const viteCli = path.join(root, "node_modules/vite/bin/vite.js");
  const outputRoot = path.join(root, ".cloudflare/output/v0");

  if (action === "build") {
    await rm(outputRoot, { recursive: true, force: true });
    const result = run(viteCli, ["build"]);
    process.exit(result.status ?? 1);
  }

  const branchResult = spawnSync("git", ["branch", "--show-current"], { cwd: process.cwd(), encoding: "utf8", shell: false });
  if (branchResult.status !== 0) {
    console.error("Refusing deployment: cannot determine the current Git branch.");
    process.exit(2);
  }
  const branch = branchResult.stdout.trim();
  const symbolic = branch ? null : spawnSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: process.cwd(), encoding: "utf8", shell: false });
  const detached = !branch && symbolic?.status !== 0;
  const refusal = validateDeployment(environment, process.env, branch || symbolic?.stdout?.trim() || "", detached, process.env.DOCMARK_DEPLOY_WORKER);
  if (refusal) { console.error(refusal); process.exit(2); }
  if (process.env.DOCMARK_PREFLIGHT_ONLY === "true") { console.log("Deployment preflight passed."); process.exit(0); }

  await rm(outputRoot, { recursive: true, force: true });
  const build = run(viteCli, ["build"]);
  if (build.status !== 0) process.exit(build.status ?? 1);
  const workerRoot = path.join(outputRoot, "workers/default");
  const { configText, compiledText, error } = await readFreshArtifact(workerRoot);
  if (error) {
    console.error(`Refusing deployment: ${error}`);
    process.exit(2);
  }
  const artifactError = validateArtifact(configText, compiledText, environment);
  if (artifactError) { console.error(`Refusing deployment: ${artifactError}`); process.exit(2); }
  console.log(`Validated fresh ${environment} artifact for ${config.workerName}.`);

  // Use the installed vinext CLI without a second build or user-supplied target arguments.
  const deployCli = path.join(root, "node_modules/@vinext/cloudflare/dist/cli.js");
  const deployment = run(deployCli, ["deploy", "--skip-build"]);
  process.exit(deployment.status ?? 1);
}
