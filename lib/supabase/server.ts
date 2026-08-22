import { createServerClient } from "@supabase/ssr";
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
