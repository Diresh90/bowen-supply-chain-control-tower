import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, clearSessionCookies, getProfile, getUser, refreshSession } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next();
  let token = request.cookies.get(ACCESS_COOKIE)?.value;
  let user = token ? await getUser(token) : null;
  if (!user) {
    const refreshed = await refreshSession(request, response);
    token = refreshed?.access_token;
    user = refreshed?.user ?? null;
  }
  const profile = user && token ? await getProfile(token, user.id) : null;
  if (!user || !profile?.active) {
    const login = new URL("/login", request.url);
    login.searchParams.set("message", user ? "access_denied" : "login_required");
    const redirect = NextResponse.redirect(login);
    clearSessionCookies(redirect);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/procurement/:path*", "/production/:path*", "/freight/:path*", "/containers/:path*", "/suppliers/:path*", "/alerts/:path*", "/calendar/:path*", "/documents/:path*", "/settings/:path*"],
};
