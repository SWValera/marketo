import { env as cloudflareEnv } from "cloudflare:workers";

function readRuntimeString(name: string): string | undefined {
  const runtimeValue = (cloudflareEnv as unknown as Record<string, unknown>)[name];
  if (typeof runtimeValue === "string" && runtimeValue.length > 0) return runtimeValue;
  return process.env[name];
}

function validatePublicConfig(url: string, publishableKey: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Supabase URL must use HTTPS outside local development.");
  }
  if (/^(?:sb_secret_|service_role)/i.test(publishableKey)) {
    throw new Error("A server-only Supabase key was placed in a public variable.");
  }
  return { url: parsed.toString().replace(/\/$/, ""), publishableKey };
}

export function tryGetServerSupabasePublicConfig() {
  const url = readRuntimeString("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey =
    readRuntimeString("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    ?? readRuntimeString("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !publishableKey) return null;
  return validatePublicConfig(url, publishableKey);
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
