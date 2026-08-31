export function safeInternalPath(value: string | null | undefined, fallback = "/profile") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const parsed = new URL(value, "https://marketo.local");
    if (parsed.origin !== "https://marketo.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export type AuthCallbackFlow = "signup" | "recovery";

export function authCallbackUrl(origin: string, next: string, flow: AuthCallbackFlow = "signup") {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", safeInternalPath(next));
  url.searchParams.set("flow", flow);
  return url.toString();
}
