import { NextResponse } from "next/server";
import { authFetch } from "@/lib/auth";

export async function POST(request: Request) {
  const { email } = (await request.json()) as { email?: string };
  if (!email) return NextResponse.json({ error: "Enter your email address." }, { status: 400 });
  const origin = new URL(request.url).origin;
  const result = await authFetch("recover", { method: "POST", body: JSON.stringify({ email, redirect_to: `${origin}/reset-password` }) });
  if (!result.ok) {
    const payload = (await result.json().catch(() => ({}))) as { msg?: string };
    return NextResponse.json({ error: payload.msg || "Unable to send a reset email. Try again shortly." }, { status: result.status });
  }
  return NextResponse.json({ message: "If that address is an invited account, Supabase has sent password recovery instructions." });
}
