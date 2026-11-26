import type { NextConfig } from "next";
import { getEnvironmentConfig } from "./src/lib/environment";

const environment = getEnvironmentConfig();

const nextConfig: NextConfig = {
  distDir: process.env.DOCMARK_NEXT_DIST_DIR ?? ".next",
  env: { DOCMARK_ENV: environment.environment },
  async headers() {
    return environment.isIndexable ? [] : [{
      source: "/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }];
  },
};

export default nextConfig;
