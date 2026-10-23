import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/site-footer";
import styles from "./landing.module.css";

const title = "Markdown to PDF Converter — Private & Local | Docmark";
const description =
  "Edit Markdown, preview paginated documents, render Mermaid diagrams, and export PDF through your browser’s print dialog with Docmark.";

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
    "A4 and Letter page layouts",
    "Typography and document themes",
    "Headers, footers, and page numbering",
    "Table of contents",
    "Mermaid diagrams",
    "Local document storage",
    "Open and save Markdown files",
  ],
} as const;

const webSite = {
  "@type": "WebSite",
  name: "Docmark",
  alternateName: "docmark.jorgegallardo.cl",
  url: "https://docmark.jorgegallardo.cl/",
} as const;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [webSite, webApplication],
} as const;

const features = [
  {
    title: "Edit with a live preview",
    description: "Write Markdown and see the document take shape as you work.",
  },
  {
    title: "Export through your browser",
    description: "Use Export PDF, then choose Save as PDF in the browser’s print dialog.",
  },
  {
    title: "Lay out physical pages",
    description: "Choose A4 or Letter, portrait or landscape, margins, and automatic pagination.",
  },
  {
    title: "Set the document style",
    description: "Adjust typography and themes, and add a cover, headers, footers, and page numbers.",
  },
  {
    title: "Build a table of contents",
    description: "Add the `:::toc` directive to generate a contents list with page references.",
  },
  {
    title: "Render Mermaid diagrams",
    description: "Write a Mermaid code fence and Docmark renders the diagram in the browser.",
  },
  {
    title: "Keep a local workspace",
    description: "Documents and settings are saved in this browser’s IndexedDB storage.",
  },
  {
    title: "Work with Markdown files",
    description: "Open .md or .markdown files, then save to a chosen file or download a copy.",
  },
] as const;

const faqs = [
  {
    question: "How do I convert Markdown to PDF?",
    answer: "Write or open a Markdown file, review the paginated preview, and choose Export PDF. In the browser’s print dialog, select Save as PDF.",
  },
  {
    question: "Is Docmark free to use?",
    answer: "Docmark is currently free to use and does not require an account.",
  },
  {
    question: "Are my Markdown documents uploaded to a server?",
    answer: "The editor processes documents in your browser and stores them in that browser’s IndexedDB. Docmark does not upload them to a document-conversion server. The public site uses hosting, security, and Web Analytics services, and images in your Markdown may be requested from their remote hosts.",
  },
  {
    question: "Can I customize the PDF layout?",
    answer: "Yes. You can choose A4 or Letter paper, portrait or landscape, margins, typography, themes, a cover, headers, footers, and page numbers.",
  },
  {
    question: "Does Docmark support Mermaid diagrams?",
    answer: "Yes. Add a fenced code block marked mermaid to render a diagram in the browser preview and printed document.",
  },
  {
    question: "Can I open and save Markdown files?",
    answer: "Yes. Docmark supports .md and .markdown files. Depending on your browser, saving writes to a selected file or downloads a Markdown copy to your device.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
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
          Docmark is a calm workspace for turning Markdown into polished,
          paginated documents. Your documents stay in the browser while you work.
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

      <section className={styles.section} aria-labelledby="landing-features">
        <div className={styles.sectionInner}>
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrow}>A considered document workflow</p>
            <h2 id="landing-features" className={styles.sectionHeading}>
              Everything you need to go from Markdown to PDF
            </h2>
            <p className={styles.sectionLead}>
              Edit, arrange, and prepare a document for printing in one browser-based workspace.
            </p>
          </div>
          <ul className={styles.featureList}>
            {features.map(({ title: featureTitle, description: featureDescription }) => (
              <li key={featureTitle} className={styles.feature}>
                <h3 className={styles.featureTitle}>{featureTitle}</h3>
                <p className={styles.featureDescription}>{featureDescription}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="landing-workflow">
        <div className={styles.sectionInner}>
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrow}>A simple process</p>
            <h2 id="landing-workflow" className={styles.sectionHeading}>How it works</h2>
          </div>
          <ol className={styles.workflow}>
            <li className={styles.workflowStep}>
              <span className={styles.stepNumber} aria-hidden="true">01</span>
              <div>
                <h3 className={styles.featureTitle}>Write or open Markdown</h3>
                <p className={styles.featureDescription}>Start in the editor or open an existing .md or .markdown file.</p>
              </div>
            </li>
            <li className={styles.workflowStep}>
              <span className={styles.stepNumber} aria-hidden="true">02</span>
              <div>
                <h3 className={styles.featureTitle}>Customize your document</h3>
                <p className={styles.featureDescription}>Review the live preview and adjust page layout and typography.</p>
              </div>
            </li>
            <li className={styles.workflowStep}>
              <span className={styles.stepNumber} aria-hidden="true">03</span>
              <div>
                <h3 className={styles.featureTitle}>Export as PDF</h3>
                <p className={styles.featureDescription}>Choose Export PDF, then save the result from your browser’s print dialog.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="landing-local">
        <div className={`${styles.sectionInner} ${styles.localFirst}`}>
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrow}>Designed for local work</p>
            <h2 id="landing-local" className={styles.sectionHeading}>Your documents, in your browser</h2>
          </div>
          <div className={styles.localCopy}>
            <p>
              Markdown is processed in the browser, and workspace documents and settings are stored locally. The workspace does not sync to the cloud. Exporting a PDF uses the browser’s print function and does not upload your document to a Docmark conversion server.
            </p>
            <p>
              The public website uses Cloudflare for delivery and security, and Cloudflare Web Analytics to measure site use and performance. If your Markdown includes remote images, your browser may request them from their hosts when displayed. Learn more in <Link className={styles.inlineLink} href="/about">About Docmark</Link> and the <Link className={styles.inlineLink} href="/privacy">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="landing-faq">
        <div className={styles.sectionInner}>
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrow}>Good to know</p>
            <h2 id="landing-faq" className={styles.sectionHeading}>Frequently asked questions</h2>
          </div>
          <div className={styles.faqList}>
            {faqs.map(({ question, answer }) => (
              <details key={question} className={styles.faqItem}>
                <summary className={styles.faqQuestion}>{question}</summary>
                <p className={styles.faqAnswer}>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="landing-start">
        <div className={styles.finalCtaInner}>
          <div>
            <p className={styles.eyebrow}>Ready when you are</p>
            <h2 id="landing-start" className={styles.ctaHeading}>Give your Markdown a page.</h2>
          </div>
          <Link href="/editor" className={styles.finalCtaLink}>
            Open the editor <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
