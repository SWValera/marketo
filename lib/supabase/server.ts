import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";
import { getServerSupabasePublicConfig } from "@/lib/supabase/server-env";

/**
 * Anonymous, server-only client for public reference tables. It uses the
 * publishable key, never the service role, and does not persist an auth session.
 */
export function createSupabasePublicServerClient(): SupabaseClient<Database> {
  const { url, publishableKey } = getServerSupabasePublicConfig();
  return createClient<Database>(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const { url, publishableKey } = getServerSupabasePublicConfig();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const cookie of cookiesToSet) cookieStore.set(cookie.name, cookie.value, cookie.options);
        } catch {
          // Server Components cannot always set cookies. Middleware/route
          // handlers perform refresh writes; reads remain valid here.
        }
      },
    },
  });
}

/** Commit cookies only after the registration lease is successfully finalized. */
export async function createBufferedRegistrationClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getServerSupabasePublicConfig();
  const pending = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const client = createServerClient<Database>(url, publishableKey, {
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }) },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => { for (const value of values) pending.set(value.name, value); },
    },
  });
  return { client, commit: () => { for (const value of pending.values()) cookieStore.set(value.name, value.value, value.options); } };
}
