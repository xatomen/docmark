import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import styles from "./informational-page.module.css";

type InformationalPageProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
};

export function InformationalPage({ eyebrow, title, children }: InformationalPageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark}>
          docmark<span aria-hidden="true">.</span>
        </Link>
        <Link href="/editor" className={styles.editorLink}>
          Open editor <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <main className={styles.main}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.content}>
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
