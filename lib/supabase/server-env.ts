import { env as cloudflareEnv } from "cloudflare:workers";
import { validatePublicSupabaseConfig } from "./public-config-validation.ts";

function readRuntimeString(name: string): string | undefined {
  const runtimeValue = (cloudflareEnv as unknown as Record<string, unknown>)[name];
  if (typeof runtimeValue === "string" && runtimeValue.length > 0) return runtimeValue;
  return process.env[name];
}

export function tryGetServerSupabasePublicConfig() {
  const url = readRuntimeString("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey =
    readRuntimeString("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    ?? readRuntimeString("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !publishableKey) return null;
  return validatePublicSupabaseConfig(url, publishableKey);
}

export function getServerSupabasePublicConfig() {
  const config = tryGetServerSupabasePublicConfig();
  if (!config) {
    throw new Error("Supabase public runtime variables are not configured.");
  }
  return config;
}

export function getServerSupabaseSecretConfig() {
  const { url } = getServerSupabasePublicConfig();
  const secretKey =
    readRuntimeString("SUPABASE_SECRET_KEY")
    ?? readRuntimeString("SUPABASE_SERVICE_ROLE_KEY");

  if (!secretKey) {
    throw new Error("Supabase server secret is not configured.");
  }

  return { url, secretKey };
}
