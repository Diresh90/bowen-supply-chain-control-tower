"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">B</span>
          <span><strong>Bowen</strong><small>Control Tower</small></span>
        </div>
        <nav aria-label="Main navigation">
          <Link className={pathname === "/suppliers" ? "active" : ""} href="/suppliers">
            <span>◈</span> Approved Suppliers
          </Link>
          <Link className={pathname === "/procurement" ? "active" : ""} href="/procurement">
            <span>▤</span> Procurement
          </Link>
        </nav>
        <div className="phase-card"><strong>Phase 1</strong><span>Database persistence</span><i>Supabase connected</i></div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
