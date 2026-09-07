import { NextResponse } from "next/server";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";
import { boundedJson, createPhoneGateway, createPhoneSession, getPhoneProtectionConfig, isPhoneHostAllowed,
  readPhoneSession, serializePhoneSession, verifyPhoneChallenge } from "@/lib/phone/protection";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function bounded<T>(task: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("request_expired"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(task).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function reply(body: object, status: number, retryAfter?: number) {
  return NextResponse.json(body, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache", "Vary": "Cookie, Origin",
    ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
  } });
}

// GET returns only a public widget key and a signed session cookie, never a number.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid.test(id)) return reply({error:"invalid_listing"},400);
  try {
    const config = getPhoneProtectionConfig();
    if (!isPhoneHostAllowed(request, config)) return reply({error:"phone_unavailable"},503);
    const existing = await readPhoneSession(request, config);
    const response = reply({siteKey:config.siteKey},200);
    if (!existing) response.headers.set("Set-Cookie",serializePhoneSession(await createPhoneSession(config)));
    return response;
  } catch { return reply({error:"phone_unavailable"},503); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutationRequest(request)) return reply({ error: "cross_origin_request_denied" }, 403);
  const { id } = await context.params;
  if (!uuid.test(id)) return reply({ error: "invalid_listing" }, 400);
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
    if (signal.aborted) return reply({ error: "phone_unavailable" }, 503);
    const config = getPhoneProtectionConfig();
    if (!isPhoneHostAllowed(request, config)) return reply({error:"phone_unavailable"},503);
    const session = await bounded(readPhoneSession(request,config),signal);
    if (!session) return reply({error:"phone_challenge_required"},403);
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) return reply({error:"invalid_request"},400);
    let payload: unknown;
    try { payload = await boundedJson(request,signal); } catch { return reply({error:"invalid_request"},400); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 1
      || !("token" in payload) || typeof payload.token !== "string" || !/^[\x21-\x7e]{1,2048}$/.test(payload.token)) return reply({error:"invalid_request"},400);
    if (!await bounded(verifyPhoneChallenge(payload.token,id,config,signal),signal)) return reply({error:"phone_challenge_required"},403);
    if (signal.aborted) return reply({ error: "phone_unavailable" }, 503);
    const client = createPhoneGateway();
    const { data, error } = await bounded(client.rpc("reveal_listing_phone", { target_listing_id: id, p_session_key: session.quotaKey })
      .abortSignal(signal), signal);
    if (error) return reply({ error: "phone_unavailable" }, 503);
    if (!data || typeof data !== "object" || Array.isArray(data)) return reply({ error: "phone_unavailable" }, 503);
    if (data.state === "limited") {
      const retryAfter = typeof data.retry_after === "number" && Number.isFinite(data.retry_after) ? Math.max(1, Math.min(86400, Math.ceil(data.retry_after))) : 60;
      return reply({ error: "phone_rate_limited", retryAfter }, 429, retryAfter);
    }
    if (data.state === "denied") return reply({ error: "phone_challenge_required" }, 403);
    if (data.state === "unavailable") return reply({ error: "phone_not_available" }, 404);
    if (data.state !== "revealed" || typeof data.phone !== "string" || !/^\+[1-9][0-9]{7,14}$/.test(data.phone)) {
      return reply({ error: "phone_unavailable" }, 503);
    }
    return reply({ phone: data.phone }, 200);
  } catch {
    // Do not log contact values, authentication objects, or RPC response bodies.
    return reply({ error: "phone_unavailable" }, 503);
  }
}
