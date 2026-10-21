import type { Metadata } from "next";
import { InformationalPage } from "@/components/site/informational-page";
import styles from "@/components/site/informational-page.module.css";

const title = "Privacy Policy | Docmark";
const description =
  "Read how Docmark handles Markdown documents, browser storage, PDF export, technical website requests, email, and external resources.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "https://docmark.jorgegallardo.cl/privacy" },
  openGraph: {
    type: "website",
    siteName: "Docmark",
    title,
    description,
    url: "https://docmark.jorgegallardo.cl/privacy",
    locale: "en_US",
  },
};

export default function PrivacyPage() {
  return (
    <InformationalPage eyebrow="Privacy" title="Privacy Policy">
      <p className={styles.updated}>Last updated: October 21, 2026</p>

      <section className={styles.section} aria-labelledby="privacy-service">
        <h2 id="privacy-service" className={styles.sectionHeading}>The service</h2>
        <p>
          Docmark is a browser-based Markdown editor and document preview. Markdown processing and workspace storage happen in your browser, while visiting the public site also involves requests to the service that hosts it.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="privacy-documents">
        <h2 id="privacy-documents" className={styles.sectionHeading}>Your documents and local storage</h2>
        <p>
          Markdown text is parsed, sanitized, previewed, paginated, and prepared for printing in your browser. Docmark’s core editor does not upload your document or generated PDF to a Docmark document-processing service. Documents, page settings, and the last active document ID are stored in IndexedDB in your browser profile. Docmark does not sync that workspace between browsers or devices.
        </p>
        <p>
          Clearing Docmark’s site data or browser storage can remove those saved workspace documents. Keep a separate copy of important work by using the Markdown file save controls. If you enable <em>Include Docmark settings in Markdown</em>, supported page settings are written into the Markdown file’s Front Matter; otherwise those settings stay in the local workspace database.
        </p>
        <p>
          Opening a Markdown file uses a file you select in your browser. Saving writes to a file you select when supported, or downloads a Markdown file to your device. PDF export uses the browser’s print dialog and its <em>Save as PDF</em> option. The print operation does not send the document to a Docmark PDF server.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="privacy-external">
        <h2 id="privacy-external" className={styles.sectionHeading}>External resources and website requests</h2>
        <p>
          Browser requests to open the public site include technical information needed to deliver the requested pages. Cloudflare processes requests for the site’s delivery and security; this request information is separate from Markdown documents and settings stored in your browser. Docmark’s bundled Montserrat font and Mermaid renderer are served with the application. Markdown can contain images hosted elsewhere; when such an image is displayed, your browser may request it directly from that host. Following an external link also takes you to that site, which has its own privacy practices.
        </p>
        <p>
          Cloudflare provides website delivery and security services for Docmark. Some security checks may use technical or verification cookies, depending on the request; these cookies are not necessarily set on every visit. See <a className={styles.link} href="https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/" target="_blank" rel="noreferrer">Cloudflare’s cookies documentation</a> and <a className={styles.link} href="https://www.cloudflare.com/policies/privacy/" target="_blank" rel="noreferrer">Cloudflare’s Privacy Policy</a> for more information.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="privacy-analytics">
        <h2 id="privacy-analytics" className={styles.sectionHeading}>Cloudflare Web Analytics</h2>
        <p>
          Cloudflare Web Analytics, also known as Real User Monitoring (RUM), is enabled for the <code>jorgegallardo.cl</code> zone with automatic installation. Cloudflare can add its beacon to supported page responses. It reports page views and visits, page-load timing, and Core Web Vitals; for single-page applications, it can also report metrics on route changes. This helps measure how the public site performs and how visitors navigate its pages. It does not send Markdown text or generated PDFs from the editor.
        </p>
        <p>
          Cloudflare Web Analytics measures site use and performance through a browser beacon. Metrics include page views and visits, navigation or referrer information, page-load timing, and Core Web Vitals; single-page applications may also report route changes. Cloudflare describes the service as cookie-free. This measurement is separate from the technical information Cloudflare processes to deliver and secure website requests. Docmark’s Markdown text and generated PDFs are not sent to Web Analytics. For details, see Cloudflare’s <a className={styles.link} href="https://developers.cloudflare.com/web-analytics/about/" target="_blank" rel="noreferrer">Web Analytics overview</a>, <a className={styles.link} href="https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/" target="_blank" rel="noreferrer">metrics documentation</a>, and <a className={styles.link} href="https://developers.cloudflare.com/web-analytics/faq/" target="_blank" rel="noreferrer">Web Analytics FAQ</a>, as well as its <a className={styles.link} href="https://www.cloudflare.com/policies/privacy/" target="_blank" rel="noreferrer">Privacy Policy</a>.
        </p>
        <p>
          No third-party tools are currently configured in Cloudflare Zaraz. Docmark does not currently include advertising. The policy will be updated before advertising or additional analytics or measurement services are introduced.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="privacy-cookies">
        <h2 id="privacy-cookies" className={styles.sectionHeading}>Cookies and similar technologies</h2>
        <p>
          According to Cloudflare, its Web Analytics beacon does not use cookies. Separate security or verification checks may use technical cookies depending on the request; they are not necessarily set on every visit. The Docmark editor stores documents in IndexedDB, as described above, and does not use browser cookies or localStorage for document storage.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="privacy-email">
        <h2 id="privacy-email" className={styles.sectionHeading}>Email communications</h2>
        <p>
          Email sent to <a className={styles.link} href="mailto:contact@docmark.jorgegallardo.cl">contact@docmark.jorgegallardo.cl</a> is received through Cloudflare Email Routing and forwarded to Gmail. Messages are kept in Gmail as a history of inquiries and support conversations; no automatic deletion schedule is currently configured. Cloudflare may separately process technical Email Routing records, and Docmark has not verified their retention period. See Cloudflare’s <a className={styles.link} href="https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/" target="_blank" rel="noreferrer">Email Routing documentation</a> and <a className={styles.link} href="https://www.cloudflare.com/policies/privacy/" target="_blank" rel="noreferrer">Privacy Policy</a>, and Google’s <a className={styles.link} href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> for information about their services and practices.
        </p>
        <p>
          You may email the official address above to request access to, correction of, or deletion of personal data. Requests will be reviewed under applicable law, and Docmark may reasonably verify your identity when appropriate. A request does not guarantee immediate or complete deletion from copies held by email providers or other third parties. Cloudflare’s technical Email Routing records are separate from the messages stored in Gmail.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="privacy-security">
        <h2 id="privacy-security" className={styles.sectionHeading}>Security and limitations</h2>
        <p>
          Local processing reduces the need to send document content to a processing server, but it does not make browser storage a backup or guarantee that a device or browser profile is secure. Protect access to your device and keep copies of important Markdown files. Email is not an encrypted document-submission channel provided by Docmark.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="privacy-changes">
        <h2 id="privacy-changes" className={styles.sectionHeading}>Changes to this policy</h2>
        <p>
          This policy will be updated before advertising or additional analytics or measurement services are introduced, and whenever a material change is made to the application or its hosting configuration.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="privacy-contact">
        <h2 id="privacy-contact" className={styles.sectionHeading}>Privacy questions</h2>
        <p>
          Contact <a className={styles.link} href="mailto:contact@docmark.jorgegallardo.cl">contact@docmark.jorgegallardo.cl</a> with privacy questions.
        </p>
      </section>

    </InformationalPage>
  );
}
