import { bindings, defineConfig, defineWorker } from "cf/config";

const environment = process.env.DOCMARK_ENV;
if (environment !== undefined && environment !== "dev" && environment !== "prod") {
  throw new Error(`Invalid DOCMARK_ENV: ${environment}. Expected "dev" or "prod".`);
}
const workerName = environment === "dev" ? "docmark-dev" : "docmark";

export default defineConfig({
  worker: defineWorker({
    name: workerName,
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-04",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
    },
  }),
});
