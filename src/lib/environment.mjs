/** @typedef {"dev" | "prod"} DocmarkEnvironment */

export const environments = Object.freeze({
  dev: Object.freeze({ environment: "dev", workerName: "docmark-dev", siteUrl: "https://docmark-dev.jorgegallardo.cl", isIndexable: false }),
  prod: Object.freeze({ environment: "prod", workerName: "docmark", siteUrl: "https://docmark.jorgegallardo.cl", isIndexable: true }),
});

/** @param {string | undefined} value */
export function getDocmarkEnvironment(value = process.env.DOCMARK_ENV) {
  if (value === undefined) return "prod";
  if (value === "dev" || value === "prod") return value;
  throw new Error(`Invalid DOCMARK_ENV: ${value}. Expected "dev" or "prod".`);
}

/** @param {string | undefined} value */
export function getEnvironmentConfig(value = process.env.DOCMARK_ENV) {
  return environments[getDocmarkEnvironment(value)];
}

export const environmentBuildMarker = `DOCMARK_BUILD_ENV=${process.env.DOCMARK_ENV ?? "prod"}`;
