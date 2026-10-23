import Link from "next/link";
import styles from "./site-footer.module.css";

const footerLinks = [
  { href: "/about", label: "About" },
  { href: "/markdown-to-pdf", label: "Guide" },
  { href: "/privacy", label: "Privacy" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteFooter() {
  return (
    <footer className={`app-footer ${styles.footer}`}>
      <div className={styles.inner}>
        <Link href="/" className={styles.wordmark}>
          DOCMARK / 001
        </Link>
        <nav aria-label="Footer navigation" className={styles.navigation}>
          {footerLinks.map(({ href, label }) => (
            <Link key={href} href={href} className={styles.link}>
              {label}
            </Link>
          ))}
        </nav>
        <span className={styles.tagline}>Markdown in, documents out.</span>
      </div>
    </footer>
  );
}
