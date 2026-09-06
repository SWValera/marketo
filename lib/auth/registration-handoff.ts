import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getServerSupabaseSecretConfig } from "@/lib/supabase/server-env";

export const HANDOFF_COOKIE = "marketo-registration-proof";
export const validCapability = (value: string | undefined | null): value is string => Boolean(value && /^[a-f0-9]{64}$/.test(value));
export function capability() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function handoffRpc(operation: string, args: Record<string, string | null> = {}) {
  const { url, secretKey } = getServerSupabaseSecretConfig();
  const client = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.rpc("registration_handoff", { operation, ...args });
  if (error || !data || typeof data.state !== "string") throw new Error("Registration handoff unavailable");
  return data as { state: string; code?: string; user_id?: string };
}
export async function readProof() {
  const raw = (await cookies()).get(HANDOFF_COOKIE)?.value;
  return validCapability(raw) ? digest(raw) : null;
}
export async function clearHandoff() {
  (await cookies()).set(HANDOFF_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
}
export async function depositRegistrationCode(writeCapability: string, code: string) {
  if (!validCapability(writeCapability) || code.length < 8 || code.length > 2048) return false;
  const result = await handoffRpc("deposit", { write_proof: await digest(writeCapability), code_value: code });
  return result.state === "received";
}

export async function clientRateProof(request: Request) {
  // Only the trusted Cloudflare address is accepted, not caller-supplied X-Forwarded-For.
  // Keyed hashing prevents recovering addresses from a database leak.
  const { secretKey } = getServerSupabaseSecretConfig();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const result = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(request.headers.get("cf-connecting-ip") ?? "local"));
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
