import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabasePublicConfig } from "@/lib/supabase/server-env";

export const dynamic = "force-dynamic";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
  try {
    const { url, publishableKey } = getServerSupabasePublicConfig();
    const endpoint = `${url}/rest/v1/categories?select=id,slug,name_ru&is_active=eq.true&limit=1`;
    const keyFingerprint = {
      length: publishableKey.length,
      sha256: await sha256(publishableKey),
    };

    let nativeFetch: unknown;
    try {
      const response = await fetch(endpoint, {
        headers: { apikey: publishableKey },
        cache: "no-store",
      });
      nativeFetch = {
        ok: response.ok,
        status: response.status,
        body: await response.text(),
      };
    } catch (error) {
      nativeFetch = {
        ok: false,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    }

    let supabaseJs: unknown;
    try {
      const client = createClient(url, publishableKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      });
      const { data, error } = await client
        .from("categories")
        .select("id,slug,name_ru")
        .eq("is_active", true)
        .limit(1);
      supabaseJs = {
        data,
        error: error
          ? {
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            }
          : null,
      };
    } catch (error) {
      supabaseJs = {
        data: null,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    }

    return NextResponse.json(
      {
        projectHost: new URL(url).hostname,
        keyFingerprint,
        nativeFetch,
        supabaseJs,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
