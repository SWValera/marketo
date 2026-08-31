import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { tryGetServerSupabasePublicConfig } from "@/lib/supabase/server-env";

/**
 * Refreshes Supabase SSR cookies before Server Components and route handlers
 * read the session. Authorization still lives in pages/RLS; this proxy only
 * keeps the request and response cookie sets synchronized.
 */
export async function proxy(request: NextRequest) {
  const config = tryGetServerSupabasePublicConfig();
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const client = createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  try {
    await client.auth.getUser();
  } catch {
    // A transient Auth outage must not take down public marketplace pages.
    // Protected pages and RLS still reject missing/invalid sessions.
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
  ],
};
