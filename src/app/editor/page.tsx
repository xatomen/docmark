import { EditorWorkspace } from "@/components/editor/editor-workspace";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/site-footer";
import { getEnvironmentConfig } from "@/lib/environment.mjs";
const env = getEnvironmentConfig();

export const metadata: Metadata = {
  title: { absolute: "Markdown Editor | Docmark" },
  description:
    "Write Markdown, preview paginated documents, customize typography and themes, and print to PDF locally in your browser.",
  alternates: env.isIndexable ? { canonical: `${env.siteUrl}/editor` } : undefined,
  robots: env.isIndexable ? { index: false, follow: true } : { index: false, follow: false },
  openGraph: env.isIndexable ? {
    type: "website",
    siteName: "Docmark",
    title: "Markdown Editor | Docmark",
    description:
      "Write Markdown, preview paginated documents, customize typography and themes, and print to PDF locally in your browser.",
    url: `${env.siteUrl}/editor`,
    locale: "en_US",
  } : undefined,
  twitter: env.isIndexable ? {
    card: "summary_large_image",
    title: "Markdown Editor | Docmark",
    description:
      "Write Markdown, preview paginated documents, customize typography and themes, and print to PDF locally in your browser.",
  } : undefined,
};

export default function EditorPage() {
  return (
    <>
      <EditorWorkspace />
      <SiteFooter />
    </>
  );
}
