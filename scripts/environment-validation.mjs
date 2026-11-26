import { getEnvironmentConfig } from "../src/lib/environment.mjs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export async function readFreshArtifact(workerRoot) {
  try {
    const configText = await readFile(path.join(workerRoot, "worker.config.json"), "utf8");
    const compiledText = await readJavaScript(path.join(workerRoot, "bundle"));
    return { configText, compiledText, error: null };
  } catch {
    return { configText: "", compiledText: "", error: "Fresh Worker config or compiled bundle is missing." };
  }
}

async function readJavaScript(directory) {
  const chunks = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) chunks.push(await readJavaScript(file));
    else if (entry.isFile() && entry.name.endsWith(".js")) chunks.push(await readFile(file, "utf8"));
  }
  return chunks.join("\n");
}

export function validateDeployment(environment, env, branch, detached, workerOverride) {
  if (environment !== "dev" && environment !== "prod") return "Invalid environment selection; expected dev or prod.";
  if (env.DOCMARK_ENV !== undefined && env.DOCMARK_ENV !== "dev" && env.DOCMARK_ENV !== "prod") return `Invalid DOCMARK_ENV: ${env.DOCMARK_ENV}. Expected dev or prod.`;
  if (env.DOCMARK_ENV !== environment) return `Refusing deployment: DOCMARK_ENV must explicitly be ${environment}.`;
  if (environment === "prod") {
    if (!detached && branch !== "main") return `Refusing production deployment from branch ${branch}; use main.`;
    if (detached && env.DOCMARK_ALLOW_DETACHED_PROD !== "true") return "Refusing production deployment from detached HEAD without DOCMARK_ALLOW_DETACHED_PROD=true.";
  }
  const target = getEnvironmentConfig(environment).workerName;
  if (workerOverride !== target) return `Refusing deployment: DOCMARK_DEPLOY_WORKER must equal ${target}.`;
  return null;
}

export function validateArtifact(configText, compiledText, environment) {
  let artifact;
  try { artifact = JSON.parse(configText); } catch { return "Generated Worker configuration is invalid JSON."; }
  const config = getEnvironmentConfig(environment);
  if (artifact?.name !== config.workerName) return `Artifact Worker mismatch: expected ${config.workerName}.`;
  if (!compiledText.includes(config.siteUrl)) return `Compiled output does not contain the ${environment} site origin.`;
  if (!compiledText.includes("DOCMARK_BUILD_ENV=") || !new RegExp(`function\\s+\\w+\\(\\w+=\`${environment}\`\\)`).test(compiledText)) {
    return `Compiled output environment marker does not match ${environment}.`;
  }
  if (environment === "dev" && !compiledText.includes("noindex, nofollow")) return "Compiled DEV output is missing noindex, nofollow.";
  return null;
}
