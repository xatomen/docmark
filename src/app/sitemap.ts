import type { MetadataRoute } from "next";
import { getEnvironmentConfig } from "@/lib/environment";

export default function sitemap(): MetadataRoute.Sitemap {
  const environment = getEnvironmentConfig();
  if (!environment.isIndexable) return [];
  return [
    { url: `${environment.siteUrl}/` },
    { url: `${environment.siteUrl}/markdown-to-pdf` },
    { url: `${environment.siteUrl}/about` },
    { url: `${environment.siteUrl}/privacy` },
    { url: `${environment.siteUrl}/contact` },
  ];
}
