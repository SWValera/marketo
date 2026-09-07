import "server-only";
import { env as cloudflareEnv } from "cloudflare:workers";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabaseSecretConfig } from "@/lib/supabase/server-env";
import type { Database } from "@/lib/supabase/database.types";

export const phoneCookie = "__Host-marketo-phone";
export const phoneAction = "listing_phone";
const lifetime = 86400;
const encoder = new TextEncoder();
type Config = {siteKey: string; secretKey: string; hostnames: string[]};
const read = (key: string) => {
  const value = (cloudflareEnv as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : process.env[key];
};
export function getPhoneProtectionConfig(): Config {
  const siteKey = read("TURNSTILE_SITE_KEY"), secretKey = read("TURNSTILE_SECRET_KEY");
  const hostnames = (read("TURNSTILE_ALLOWED_HOSTNAMES") ?? "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!siteKey || !secretKey || !hostnames.length || hostnames.some(v => !/^[a-z0-9.-]+$/.test(v))) throw new Error("phone_protection_unconfigured");
  return {siteKey, secretKey, hostnames};
}
export function isPhoneHostAllowed(request: Request, config: Config) {
  const url = new URL(request.url);
  return url.protocol === "https:" && config.hostnames.includes(url.hostname);
}
const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes)).map(v => v.toString(16).padStart(2,"0")).join("");
async function key(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign","verify"]);
}
async function mac(secret: string, value: string) { return hex(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(value))); }
function cookieValue(request: Request) {
  const values = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith(phoneCookie + "="));
  return values.length === 1 ? values[0].slice(phoneCookie.length + 1) : "";
}
export async function readPhoneSession(request: Request, config: Config) {
  const value = cookieValue(request);
  const match = /^v1\.([a-f0-9]{32})\.([0-9]{10})\.([a-f0-9]{64})$/.exec(value);
  if (!match) return null;
  const expires = Number(match[2]), now = Math.floor(Date.now()/1000);
  if (expires <= now || expires > now + lifetime + 30) return null;
  const payload = `v1.${match[1]}.${match[2]}`;
  const signature = Uint8Array.from(match[3].match(/../g)!, byte => parseInt(byte,16));
  if (!await crypto.subtle.verify("HMAC", await key(config.secretKey), signature, encoder.encode("marketo-phone-cookie:" + payload))) return null;
  return {value, quotaKey:await mac(config.secretKey, "marketo-phone-quota:" + payload)};
}
export async function createPhoneSession(config: Config) {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `v1.${nonce}.${Math.floor(Date.now()/1000) + lifetime}`;
  return payload + "." + await mac(config.secretKey, "marketo-phone-cookie:" + payload);
}
export function serializePhoneSession(value: string) {
  return `${phoneCookie}=${value}; Path=/; Max-Age=${lifetime}; Secure; HttpOnly; SameSite=Lax`;
}
export async function boundedJson(request: Request | Response, signal: AbortSignal, maxBytes = 4096): Promise<unknown> {
  if (!request.body) throw new Error("missing_body");
  const reader = request.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, {once:true});
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      if (signal.aborted) throw new Error("request_expired");
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("oversized_body");
      chunks.push(value);
    }
    if (signal.aborted) throw new Error("request_expired");
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk,offset); offset += chunk.byteLength;}
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { signal.removeEventListener("abort", abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function verifyPhoneChallenge(token: string, listingId: string, config: Config, signal: AbortSignal) {
  // Deliberately no remoteip: Sites forwarding does not establish trusted visitor IP.
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method:"POST", headers:{"Content-Type":"application/json"}, cache:"no-store", redirect:"error", signal,
    body:JSON.stringify({secret:config.secretKey, response:token}),
  });
  if (!response.ok) throw new Error("challenge_unavailable");
  const result = await boundedJson(response, signal, 8192);
  return !!result && typeof result === "object" && "success" in result && result.success === true
    && "hostname" in result && typeof result.hostname === "string" && config.hostnames.includes(result.hostname)
    && "action" in result && result.action === phoneAction && "cdata" in result && result.cdata === listingId;
}
export function createPhoneGateway() {
  const {url,secretKey} = getServerSupabaseSecretConfig();
  // Dedicated server-only gateway. Never merge incoming Authorization/Cookie/Prefer headers.
  return createClient<Database>(url,secretKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
