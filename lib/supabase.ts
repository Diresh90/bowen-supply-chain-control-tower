import { getAccessToken, sessionRejected } from "@/lib/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function configurationError() {
  if (!supabaseUrl || !supabaseKey) {
    return "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.";
  }
  return null;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  prefer?: string;
};

// Reads that fail before any response (e.g. "Failed to fetch" while a network proxy warms up
// the first connection) are retried. Writes are never retried, so a save cannot happen twice.
const READ_RETRY_DELAYS_MS = [500, 1500];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function supabaseRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const configError = configurationError();
  if (configError) throw new Error(configError);

  const method = options.method ?? "GET";
  // Signed-in users send their own token; the database only serves signed-in Bowen users.
  const userToken = await getAccessToken();
  const send = () =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: supabaseKey!,
        Authorization: `Bearer ${userToken ?? supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: options.prefer ?? "return=representation",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });

  let response: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await send();
      break;
    } catch (error) {
      if (method !== "GET" || attempt >= READ_RETRY_DELAYS_MS.length) throw error;
      await wait(READ_RETRY_DELAYS_MS[attempt]);
    }
  }

  if (!response.ok) {
    // A rejected sign-in token (expired, or the account was removed) sends the user back to the login screen.
    if (response.status === 401 && userToken) sessionRejected();
    const details = (await response.json().catch(() => null)) as
      | { message?: string; details?: string; hint?: string }
      | null;
    throw new Error(details?.message || details?.details || `Supabase request failed (${response.status}).`);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
