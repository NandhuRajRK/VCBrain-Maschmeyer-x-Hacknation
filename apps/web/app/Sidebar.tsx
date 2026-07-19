"use client";

import { Fragment, useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Plus,
  Search,
  Settings2,
  Sparkles,
  UserCircle,
  LogOut,
} from "lucide-react";
import styles from "./layout.module.css";
import AsciiWave from "./AsciiWave";
import IskraOrb from "./IskraOrb";
import { useWorkspaceAuth } from "./AuthProvider";
import { fetchUsage } from "../lib/api";

const NAV_ITEMS = [
  {
    section: "Pipeline",
    links: [
      { href: "/", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/opportunities", icon: Plus, label: "Deal Flow" },
    ],
  },
  {
    section: "Intelligence",
    links: [
      { href: "/search", icon: Search, label: "Iskra" },
    ],
  },
  {
    section: "Settings",
    links: [
      { href: "/thesis", icon: Settings2, label: "Thesis Config" },
    ],
  },
];

/* The current width is the ceiling; the sidebar can only be made narrower. */
const MAX_WIDTH = 240;
const MIN_WIDTH = 176;

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();
  const auth = useWorkspaceAuth();
  const [usage, setUsage] = useState({ used: 0, limit: 100, remaining: 100, label: "Analysis credits" });

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchUsage().then(setUsage).catch(() => undefined); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggle = useCallback(() => {
    if (window.innerWidth <= 760) {
      setMobileOpen((prev) => !prev);
      return;
    }
    setCollapsed((prev) => !prev);
  }, []);

  const applyTheme = useCallback((next: "dark" | "light" | "system") => {
    const resolved = next === "system"
      ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : next;
    document.documentElement.dataset.theme = resolved;
  }, []);

  const changeTheme = useCallback((next: "dark" | "light" | "system") => {
    setTheme(next);
    localStorage.setItem("iskra-theme", next);
    applyTheme(next);
  }, [applyTheme]);

  useEffect(() => {
    const saved = localStorage.getItem("iskra-theme") as "dark" | "light" | "system" | null;
    const initial = saved && ["dark", "light", "system"].includes(saved) ? saved : "dark";
    applyTheme(initial);
    const syncSavedTheme = window.setTimeout(() => setTheme(initial), 0);
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const syncSystem = () => { if ((localStorage.getItem("iskra-theme") ?? "dark") === "system") applyTheme("system"); };
    media.addEventListener("change", syncSystem);
    return () => {
      window.clearTimeout(syncSavedTheme);
      media.removeEventListener("change", syncSystem);
    };
  }, [applyTheme]);

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
      <aside
        className={styles.sidebar}
        data-collapsed={collapsed}
        data-mobile-open={mobileOpen}
      >
        <AsciiWave />

        <div className={styles.brand}>
          <span className={styles.brandIcon}><IskraOrb size={20} /></span>
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
                  <span className={styles.navIcon}>
                    <link.icon size={17} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className={styles.navLabel}>{link.label}</span>
                </Link>
              ))}
            </Fragment>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <span className={styles.footerMeta}>{auth.organizationName}</span>
          <span className={styles.footerVersion}>v0.1.0</span>
          <div className={styles.profileArea}>
            <button
              type="button"
              className={styles.profileButton}
              onClick={() => setProfileOpen((open) => !open)}
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              title="Profile"
            >
              <UserCircle size={18} aria-hidden="true" />
              <span className={styles.profileLabel}>{auth.name}</span>
            </button>
          </div>
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

      {profileOpen && (
        <div className={styles.profileMenu} data-collapsed={collapsed}>
          <div className={styles.usageCard}>
            <div className={styles.usageTop}>
              <span className={styles.usageLabel}><Sparkles size={14} aria-hidden="true" /> {usage.label}</span>
              <span>{usage.remaining} left</span>
            </div>
            <div className={styles.usageNumbers}><strong>{usage.used}</strong><span>/ {usage.limit}</span></div>
            <div className={styles.usageBar} aria-label={`${usage.used} of ${usage.limit} credits used`}><span style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }} /></div>
            <span className={styles.usageNote}>{auth.configured ? "Organization workspace" : "Demo workspace"}</span>
          </div>
          <div className={styles.themeControl} role="group" aria-label="Color theme">
            {(["dark", "light", "system"] as const).map((option) => (
              <button key={option} type="button" data-active={theme === option} onClick={() => changeTheme(option)}>
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
          <button type="button" className={styles.logoutButton} title={auth.configured ? "Sign out" : "Demo session"} onClick={() => void auth.signOut()} disabled={!auth.configured}>
            <LogOut size={16} aria-hidden="true" />
            <span>{auth.configured ? "Sign out" : "Demo session"}</span>
          </button>
        </div>
      )}

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
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </span>
      </button>
    </>
  );
}
