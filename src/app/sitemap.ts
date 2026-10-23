import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://docmark.jorgegallardo.cl/" },
    { url: "https://docmark.jorgegallardo.cl/markdown-to-pdf" },
    { url: "https://docmark.jorgegallardo.cl/about" },
    { url: "https://docmark.jorgegallardo.cl/privacy" },
    { url: "https://docmark.jorgegallardo.cl/contact" },
  ];
}
