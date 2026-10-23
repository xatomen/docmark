import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import styles from "./informational-page.module.css";

type InformationalPageProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
  width?: "standard" | "wide";
};

export function InformationalPage({ eyebrow, title, children, width = "standard" }: InformationalPageProps) {
  const wide = width === "wide";

  return (
    <div className={styles.page}>
      <SiteHeader />

      <main className={wide ? `${styles.main} ${styles.mainWide}` : styles.main}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        <div className={wide ? `${styles.content} ${styles.contentWide}` : styles.content}>
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
