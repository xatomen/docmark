import type { Metadata } from "next";
import Link from "next/link";
import { InformationalPage } from "@/components/site/informational-page";
import styles from "@/components/site/informational-page.module.css";

const title = "Contact Docmark | Docmark";
const description =
  "Contact the Docmark team for general questions, bug reports, feature suggestions, privacy questions, or help using Docmark.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "https://docmark.jorgegallardo.cl/contact" },
  openGraph: {
    type: "website",
    siteName: "Docmark",
    title,
    description,
    url: "https://docmark.jorgegallardo.cl/contact",
    locale: "en_US",
  },
};

export default function ContactPage() {
  return (
    <InformationalPage eyebrow="Contact" title="Get in touch.">
      <section className={styles.section} aria-labelledby="contact-email">
        <h2 id="contact-email" className={styles.sectionHeading}>Email Docmark</h2>
        <div className={styles.contactCard}>
          <a className={`${styles.link} ${styles.contactAddress}`} href="mailto:contact@docmark.jorgegallardo.cl">
            contact@docmark.jorgegallardo.cl
          </a>
          <p className={styles.contactDescription}>A direct email channel for questions and feedback about Docmark.</p>
          <ul className={styles.contactReasons}>
            <li>General questions.</li>
            <li>Bug reports.</li>
            <li>Feature suggestions.</li>
            <li>Privacy questions.</li>
            <li>Support related to Docmark.</li>
          </ul>
        </div>
      </section>
      <p>
        Selecting the address opens your chosen mail application. Use it for privacy questions or requests to access, correct, or delete personal data. See the <Link className={styles.link} href="/privacy">Privacy Policy</Link> for how these requests are handled. The site has no contact form or support-ticket backend.
      </p>
    </InformationalPage>
  );
}
