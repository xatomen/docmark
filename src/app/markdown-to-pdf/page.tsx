import type { Metadata } from "next";
import Link from "next/link";
import { InformationalPage } from "@/components/site/informational-page";
import pageStyles from "@/components/site/informational-page.module.css";
import {
  PRACTICAL_GUIDE_MARKDOWN,
  PRACTICAL_GUIDE_MERMAID,
  PRACTICAL_GUIDE_PAGE_BREAK,
  PRACTICAL_GUIDE_TOC,
} from "@/lib/markdown/practical-guide-examples";
import styles from "./guide.module.css";

const title = "How to Convert Markdown to PDF — Step-by-Step Guide | Docmark";
const description =
  "Learn how to turn Markdown into a PDF with Docmark. Follow a practical example, customize page layout, and export using your browser.";
const canonical = "https://docmark.jorgegallardo.cl/markdown-to-pdf";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical },
  openGraph: {
    type: "website",
    siteName: "Docmark",
    title,
    description,
    url: canonical,
    locale: "en_US",
  },
  robots: { index: true, follow: true },
};

const mermaidFence = ["```mermaid", PRACTICAL_GUIDE_MERMAID, "```"].join("\n");

export default function MarkdownToPdfGuidePage() {
  return (
    <InformationalPage eyebrow="Practical guide" title="How to Convert Markdown to PDF" width="wide">
      <p className={`${pageStyles.intro} ${styles.lead}`}>
        Markdown is a plain-text way to add structure and emphasis to a document. It is quick to write, easy to revise, and stays readable as source text. A PDF is useful when you need a portable copy with page layout preserved for sharing or printing. Docmark helps you prepare that layout in your browser and sends the finished document to your browser’s print dialog.
      </p>

      <nav className={styles.contents} aria-label="Guide sections">
        <p className={styles.contentsLabel}>In this guide</p>
        <ol>
          <li><a href="#open-editor">Open the editor</a></li>
          <li><a href="#write-markdown">Write Markdown</a></li>
          <li><a href="#example-document">Try the example</a></li>
          <li><a href="#customize-document">Customize the document</a></li>
          <li><a href="#export-pdf">Export the PDF</a></li>
          <li><a href="#advanced-markdown">Use advanced Markdown features</a></li>
          <li><a href="#local-documents">Understand local documents and privacy</a></li>
        </ol>
      </nav>

      <section className={styles.section} aria-labelledby="open-editor">
        <p className={styles.step}>Step 1</p>
        <h2 id="open-editor" className={pageStyles.sectionHeading}>Open the Markdown editor</h2>
        <p>
          Open the <Link className={pageStyles.link} href="/editor">Docmark editor</Link> to start with a document in your browser. You can write in the editor or use <strong>File → Open Markdown…</strong> to choose an existing <code>.md</code> or <code>.markdown</code> file. The exact file picker depends on your browser.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="write-markdown">
        <p className={styles.step}>Step 2</p>
        <h2 id="write-markdown" className={pageStyles.sectionHeading}>Write your Markdown document</h2>
        <p>
          Use a small set of plain-text markers to organize the page. Docmark supports common Markdown and GitHub Flavored Markdown, including tables and fenced code blocks.
        </p>
        <ul className={pageStyles.list}>
          <li><code># Heading</code> and <code>## Section</code> create headings.</li>
          <li>Blank lines separate paragraphs. Use <code>**bold**</code> for emphasis and <code>*italic*</code> for a lighter emphasis.</li>
          <li><code>[Project notes](https://example.com)</code> creates a link.</li>
          <li>Start lines with <code>-</code> for a bulleted list or <code>1.</code> for a numbered list.</li>
          <li>Use pipes and a separator row to write a table.</li>
          <li>Wrap source in triple backticks to create a code block; add a language such as <code>js</code> after the opening fence when useful.</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="example-document">
        <p className={styles.step}>A practical example</p>
        <h2 id="example-document" className={pageStyles.sectionHeading}>Try a short project brief</h2>
        <p>
          This example uses headings, paragraphs, bold and italic text, a list, a GFM table, and a JavaScript code block. You can select and copy the source into the editor.
        </p>
        <pre className={styles.codeBlock} tabIndex={0} aria-label="Example Markdown document"><code>{PRACTICAL_GUIDE_MARKDOWN}</code></pre>
        <p>After pasting, review the live preview to see how the Markdown becomes a paginated document.</p>
      </section>

      <section className={styles.section} aria-labelledby="customize-document">
        <p className={styles.step}>Step 3</p>
        <h2 id="customize-document" className={pageStyles.sectionHeading}>Customize the document</h2>
        <p>
          Open <strong>Document settings</strong> to shape the printed pages. Choose A4 or Letter paper, portrait or landscape orientation, and adjust margins in millimeters. The preview updates as settings change, and Docmark paginates the content automatically for the selected layout.
        </p>
        <ul className={pageStyles.list}>
          <li><strong>Appearance:</strong> choose a document theme (Default, Technical, Academic, or Minimal), font family, base font size, line height, and text alignment.</li>
          <li><strong>Headers and footers:</strong> turn each on and set its text and alignment.</li>
          <li><strong>Page numbers:</strong> show or hide them, choose their position, and set the starting number.</li>
        </ul>
        <p>
          Review the preview after changing the page size, orientation, or typography. These settings change the space available to text and can change where pages break.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="export-pdf">
        <p className={styles.step}>Step 4</p>
        <h2 id="export-pdf" className={pageStyles.sectionHeading}>Export the PDF</h2>
        <ol className={pageStyles.list}>
          <li>Select <strong>Export PDF</strong> in the editor.</li>
          <li>Wait for your browser’s print dialog to open.</li>
          <li>Choose <strong>Save as PDF</strong> as the destination, if your browser offers it.</li>
          <li>Review the available paper size, margins, scale, and other print options.</li>
          <li>Save the PDF to your device.</li>
        </ol>
        <p>
          Print dialog labels and options vary by browser and operating system. Check the preview in the dialog before saving; results can differ between browsers and their print settings.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="advanced-markdown">
        <p className={styles.step}>Optional features</p>
        <h2 id="advanced-markdown" className={pageStyles.sectionHeading}>Use advanced Markdown features</h2>

        <div className={styles.advancedFeature}>
          <h3 className={pageStyles.subheading}>Add a table of contents</h3>
          <p>Place this complete block on its own between sections. Docmark builds the contents from document headings through level three and adds page references in the preview.</p>
          <pre className={styles.codeBlock} tabIndex={0} aria-label="Table of contents directive"><code>{PRACTICAL_GUIDE_TOC}</code></pre>
        </div>

        <div className={styles.advancedFeature}>
          <h3 className={pageStyles.subheading}>Render a Mermaid diagram</h3>
          <p>Use a fenced block labelled <code>mermaid</code>. Docmark renders supported Mermaid source locally in the browser.</p>
          <pre className={styles.codeBlock} tabIndex={0} aria-label="Mermaid diagram example"><code>{mermaidFence}</code></pre>
        </div>

        <div className={styles.advancedFeature}>
          <h3 className={pageStyles.subheading}>Start a new page</h3>
          <p>For a manual page break, put this complete directive on its own between the surrounding content:</p>
          <pre className={styles.codeBlock} tabIndex={0} aria-label="Page break directive"><code>{PRACTICAL_GUIDE_PAGE_BREAK}</code></pre>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="local-documents">
        <h2 id="local-documents" className={pageStyles.sectionHeading}>Understand local documents and privacy</h2>
        <p>
          Docmark parses and prepares your Markdown in the browser. Workspace documents and settings are saved in IndexedDB in the current browser profile; they do not automatically sync between devices. Keep a separate copy of important work by saving the Markdown file to your device.
        </p>
        <p>
          PDF export uses your browser’s print function. The document and PDF are not uploaded to a Docmark conversion server as part of that flow. If your Markdown includes images from remote URLs, your browser may request those images from their hosts. The public website also uses hosting, security, and Cloudflare Web Analytics services. Read the <Link className={pageStyles.link} href="/privacy">Privacy Policy</Link> for details.
        </p>
      </section>

      <section className={styles.callToAction} aria-label="Try Docmark">
        <div>
          <h2 className={pageStyles.sectionHeading}>Ready to make your document?</h2>
          <p>Open the editor and turn your Markdown into a print-ready preview.</p>
        </div>
        <div className={styles.actionLinks}>
          <Link href="/editor" className={pageStyles.cta}>Try Docmark <span aria-hidden="true">↗</span></Link>
          <Link href="/" className={pageStyles.link}>Explore Docmark’s features</Link>
        </div>
      </section>
    </InformationalPage>
  );
}
