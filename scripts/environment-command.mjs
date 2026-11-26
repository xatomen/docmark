import { spawnSync, execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const [environment, action, ...args] = process.argv.slice(2);
if (!["dev", "prod"].includes(environment) || !["build", "deploy"].includes(action)) {
  console.error("Usage: node scripts/environment-command.mjs <dev|prod> <build|deploy>");
  process.exit(2);
}
const expectedWorker = environment === "dev" ? "docmark-dev" : "docmark";
const env = { ...process.env, DOCMARK_ENV: environment };
const run = (command, commandArgs, options = {}) => spawnSync(command, commandArgs, {
  stdio: "inherit", env: options.env ?? env, shell: process.platform === "win32",
});

if (action === "build") {
  const result = run("pnpm", ["exec", "vite", "build", ...args]);
  process.exit(result.status ?? 1);
}

// All guards precede the build and, critically, every network-capable CLI call.
if (process.env.DOCMARK_ENV !== environment) {
  console.error(`Refusing deployment: DOCMARK_ENV must explicitly be ${environment}.`);
  process.exit(2);
}
const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
if (environment === "prod") {
  if (branch && branch !== "main") {
    console.error(`Refusing production deployment from branch ${branch}; use main.`);
    process.exit(2);
  }
  if (!branch) {
    const symbolic = spawnSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { encoding: "utf8" });
    if (symbolic.status === 0) {
      console.error(`Refusing production deployment from branch ${symbolic.stdout.trim()}; use main.`);
      process.exit(2);
    }
    if (process.env.DOCMARK_ALLOW_DETACHED_PROD !== "true") {
      console.error("Refusing production deployment from detached HEAD without DOCMARK_ALLOW_DETACHED_PROD=true.");
      process.exit(2);
    }
  }
}
if (process.env.DOCMARK_DEPLOY_WORKER !== expectedWorker) {
  console.error(`Refusing deployment: DOCMARK_DEPLOY_WORKER must equal ${expectedWorker}.`);
  process.exit(2);
}

const build = run("pnpm", ["exec", "vite", "build"]);
if (build.status !== 0) process.exit(build.status ?? 1);
const artifactPath = ".cloudflare/output/v0/workers/default/worker.config.json";
let artifact;
try {
  artifact = JSON.parse(await readFile(artifactPath, "utf8"));
} catch {
  console.error(`Refusing deployment: generated Worker configuration is missing or invalid at ${artifactPath}.`);
  process.exit(2);
}
if (artifact.name !== expectedWorker) {
  console.error(`Refusing deployment: generated artifact targets ${artifact.name ?? "an unknown Worker"}; expected ${expectedWorker}.`);
  process.exit(2);
}
console.log(`Validated deployment target: ${expectedWorker} (${environment})`);
const deploy = run("pnpm", ["exec", "vinext-cloudflare", "deploy", ...args]);
process.exit(deploy.status ?? 1);
