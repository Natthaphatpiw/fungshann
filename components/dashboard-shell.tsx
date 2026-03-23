"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MouseEvent, ReactNode, useEffect, useState } from "react";

import { MENU_ITEMS } from "@/lib/constants";
import { SessionAccount } from "@/lib/types";

interface DashboardShellProps {
  session: SessionAccount;
  children: ReactNode;
}

function MenuGlyph({
  icon
}: {
  icon: (typeof MENU_ITEMS)[number]["icon"];
}) {
  switch (icon) {
    case "ot":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 16h3V8H6v8Zm5 0h3V5h-3v11Zm5 0h3v-6h-3v6Z" fill="currentColor" />
        </svg>
      );
    case "salary":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 6h14v12H5V6Zm2 2v2h10V8H7Zm0 4v4h4v-4H7Zm6 0h4v2h-4v-2Z"
            fill="currentColor"
          />
        </svg>
      );
    case "employees":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM4 19v-1c0-2.2 2.7-4 6-4s6 1.8 6 4v1H4Zm14.5 0v-.8c0-1-.4-1.9-1.1-2.6 1.7.4 2.6 1.4 2.6 2.9v.5h-1.5Z"
            fill="currentColor"
          />
        </svg>
      );
    case "reports":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5h12v14H6V5Zm2 3v2h8V8H8Zm0 4v2h5v-2H8Z" fill="currentColor" />
        </svg>
      );
    case "departments":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M11 5H5v5h6V5Zm8 0h-6v5h6V5ZM11 14H5v5h6v-5Zm8 0h-6v5h6v-5Z"
            fill="currentColor"
          />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="m12 8.7 1.2-2.2 2 .5.2 2.5 1.7 1.1 2.2-1.1 1.1 1.7-1.5 1.9.2 2 2 1-.6 2.1-2.5.1-1.3 1.6.7 2.3-1.9.9-1.7-1.8h-2L9 22l-1.9-.9.7-2.3-1.3-1.6-2.5-.1-.6-2.1 2-1 .2-2-1.5-1.9 1.1-1.7 2.2 1.1 1.7-1.1.2-2.5 2-.5L12 8.7Zm0 6.3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            fill="currentColor"
          />
        </svg>
      );
  }
}

export function DashboardShell({ session, children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const storageKey = `fshann-sidebar-${session.factoryId}`;
  const menuItems = MENU_ITEMS.filter((item) => item.roles.includes(session.role));
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    setCollapsed(saved === "collapsed");
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    window.localStorage.setItem(storageKey, collapsed ? "collapsed" : "expanded");
  }, [collapsed, hydrated, storageKey]);

  function toggleSidebar() {
    setCollapsed((current) => !current);
  }

  function handleSidebarStripClick(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;

    if (target.closest("a, button")) {
      return;
    }

    toggleSidebar();
  }

  function handleMenuLinkClick(event: MouseEvent<HTMLAnchorElement>) {
    event.stopPropagation();

    if (!collapsed) {
      setCollapsed(true);
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="dashboard-shell">
      <aside
        className={`sidebar ${collapsed ? "collapsed" : "expanded"} ${hydrated ? "ready" : ""}`}
        onClick={handleSidebarStripClick}
      >
        <div className="sidebar-inner">
          <div className="sidebar-header">
            <div className="brand-badge small">FS</div>
            {!collapsed ? (
              <div>
                <div className="eyebrow">Factory Workspace</div>
                <strong>{session.factoryLabel}</strong>
              </div>
            ) : null}
          </div>

          <nav className="sidebar-nav">
            {menuItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  className={`nav-link ${active ? "active" : ""}`}
                  href={item.href}
                  title={item.label}
                  onClick={handleMenuLinkClick}
                >
                  <span className="menu-icon">
                    <MenuGlyph icon={item.icon} />
                  </span>
                  {!collapsed ? <span className="nav-label">{item.label}</span> : null}
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            {collapsed ? "FS" : "Fong Shann HR"}
          </div>
        </div>
      </aside>

      <div className="workspace-shell">
        <header className="workspace-header">
          <div className="header-leading">
            <button
              className="icon-button sidebar-toggle"
              type="button"
              onClick={toggleSidebar}
              aria-label={collapsed ? "กางเมนู" : "หุบเมนู"}
              title={collapsed ? "กางเมนู" : "หุบเมนู"}
            >
              <span />
              <span />
              <span />
            </button>
            <div>
              <div className="eyebrow">Signed in</div>
              <div className="header-title">{session.factoryLabel}</div>
            </div>
          </div>
          <div className="header-actions">
            {session.role === "visitor" && session.departmentScope ? (
              <span className="user-chip">{`แผนก: ${session.departmentScope}`}</span>
            ) : null}
            <span className="user-chip">{session.username}</span>
            <button className="secondary-button" type="button" onClick={handleLogout}>
              {isLoggingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
            </button>
          </div>
        </header>

        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
