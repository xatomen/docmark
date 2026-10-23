"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type KeyboardEvent } from "react";
import styles from "./site-header.module.css";

const navigationLinks = [
  { href: "/", label: "Home" },
  { href: "/markdown-to-pdf", label: "Guide" },
  { href: "/about", label: "About" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  return <SiteHeaderContent key={pathname} pathname={pathname} />;
}

function SiteHeaderContent({ pathname }: { pathname: string }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  function closeMenu() {
    setMobileMenuOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && mobileMenuOpen) {
      closeMenu();
      menuButtonRef.current?.focus();
    }
  }

  function linkClassName(href: string, action = false) {
    const active = pathname === href;
    return [styles.link, active ? styles.active : "", action ? styles.action : ""]
      .filter(Boolean)
      .join(" ");
  }

  return (
    <header className={`site-header ${styles.header}`} onKeyDown={handleKeyDown}>
      <div className={styles.inner}>
        <Link
          href="/"
          className={styles.wordmark}
          aria-label="Docmark home"
          aria-current={pathname === "/" ? "page" : undefined}
          onClick={closeMenu}
        >
          docmark<span aria-hidden="true">.</span>
        </Link>

        <nav aria-label="Primary navigation" className={styles.desktopNavigation}>
          {navigationLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={linkClassName(href)}
              aria-current={pathname === href ? "page" : undefined}
              onClick={closeMenu}
            >
              {label}
            </Link>
          ))}
          <Link href="/editor" className={linkClassName("/editor", true)} onClick={closeMenu}>
            Open editor
          </Link>
        </nav>

        <div className={styles.mobileActions}>
          <Link href="/editor" className={`${styles.link} ${styles.action}`} onClick={closeMenu}>
            Open editor
          </Link>
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menuToggle}
            aria-expanded={mobileMenuOpen}
            aria-controls="site-mobile-navigation"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? "Close" : "Menu"}
          </button>
        </div>

        <nav
          id="site-mobile-navigation"
          aria-label="Mobile navigation"
          className={styles.mobileNavigation}
          hidden={!mobileMenuOpen}
        >
          {navigationLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={linkClassName(href)}
              aria-current={pathname === href ? "page" : undefined}
              onClick={closeMenu}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
