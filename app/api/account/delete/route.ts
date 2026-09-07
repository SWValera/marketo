import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerSupabasePublicConfig, getServerSupabaseSecretConfig } from "@/lib/supabase/server-env";
import { getListingMediaBucket } from "@/lib/media/bucket";
import { runAccountDeletionBatch } from "@/lib/account/deletion";

export const dynamic = "force-dynamic";
const cookieName = "__Host-marketo-account-deletion";
const hex = (value: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(value)).map(n => n.toString(16).padStart(2, "0")).join("");
async function readBody(request: Request) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) throw new Error("invalid_body");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  let size = 0; const parts: Uint8Array[] = [];
  let expired = false;
  const cancel = () => { expired = true; void reader.cancel().catch(() => {}); };
  const timer = setTimeout(cancel, 5000);
  request.signal.addEventListener("abort", cancel, {once: true});
  try {
    if (request.signal.aborted) throw new Error("invalid_body");
    while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength;
      if (size > 4096) throw new Error("invalid_body"); parts.push(item.value); }
    if (expired) throw new Error("invalid_body");
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } finally { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function POST(request: Request) {
  const reply = (body: object, status: number, token?: string, done = false, maxAge = 3600) => {
    const response = NextResponse.json(body, {status, headers: {"Cache-Control": "private, no-store", "Vary": "Cookie, Origin"}});
    if (token) response.cookies.set(cookieName, done ? "" : token, {httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: done ? 0 : maxAge});
    return response;
  };
  if (!isSameOriginMutationRequest(request)) return reply({error: "cross_origin_request_denied"}, 403);
  let payload: unknown;
  try { payload = await readBody(request); } catch { return reply({error: "invalid_request"}, 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return reply({error: "invalid_request"}, 400);
  const fields = payload as Record<string, unknown>;
  const resume = Object.keys(fields).length === 1 && fields.resume === true;
  if (!resume && (Object.keys(fields).length !== 2 || fields.confirmation !== "DELETE"
    || typeof fields.password !== "string" || !fields.password || fields.password.length > 1024)) return reply({error: "invalid_request"}, 400);
  let capability: string | undefined;
  try {
    const serverConfig = getServerSupabaseSecretConfig();
    const options = {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      global: {fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {...init, signal: AbortSignal.timeout(15000)})}};
    const gateway = createClient(serverConfig.url, serverConfig.secretKey, options);
    if (resume) {
      const value = (await cookies()).get(cookieName)?.value;
      if (!value || !/^[a-f0-9]{64}$/.test(value)) return reply({error: "authentication_required"}, 401);
      capability = value;
    } else {
      const current = await (await createSupabaseServerClient()).auth.getUser();
      if (current.error || !current.data.user?.email) return reply({error: "authentication_required"}, 401);
      const publicConfig = getServerSupabasePublicConfig();
      const verifier = createClient(publicConfig.url, publicConfig.publishableKey, options);
      const checked = await verifier.auth.signInWithPassword({email: current.data.user.email, password: fields.password as string});
      delete fields.password;
      // The short-lived verification session is isolated from the browser session.
      if (checked.data.session) await verifier.auth.signOut({scope: "local"});
      if (checked.error || checked.data.user?.id !== current.data.user.id) return reply({error: "password_invalid"}, 403);
      capability = hex(crypto.getRandomValues(new Uint8Array(32)));
      const tokenHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(capability)));
      const begun = await gateway.rpc("begin_account_deletion", {p_user_id: current.data.user.id, p_token_hash: tokenHash});
      if (begun.error) {
        if (begun.error.code === "P0002") return reply({error: "assisted_deletion_required"}, 409);
        if (begun.error.code === "PGRST202") return reply({error: "deletion_not_configured", status: "unavailable"}, 503);
        throw begun.error;
      }
      // Deliver the recovery cookie before any external media/Auth erasure.
      // If this response is lost, the still-existing login can reconfirm safely.
      return reply({status: "pending"}, 202, capability);
    }
    const tokenHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(capability)));
    const status = await runAccountDeletionBatch({
      rpc: (name, args) => gateway.rpc(name, args),
      deleteMedia: keys => getListingMediaBucket().delete(keys),
      deleteAuth: async id => {
        const result = await gateway.auth.admin.deleteUser(id, false);
        if (result.error && result.error.status !== 404 && result.error.code !== "user_not_found") throw result.error;
      },
    }, tokenHash);
    // Keep a short-lived completion receipt: headers may arrive while the JSON
    // body is lost. A retry must still confirm completion after Auth is gone.
    return reply({status}, status === "completed" ? 200 : 202, capability, false, status === "completed" ? 300 : 3600);
  } catch (error) {
    if ((error as {code?: string})?.code === "42501") return reply({error: "confirmation_required", status: "unavailable"}, 409, capability, true);
    // Do not log passwords, session data, media paths or Auth responses.
    return reply({error: "deletion_unavailable", status: capability ? "pending" : "unavailable"}, 503, capability);
  }
}
