import type { NextRequest, NextResponse } from "next/server";

export const ACCESS_COOKIE = "bowen-access-token";
export const REFRESH_COOKIE = "bowen-refresh-token";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type AuthUser = { id: string; email?: string };
export type UserProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "admin" | "read_only";
  active: boolean;
};

export function authConfigurationError() {
  return !url || !key ? "Supabase authentication is not configured." : null;
}

export async function authFetch(path: string, init: RequestInit = {}) {
  if (authConfigurationError()) throw new Error(authConfigurationError()!);
  return fetch(`${url}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: key!, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
}

export async function getUser(accessToken: string) {
  const response = await authFetch("user", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  return (await response.json()) as AuthUser;
}

export async function getProfile(accessToken: string, userId: string) {
  if (!url || !key) return null;
  const response = await fetch(`${url}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=id,full_name,email,role,active`, {
    headers: { apikey: key, Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as UserProfile[];
  return rows[0] ?? null;
}

export function setSessionCookies(response: NextResponse, accessToken: string, refreshToken: string, expiresIn = 3600) {
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  response.cookies.set(ACCESS_COOKIE, accessToken, { ...options, maxAge: expiresIn });
  response.cookies.set(REFRESH_COOKIE, refreshToken, { ...options, maxAge: 60 * 60 * 24 * 30 });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function refreshSession(request: NextRequest, response: NextResponse) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;
  const refreshed = await authFetch("token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!refreshed.ok) return null;
  const session = (await refreshed.json()) as { access_token: string; refresh_token: string; expires_in: number; user: AuthUser };
  setSessionCookies(response, session.access_token, session.refresh_token, session.expires_in);
  return session;
}
