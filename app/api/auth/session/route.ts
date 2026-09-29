import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, clearSessionCookies, getProfile, getUser, refreshSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  let token = request.cookies.get(ACCESS_COOKIE)?.value;
  let user = token ? await getUser(token) : null;
  const response = NextResponse.json({});
  if (!user) {
    const refreshed = await refreshSession(request, response);
    token = refreshed?.access_token;
    user = refreshed?.user ?? null;
  }
  if (!user || !token) {
    clearSessionCookies(response);
    return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: response.headers });
  }
  const profile = await getProfile(token, user.id);
  if (!profile?.active) {
    clearSessionCookies(response);
    return NextResponse.json({ error: "Access is inactive" }, { status: 403, headers: response.headers });
  }
  const authenticated = NextResponse.json({ accessToken: token, user, profile });
  response.cookies.getAll().forEach(cookie => authenticated.cookies.set(cookie));
  return authenticated;
}
