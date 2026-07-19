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

/* The current width is the ceiling; the sidebar can only be made narrower. */
const MAX_WIDTH = 240;
const MIN_WIDTH = 176;

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const toggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  /* Drag the right edge to resize. Drives the shared --sidebar-width
   * variable, so both the sidebar and the content margin follow. */
  const startResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const root = document.documentElement;
    const startX = e.clientX;
    const startW =
      parseInt(getComputedStyle(root).getPropertyValue("--sidebar-width"), 10) || MAX_WIDTH;

    root.setAttribute("data-resizing", "");

    const onMove = (ev: PointerEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + (ev.clientX - startX)));
      root.style.setProperty("--sidebar-width", `${next}px`);
    };
    const onUp = () => {
      root.removeAttribute("data-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  return (
    <>
      <aside className={styles.sidebar} data-collapsed={collapsed}>
        <AsciiWave />

        <div className={styles.brand}>
          <span className={styles.brandIcon}>&#x2726;</span>
          <span className={styles.brandName}>Iskra</span>
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

        {!collapsed && (
          <div
            className={styles.resizeHandle}
            onPointerDown={startResize}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
          />
        )}
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
