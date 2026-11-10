// Email + password sign-in against Supabase Auth's REST API (no extra packages).
// The session lives in localStorage; the access token is refreshed shortly before it expires.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const STORAGE_KEY = "bowen-auth-session";
const REFRESH_MARGIN_SECONDS = 60;

/** Only these email domains may use the app (also enforced by the database rules). */
export const ALLOWED_EMAIL_DOMAIN = "bowenstorage.com.au";

export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  email: string;
};

type Listener = (session: Session | null) => void;
const listeners = new Set<Listener>();

export function onSessionChange(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function save(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the session simply lasts for this page only.
  }
  memorySession = session;
  listeners.forEach((listener) => listener(session));
}

let memorySession: Session | null = null;

export function readSession(): Session | null {
  if (memorySession) return memorySession;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    memorySession = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    memorySession = null;
  }
  return memorySession;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { email?: string };
  error_description?: string;
  msg?: string;
  error?: string;
};

async function tokenRequest(grant: "password" | "refresh_token", body: Record<string, string>) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: supabaseKey!, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok) throw new Error(data.error_description || data.msg || data.error || `Sign-in failed (${response.status}).`);
  return data;
}

function toSession(data: TokenResponse, fallbackEmail: string): Session {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    email: data.user?.email ?? fallbackEmail,
  };
}

export function isAllowedEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

export async function signIn(email: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!isAllowedEmail(cleanEmail)) throw new Error(`Use your @${ALLOWED_EMAIL_DOMAIN} email address.`);
  try {
    const data = await tokenRequest("password", { email: cleanEmail, password });
    const session = toSession(data, cleanEmail);
    save(session);
    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/invalid login credentials/i.test(message)) throw new Error("Email or password is incorrect.");
    throw error;
  }
}

let refreshing: Promise<Session | null> | null = null;

async function refresh(session: Session): Promise<Session | null> {
  try {
    const data = await tokenRequest("refresh_token", { refresh_token: session.refresh_token });
    const next = toSession(data, session.email);
    save(next);
    return next;
  } catch {
    save(null);
    return null;
  }
}

/** A valid access token, refreshed if it is about to expire; null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const session = readSession();
  if (!session) return null;
  if (session.expires_at - REFRESH_MARGIN_SECONDS > Date.now() / 1000) return session.access_token;
  refreshing ??= refresh(session).finally(() => { refreshing = null; });
  const next = await refreshing;
  return next?.access_token ?? null;
}

/** Called when the database rejects the token, e.g. the account was removed. */
export function sessionRejected() {
  save(null);
}

export async function signOut() {
  const session = readSession();
  save(null);
  if (!session) return;
  await fetch(`${supabaseUrl}/auth/v1/logout`, {
    method: "POST",
    headers: { apikey: supabaseKey!, Authorization: `Bearer ${session.access_token}` },
  }).catch(() => undefined);
}
