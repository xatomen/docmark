import { bindings, defineConfig, defineWorker } from "cf/config";
import { getEnvironmentConfig } from "./src/lib/environment.mjs";

const { workerName } = getEnvironmentConfig();

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
