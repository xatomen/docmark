export type DocmarkEnvironment = "dev" | "prod";

const productionOrigin = "https://docmark.jorgegallardo.cl";

export function getDocmarkEnvironment(value = process.env.DOCMARK_ENV): DocmarkEnvironment {
  if (value === undefined) return "prod";
  if (value === "dev" || value === "prod") return value;
  throw new Error(`Invalid DOCMARK_ENV: ${value}. Expected "dev" or "prod".`);
}

export function getEnvironmentConfig(environment = getDocmarkEnvironment()) {
  return environment === "dev"
    ? { environment, workerName: "docmark-dev", siteUrl: "https://docmark-dev.jorgegallardo.cl", isIndexable: false }
    : { environment, workerName: "docmark", siteUrl: productionOrigin, isIndexable: true };
}

export const productionSiteUrl = productionOrigin;
