import { NextResponse } from "next/server";
import { authFetch, getProfile, setSessionCookies } from "@/lib/auth";

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email?: string; password?: string };
  if (!email || !password) return NextResponse.json({ error: "Enter your email address and password." }, { status: 400 });

  try {
    const result = await authFetch("token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
    const payload = (await result.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id: string }; msg?: string; error_description?: string };
    if (!result.ok || !payload.access_token || !payload.refresh_token || !payload.user) {
      return NextResponse.json({ error: payload.msg || payload.error_description || "Email or password is incorrect." }, { status: 401 });
    }
    const profile = await getProfile(payload.access_token, payload.user.id);
    if (!profile) return NextResponse.json({ error: "Your account has not been granted access. Ask an administrator to create your user profile." }, { status: 403 });
    if (!profile.active) return NextResponse.json({ error: "Your account is inactive. Contact an administrator." }, { status: 403 });
    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, payload.access_token, payload.refresh_token, payload.expires_in);
    return response;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
