import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, authFetch } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const { password } = (await request.json()) as { password?: string };
  if (!token) return NextResponse.json({ error: "Your recovery session has expired." }, { status: 401 });
  if (!password || password.length < 8) return NextResponse.json({ error: "Use a password with at least 8 characters." }, { status: 400 });
  const result = await authFetch("user", { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ password }) });
  if (!result.ok) {
    const payload = (await result.json().catch(() => ({}))) as { msg?: string };
    return NextResponse.json({ error: payload.msg || "Password could not be updated." }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
