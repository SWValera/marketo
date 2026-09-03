import { validatePublicSupabaseConfig, type ValidatedPublicSupabaseConfig } from "./public-config-validation.ts";

export type PublicSupabaseConfig = ValidatedPublicSupabaseConfig;

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return validatePublicSupabaseConfig(url, publishableKey);
}
