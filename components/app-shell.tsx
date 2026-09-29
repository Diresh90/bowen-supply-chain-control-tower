"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  ["/", "▣", "Dashboard"],
  ["/procurement", "▤", "Jobs"],
  ["/procurement", "▧", "Purchase Orders"],
  ["/production", "▦", "Production"],
  ["/freight", "♧", "Freight"],
  ["#", "▥", "Containers"],
  ["/suppliers", "♙", "Suppliers"],
  ["#", "♧", "Alerts"],
  ["#", "□", "Calendar"],
  ["#", "◇", "Documents"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand">
          <Image
            className="brand-logo"
            src="/bowen-logo.svg"
            alt="Bowen Engineered Storage Systems"
            width={741}
            height={227}
            priority
          />
        </div>
        <nav aria-label="Main navigation">
          {navigation.map(([href, icon, label], index) => (
            <Link key={`${label}-${index}`} className={(href === "/" ? pathname === "/" : pathname === href && label !== "Purchase Orders") ? "active" : ""} href={href}>
              <span>{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <Link className="settings-link" href="#"><span>⚙</span> Settings <b>«</b></Link>
      </aside>
      <main className="content">
        <div className="topbar">
          <div className="global-search">⌕ <input aria-label="Search" placeholder="Search jobs, PO, containers..." /></div>
          <button className="top-icon" aria-label="Notifications">♧<em>3</em></button>
          <span className="user-name">Diresh</span>
          <span className="avatar" aria-label="User profile">D</span>
        </div>
        {children}
      </main>
    </div>
  );
}
