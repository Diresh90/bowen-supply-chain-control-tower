"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  ["/", "▣", "Dashboard"],
  ["/procurement", "▤", "Jobs"],
  ["/production", "▦", "Production"],
  ["/freight", "♧", "Freight"],
  ["/suppliers", "♙", "Suppliers"],
] as const;

const comingSoon = [["▥", "Containers"], ["♧", "Alerts / Actions"], ["□", "Calendar"], ["◇", "Documents"], ["⚙", "Settings"]] as const;

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
            <Link key={`${label}-${index}`} className={(href === "/" ? pathname === "/" : pathname === href) ? "active" : ""} href={href}>
              <span>{icon}</span>{label}
            </Link>
          ))}
          <section className="coming-soon-nav" aria-labelledby="coming-soon-heading">
            <h2 id="coming-soon-heading">Coming Soon</h2>
            {comingSoon.map(([icon, label]) => <button key={label} type="button" disabled aria-label={`${label} (Coming Soon)`}><span>{icon}</span><span className="coming-soon-label">{label}</span><small>Coming Soon</small></button>)}
          </section>
        </nav>
      </aside>
      <main className="content">
        <div className="topbar">
          <span className="user-name">Diresh</span>
          <span className="avatar" aria-label="User profile">D</span>
        </div>
        {children}
      </main>
    </div>
  );
}
