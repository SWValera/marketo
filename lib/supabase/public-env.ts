export type PublicSupabaseConfig = { url: string; publishableKey: string };

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

  if (/^(?:sb_secret_|service_role)/i.test(publishableKey)) {
    throw new Error("A server-only Supabase key was placed in a public variable.");
  }

  return { url: url.replace(/\/$/, ""), publishableKey };
}
