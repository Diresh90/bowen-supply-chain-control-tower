"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LoginScreen } from "@/components/login-screen";
import { SupplierPortal } from "@/components/supplier-portal";
import { isBowenEmail, onSessionChange, readSession, type Session } from "@/lib/auth";

const SessionContext = createContext<Session | null>(null);

/** The signed-in user's session. Only usable inside AuthGate, where it is never null. */
export function useSession() {
  return useContext(SessionContext);
}

// Wraps every page: nothing (and no data request) renders until a signed-in session exists.
export function AuthGate({ children }: { children: ReactNode }) {
  // undefined = still reading the saved session.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    setSession(readSession());
    return onSessionChange(setSession);
  }, []);

  if (session === undefined) return null;
  if (session === null) return <LoginScreen />;
  // Supplier staff only ever get their read-only plan, whatever page address they open.
  // (The database enforces this too: non-Bowen accounts cannot read any table.)
  if (!isBowenEmail(session.email)) return <SupplierPortal key={session.email} email={session.email} />;
  // Keyed by user so signing in as someone else remounts the pages with fresh data.
  return <SessionContext.Provider value={session} key={session.email}>{children}</SessionContext.Provider>;
}
