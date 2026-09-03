export type ValidatedPublicSupabaseConfig = { url: string; publishableKey: string };

export function isLegacyServiceRoleJwt(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return false;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as unknown;
    return Boolean(payload && typeof payload === "object" && "role" in payload && payload.role === "service_role");
  } catch {
    return false;
  }
}

export function isServerOnlySupabaseKey(value: string) {
  return /^(?:sb_secret_|service_role)/i.test(value) || isLegacyServiceRoleJwt(value);
}

export function validatePublicSupabaseConfig(url: string, publishableKey: string): ValidatedPublicSupabaseConfig {
  if (url !== url.trim()) throw new Error("NEXT_PUBLIC_SUPABASE_URL must not contain leading or trailing whitespace.");
  if (publishableKey !== publishableKey.trim()) throw new Error("A public Supabase key must not contain leading or trailing whitespace.");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (
    parsed.username
    || parsed.password
    || (parsed.protocol !== "https:" && !(localHost && parsed.protocol === "http:"))
  ) {
    throw new Error("Supabase URL must be a credential-free HTTPS URL outside local development.");
  }
  if (isServerOnlySupabaseKey(publishableKey)) {
    throw new Error("A server-only Supabase key was placed in a public variable.");
  }
  return { url: parsed.toString().replace(/\/$/, ""), publishableKey };
}
