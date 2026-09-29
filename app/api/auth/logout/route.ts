import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, authFetch, clearSessionCookies } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (token) await authFetch("logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
