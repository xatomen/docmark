import { describe, expect, it } from "vitest";
import { getDocmarkEnvironment, getEnvironmentConfig } from "./environment.mjs";

describe("Docmark environment configuration", () => {
  it("defaults local commands to production-compatible behavior", () => {
    expect(getDocmarkEnvironment(undefined)).toBe("prod");
  });

  it.each([
    ["dev", "docmark-dev", "https://docmark-dev.jorgegallardo.cl", false],
    ["prod", "docmark", "https://docmark.jorgegallardo.cl", true],
  ] as const)("maps %s to the expected worker and origin", (environment, workerName, siteUrl, isIndexable) => {
    expect(getEnvironmentConfig(environment)).toEqual({ environment, workerName, siteUrl, isIndexable });
  });

  it("rejects invalid explicit values", () => {
    expect(() => getDocmarkEnvironment("stage")).toThrow(/Invalid DOCMARK_ENV/);
  });

  it("rejects an explicitly empty value instead of silently choosing an environment", () => {
    expect(() => getDocmarkEnvironment("")).toThrow(/Invalid DOCMARK_ENV/);
  });
});
