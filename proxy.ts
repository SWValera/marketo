import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { classifyRequestRouting } from "@/lib/http/request-routing";
import type { Database } from "@/lib/supabase/database.types";
import { tryGetServerSupabasePublicConfig } from "@/lib/supabase/server-env";

/**
 * Refreshes Supabase SSR cookies before Server Components and route handlers
 * read the session. Authorization still lives in pages/RLS; this proxy only
 * keeps the request and response cookie sets synchronized.
 */
export async function proxy(request: NextRequest) {
  const routing = classifyRequestRouting(request.nextUrl.pathname, request.method);
  if (routing === "not-found") {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        "cache-control": "public, max-age=60",
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  }
  if (routing === "continue") return NextResponse.next({ request });

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
    "/((?!_next(?:/|$)|assets(?:/|$)|icons(?:/|$)|favicon\\.svg$|file\\.svg$|globe\\.svg$|manifest\\.webmanifest$|marketo-app-icon\\.svg$|marketo-favicon-v2\\.svg$|marketo-maskable\\.svg$|robots\\.txt$|sitemap(?:-\\d+)?\\.xml$|sw\\.js$|window\\.svg$).*)",
  ],
};
