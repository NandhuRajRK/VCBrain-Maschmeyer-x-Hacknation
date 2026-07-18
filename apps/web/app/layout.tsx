import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import styles from "./layout.module.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VC Brain",
  description: "Maschmeyer Group intelligence layer for startup sourcing and diligence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="grain">
        <div className={styles.shell}>
          <aside className={styles.sidebar}>
            <div className={styles.brand}>
              <span className={styles.brandIcon}>&#x2726;</span>
              <span className={styles.brandName}>VC Brain</span>
            </div>

            <nav className={styles.nav}>
              <span className={styles.navSection}>Pipeline</span>
              <a href="/" className={styles.navLink} data-active="true">
                <span className={styles.navIcon}>&#x25A0;</span>
                Dashboard
              </a>
              <a href="/apply" className={styles.navLink}>
                <span className={styles.navIcon}>&#x002B;</span>
                New Application
              </a>

              <span className={styles.navSection}>Intelligence</span>
              <a href="/search" className={styles.navLink}>
                <span className={styles.navIcon}>&#x2315;</span>
                Founder Search
              </a>

              <span className={styles.navSection}>Settings</span>
              <a href="/thesis" className={styles.navLink}>
                <span className={styles.navIcon}>&#x2630;</span>
                Thesis Config
              </a>
            </nav>

            <div className={styles.sidebarFooter}>
              <span className={styles.footerMeta}>Maschmeyer Group</span>
              <span className={styles.footerVersion}>v0.1.0</span>
            </div>
          </aside>

          <main className={styles.content}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
