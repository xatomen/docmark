import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/site-footer";

const title = "Markdown to PDF Converter — Private & Local | Docmark";
const description =
  "Convert Markdown into polished PDF documents directly in your browser. Live preview, pagination, themes, Mermaid diagrams and no file uploads.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "https://docmark.jorgegallardo.cl/" },
  openGraph: {
    type: "website",
    siteName: "Docmark",
    title,
    description,
    url: "https://docmark.jorgegallardo.cl/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

const webApplication = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Docmark",
  url: "https://docmark.jorgegallardo.cl/",
  description,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  isAccessibleForFree: true,
  offers: {
    "@type": "Offer",
    price: 0,
    priceCurrency: "USD",
  },
  featureList: [
    "Markdown editing",
    "Live document preview",
    "Browser print to PDF",
    "Automatic pagination",
    "Table of contents",
    "Mermaid diagrams",
    "Document themes",
    "Local in-browser processing",
  ],
} as const;

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webApplication).replace(/</g, "\\u003c"),
        }}
      />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="font-mono text-lg font-semibold tracking-tight">
          docmark<span className="text-accent">.</span>
        </Link>
        <span className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted">
          local-first · markdown to pdf
        </span>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-24 pt-12 sm:px-10">
        <p className="mb-6 font-mono text-xs uppercase tracking-[0.22em] text-accent">
          Documents, in your hands
        </p>
        <h1 className="max-w-3xl text-5xl font-semibold leading-[1.08] tracking-[-0.055em] sm:text-7xl">
          Write in Markdown.
          <br />
          <span className="text-muted">Make it a document.</span>
        </h1>
        <p className="mt-7 max-w-xl text-base leading-7 text-muted sm:text-lg">
          Docmark is a calm workspace for turning Markdown into polished PDF
          documents. Your content stays on your device.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Link
            href="/editor"
            className="inline-flex items-center gap-3 rounded-md bg-accent px-5 py-3 text-sm font-medium text-accent-foreground transition hover:opacity-90"
          >
            Open the editor <span aria-hidden="true">↗</span>
          </Link>
          <span className="font-mono text-xs text-muted">A focused place for your words.</span>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
