import type { MetadataRoute } from "next";
import { getEnvironmentConfig } from "@/lib/environment.mjs";

export default function robots(): MetadataRoute.Robots {
  const environment = getEnvironmentConfig();
  if (!environment.isIndexable) return { rules: { userAgent: "*", allow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${environment.siteUrl}/sitemap.xml`,
  };
}
