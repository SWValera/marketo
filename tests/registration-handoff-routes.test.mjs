import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { normalizeOwnerListingTab, ownerListingFilter, ownerProfileHref } from "../lib/listings/owner-filters.ts";

async function loadRoute(path, modules) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    if (!(name in modules)) throw new Error(`Unexpected dependency ${name}`);
    return modules[name];
  }, exports);
  return exports;
}

async function fixture({ proof = "read-proof", claim = { state:"ready", code:"one-use-pkce-code" }, exchangeError = null, finishState = "complete", finishFailures = 0, sessionUser = "new-user" } = {}) {
  const calls = [];
  let cookiesCommitted = false;
  const route = await loadRoute("app/api/auth/registration/complete/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/http/same-origin": { isSameOriginMutationRequest: (request) => request.headers.get("origin") === "https://marketo.test" },
    "@/lib/auth/registration-handoff": {
      capability: () => "lease", digest: async (v) => `hash-${v}`, readProof: async () => proof,
      handoffRpc: async (operation) => {
        calls.push(operation);
        if (operation === "claim") return claim;
        if (operation === "finish") {
          assert.equal(cookiesCommitted, false, "no session cookies before finalized lease");
          if (finishFailures-- > 0) throw new Error("temporary database failure");
          return { state:finishState };
        }
        return { state:"waiting" };
      },
    },
    "@/lib/supabase/server": {
      createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data:{ user:{ id:sessionUser } } }) } }),
      createBufferedRegistrationClient: async () => ({
        commit: () => { calls.push("commit"); cookiesCommitted = true; },
        client: { auth: { exchangeCodeForSession: async (code) => {
          assert.equal(code, "one-use-pkce-code"); calls.push("exchange");
          return { data:exchangeError ? {} : { session:{ access_token:"NEVER_IN_JSON" }, user:{ id:"new-user", email_confirmed_at:"2026-09-06T10:00:00Z" } }, error:exchangeError };
        } } },
      }),
    },
  });
  const request = (origin = "https://marketo.test") => route.POST(new Request("https://marketo.test/api/auth/registration/complete", { method:"POST", headers:{ origin } }));
  return { request, calls, committed: () => cookiesCommitted };
}

test("registration callback proof is required and cross-origin mutation is refused", async () => {
  const f = await fixture({ proof:null });
  assert.equal((await f.request("https://evil.test")).status, 403);
  assert.deepEqual(await (await f.request()).json(), { state:"missing" });
  assert.deepEqual(f.calls, []);
});
test("original browser exchanges once and commits cookies only after successful finalization", async () => {
  const f = await fixture();
  const response = await f.request();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { state:"complete" });
  assert.deepEqual(f.calls, ["claim","exchange","finish","commit"]);
});
test("cancelled in-flight attempt never commits authentication cookies", async () => {
  const f = await fixture({ finishState:"invalid" });
  assert.deepEqual(await (await f.request()).json(), { state:"expired" });
  assert.equal(f.committed(), false);
});
test("transient finalize retries same lease without re-exchanging one-use code", async () => {
  const f = await fixture({ finishFailures:1 });
  assert.deepEqual(await (await f.request()).json(), { state:"complete" });
  assert.deepEqual(f.calls, ["claim","exchange","finish","finish","commit"]);
});
test("unrecoverable finalize cannot release or repeat an already-consumed code", async () => {
  const f = await fixture({ finishFailures:2 });
  assert.deepEqual(await (await f.request()).json(), { state:"expired" });
  assert.equal(f.committed(), false);
  assert.equal(f.calls.includes("release"), false);
});
test("network exchange failure releases lease; invalid verifier cancels", async () => {
  const network = await fixture({ exchangeError:{ status:503 } });
  assert.equal((await network.request()).status, 503);
  assert.equal(network.calls.at(-1), "release");
  const invalid = await fixture({ exchangeError:{ status:400 } });
  assert.deepEqual(await (await invalid.request()).json(), { state:"expired" });
  assert.equal(invalid.calls.at(-1), "cancel");
});
test("completed polling requires same verified user, not an unrelated existing session", async () => {
  const f = await fixture({ claim:{ state:"complete", user_id:"new-user" }, sessionUser:"other-user" });
  assert.deepEqual(await (await f.request()).json(), { state:"expired" });
  assert.equal(f.calls.includes("exchange"), false);
});
test("profile filters include elapsed active records in archive and preserve pagination", () => {
  assert.equal(normalizeOwnerListingTab("status.eq.deleted"), "all");
  assert.equal(ownerListingFilter("all", "2026-09-06T00:00:00Z"), null);
  assert.match(ownerListingFilter("archive", "2026-09-06T00:00:00Z"), /status.in.\(archived,expired,sold\).*expires_at.lte/);
  assert.equal(ownerProfileHref("archive",2), "/profile?tab=archive&page=2");
});

test("confirmation on another device deposits the code but never exchanges there", async () => {
  const deposited = [];
  const route = await loadRoute("app/auth/callback/route.ts", {
    "next/server": { NextResponse: { redirect: (url, init = {}) => new Response(null, { status:307, headers:{ ...init.headers, location:String(url) } }) } },
    "@/lib/auth/redirect": { safeInternalPath: () => "/profile" },
    "@/lib/auth/callback-error": { classifyAuthCallbackError: () => "invalid" },
    "@/lib/supabase/server": { createSupabaseServerClient: () => { throw new Error("Foreign browser must not exchange the code"); } },
    "@/lib/auth/registration-handoff": { depositRegistrationCode: async (proof, code) => { deposited.push([proof,code]); return true; } },
  });
  const response = await route.GET(new Request("https://marketo.test/auth/callback?flow=signup&bridge=write-only-proof&code=one-use-code"));
  assert.deepEqual(deposited, [["write-only-proof","one-use-code"]]);
  assert.equal(response.headers.get("location"), "https://marketo.test/auth/registration-confirmed");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("cache-control"), "no-store");
});
