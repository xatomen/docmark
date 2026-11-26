export type DocmarkEnvironment = "dev" | "prod";
export type EnvironmentConfig = Readonly<{
  environment: DocmarkEnvironment;
  workerName: "docmark" | "docmark-dev";
  siteUrl: string;
  isIndexable: boolean;
}>;
export const environments: Readonly<Record<DocmarkEnvironment, EnvironmentConfig>>;
export function getDocmarkEnvironment(value?: string): DocmarkEnvironment;
export function getEnvironmentConfig(value?: string): EnvironmentConfig;
export const environmentBuildMarker: string;
