import type { Metadata } from "next";
import Link from "next/link";
import { InformationalPage } from "@/components/site/informational-page";
import styles from "@/components/site/informational-page.module.css";

const title = "About Docmark | Docmark";
const description =
  "Learn how Docmark turns Markdown into paginated, print-ready documents in your browser, with local saving and browser-based PDF export.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "https://docmark.jorgegallardo.cl/about" },
  openGraph: {
    type: "website",
    siteName: "Docmark",
    title,
    description,
    url: "https://docmark.jorgegallardo.cl/about",
    locale: "en_US",
  },
};

export default function AboutPage() {
  return (
    <InformationalPage eyebrow="About Docmark" title="Markdown in. Documents out.">
      <p className={styles.intro}>
        Docmark is a browser-based workspace for turning Markdown into polished, paginated documents. It helps writers prepare reports and other printable documents without moving their Markdown through a document-conversion server.
      </p>

      <section className={styles.section} aria-labelledby="about-workflow">
        <h2 id="about-workflow" className={styles.sectionHeading}>How it works</h2>
        <p>
          Write or open a Markdown file in the editor. Docmark renders a live preview, lays it out across physical pages, and lets you adjust the page and typography settings. When the document is ready, choose <strong>Export PDF</strong> and select <strong>Save as PDF</strong> in your browser’s print dialog.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="about-features">
        <h2 id="about-features" className={styles.sectionHeading}>What you can do</h2>
        <ul className={styles.featureList}>
          <li>Edit Markdown with a live document preview.</li>
          <li>Paginate A4 or Letter pages in portrait or landscape, with configurable margins.</li>
          <li>Choose document fonts, size, line height, alignment, and themes.</li>
          <li>Add page numbers, headers, footers, and a generated table of contents.</li>
          <li>Render Mermaid diagrams in the browser.</li>
          <li>Keep documents in browser storage, or explicitly open and save Markdown files on your device.</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="about-local">
        <h2 id="about-local" className={styles.sectionHeading}>What local processing means</h2>
        <p>
          Markdown parsing, preview rendering, pagination, Mermaid rendering, and print preparation run in your browser. Workspace documents and settings are saved in that browser’s IndexedDB. The PDF is produced through the browser’s print function; Docmark does not upload the document or PDF as part of that flow.
        </p>
        <p>
          Local storage is limited to the current browser profile and device. It is not cloud sync or a backup, and clearing the site’s browser data can remove saved workspace documents. Images embedded from remote URLs may still be requested from their image host when displayed.
        </p>
      </section>

      <Link href="/editor" className={styles.cta}>Open the Docmark editor <span aria-hidden="true">↗</span></Link>
    </InformationalPage>
  );
}
