import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getServerSupabaseSecretConfig } from "@/lib/supabase/server-env";

/**
 * Server-only elevated client. Never import this module from a Client Component.
 * Every caller must authorize the user before invoking an elevated operation and
 * must write the corresponding moderation/admin audit row.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") throw new Error("Elevated Supabase client is server-only.");
  const { url, secretKey } = getServerSupabaseSecretConfig();
  return createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
