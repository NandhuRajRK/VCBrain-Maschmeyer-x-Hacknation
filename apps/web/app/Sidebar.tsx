"use client";

import { Fragment, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "./layout.module.css";
import AsciiWave from "./AsciiWave";

const NAV_ITEMS = [
  {
    section: "Pipeline",
    links: [
      { href: "/", icon: "■", label: "Dashboard" },
      { href: "/apply", icon: "+", label: "New Application" },
    ],
  },
  {
    section: "Intelligence",
    links: [
      { href: "/search", icon: "⌕", label: "Founder Search" },
    ],
  },
  {
    section: "Settings",
    links: [
      { href: "/thesis", icon: "☰", label: "Thesis Config" },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const toggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  return (
    <>
      <aside className={styles.sidebar} data-collapsed={collapsed}>
        <AsciiWave />

        <div className={styles.brand}>
          <span className={styles.brandIcon}>&#x2726;</span>
          <span className={styles.brandName}>VC Brain</span>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((group) => (
            <Fragment key={group.section}>
              <span className={styles.navSection}>{group.section}</span>
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={styles.navLink}
                  data-active={pathname === link.href}
                  title={collapsed ? link.label : undefined}
                >
                  <span className={styles.navIcon}>{link.icon}</span>
                  <span className={styles.navLabel}>{link.label}</span>
                </Link>
              ))}
            </Fragment>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <span className={styles.footerMeta}>Maschmeyer Group</span>
          <span className={styles.footerVersion}>v0.1.0</span>
        </div>
      </aside>

      {/* Toggle lives outside the clipped <aside> so overflow:hidden
          on the sidebar cannot cut it off. Fixed to the viewport at
          the sidebar's right edge. */}
      <button
        type="button"
        className={styles.collapseBtn}
        data-collapsed={collapsed}
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <span className={styles.collapseIcon} data-collapsed={collapsed}>
          &#x2039;
        </span>
      </button>
    </>
  );
}
