import { EditorWorkspace } from "@/components/editor/editor-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Markdown Editor | Docmark" },
  description:
    "Write Markdown, preview paginated documents, customize typography and themes, and print to PDF locally in your browser.",
  alternates: { canonical: "https://docmark.jorgegallardo.cl/editor" },
  robots: { index: false, follow: true },
  openGraph: {
    type: "website",
    siteName: "Docmark",
    title: "Markdown Editor | Docmark",
    description:
      "Write Markdown, preview paginated documents, customize typography and themes, and print to PDF locally in your browser.",
    url: "https://docmark.jorgegallardo.cl/editor",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Markdown Editor | Docmark",
    description:
      "Write Markdown, preview paginated documents, customize typography and themes, and print to PDF locally in your browser.",
  },
};

export default function EditorPage() {
  return <EditorWorkspace />;
}
