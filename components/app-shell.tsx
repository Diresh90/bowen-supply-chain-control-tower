"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, CalendarDays, ClipboardList, Container, Factory, FileText, Handshake, LayoutDashboard, LogOut, Settings, Ship, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSession } from "@/components/auth-gate";
import { signOut } from "@/lib/auth";

// Icons describe what each section is for: overview, orders, supplier production, sea freight, supplier relationships.
const navigation: [string, LucideIcon, string][] = [
  ["/", LayoutDashboard, "Dashboard"],
  ["/procurement", ClipboardList, "Jobs"],
  ["/production", Factory, "Production"],
  ["/freight", Ship, "Freight"],
  ["/suppliers", Handshake, "Suppliers"],
];

const comingSoon: [LucideIcon, string][] = [[Container, "Containers"], [Bell, "Alerts / Actions"], [CalendarDays, "Calendar"], [FileText, "Documents"]];
const ICON = { size: 18, strokeWidth: 1.8, "aria-hidden": true } as const;

function displayName(email: string) {
  const name = email.split("@")[0].split(/[._-]/)[0] || email;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const email = useSession()?.email ?? "";
  const name = displayName(email);
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
          {navigation.map(([href, Icon, label]) => (
            <Link key={label} className={(href === "/" ? pathname === "/" : pathname === href) ? "active" : ""} href={href}>
              <span className="nav-icon"><Icon {...ICON} /></span>{label}
            </Link>
          ))}
          <section className="coming-soon-nav" aria-labelledby="coming-soon-heading">
            <h2 id="coming-soon-heading">Coming Soon</h2>
            {comingSoon.map(([Icon, label]) => <button key={label} type="button" disabled aria-label={`${label} (Coming Soon)`}><span className="nav-icon"><Icon {...ICON} /></span><span className="coming-soon-label">{label}</span><small>Coming Soon</small></button>)}
          </section>
        </nav>
        <Link className="settings-link" href="#"><span className="nav-icon"><Settings {...ICON} /></span> Settings <b>«</b></Link>
      </aside>
      <main className="content">
        <div className="topbar">
          <ThemeToggle />
          <span className="user-name" title={email}>{name}</span>
          <span className="avatar" aria-label={`Signed in as ${email}`}>{name.charAt(0)}</span>
          <button type="button" className="sign-out" onClick={() => void signOut()} title="Sign out"><LogOut size={15} aria-hidden="true" /> Sign out</button>
        </div>
        {children}
      </main>
    </div>
  );
}
