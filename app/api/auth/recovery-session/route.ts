import { NextResponse } from "next/server";
import { getUser, setSessionCookies } from "@/lib/auth";

export async function POST(request: Request) {
  const { accessToken, refreshToken, expiresIn } = (await request.json()) as { accessToken?: string; refreshToken?: string; expiresIn?: number };
  if (!accessToken || !refreshToken || !(await getUser(accessToken))) {
    return NextResponse.json({ error: "This recovery link is invalid or has expired." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, accessToken, refreshToken, expiresIn);
  return response;
}
