"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";

import { SessionAccount } from "@/lib/types";

interface RequestCenterShellProps {
  session: SessionAccount;
  children: ReactNode;
}

const NAV_ITEMS = [
  { href: "/request-center", label: "เมนูหลัก" },
  { href: "/request-center/upload", label: "อัปโหลดใบคำขอ OT" },
  { href: "/request-center/history", label: "ประวัติคำขอ OT" }
];

export function RequestCenterShell({ session, children }: RequestCenterShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="request-center-shell">
      <header className="request-center-header">
        <div>
          <div className="eyebrow">OT Request Operations</div>
          <div className="header-title">ศูนย์จัดการใบคำขอ OT</div>
        </div>
        <div className="header-actions">
          <span className="user-chip">{session.username}</span>
          <button className="secondary-button" type="button" onClick={handleLogout}>
            {isLoggingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
          </button>
        </div>
      </header>

      <nav className="request-center-nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`tab-button ${pathname === item.href ? "active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="request-center-content">{children}</main>
    </div>
  );
}
