"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const navigation = [
  ["/dashboard", "▣", "Dashboard"],
  ["/procurement", "▤", "Jobs"],
  ["/procurement", "▧", "Purchase Orders"],
  ["/production", "▦", "Production"],
  ["/freight", "♧", "Freight"],
  ["/containers", "▥", "Containers"],
  ["/suppliers", "♙", "Suppliers"],
  ["/alerts", "♧", "Alerts"],
  ["/calendar", "□", "Calendar"],
  ["/documents", "◇", "Documents"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<{ full_name: string | null; email: string | null } | null>(null);
  useEffect(() => { void fetch("/api/auth/session", { cache: "no-store" }).then(async response => {
    if (!response.ok) return;
    const data = (await response.json()) as { profile: { full_name: string | null; email: string | null } };
    setProfile(data.profile);
  }); }, []);
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login?message=signed_out");
  }
  const displayName = profile?.full_name || profile?.email || "Account";
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
            <Link key={`${label}-${index}`} className={(pathname === href && label !== "Purchase Orders") ? "active" : ""} href={href}>
              <span>{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <Link className="settings-link" href="/settings"><span>⚙</span> Settings <b>«</b></Link>
      </aside>
      <main className="content">
        <div className="topbar">
          <div className="global-search">⌕ <input aria-label="Search" placeholder="Search jobs, PO, containers..." /></div>
          <button className="top-icon" aria-label="Notifications">♧<em>3</em></button>
          <div className="profile-area"><span className="user-name">{displayName}</span><button className="sign-out" onClick={signOut}>Sign Out</button></div>
          <span className="avatar" aria-label="User profile">{displayName.charAt(0).toUpperCase()}</span>
        </div>
        {children}
      </main>
    </div>
  );
}
