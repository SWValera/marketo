import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  assertPublicSupabaseBrowserBuild,
  publicSupabaseBuildEnvGuard,
} from "../build/public-supabase-env-guard.ts";

const root = new URL("../", import.meta.url);
const publicUrl = "https://browser-build-contract.invalid";
const publishableKey = "sb_publishable_browser_build_contract";
const anonKey = "browser_build_legacy_anon_contract";
const legacyServiceRoleJwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url"),
  "fake-signature",
].join(".");

function defines(environment) {
  return Object.fromEntries(
    Object.entries(environment).map(([name, value]) => [`process.env.${name}`, JSON.stringify(value)]),
  );
}

test("browser Supabase build guard accepts vinext definitions and legacy fallback", () => {
  const modern = {
    NEXT_PUBLIC_SUPABASE_URL: publicUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  };
  assert.doesNotThrow(() => assertPublicSupabaseBrowserBuild(modern, defines(modern)));

  const legacy = {
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  };
  assert.doesNotThrow(() => assertPublicSupabaseBrowserBuild(legacy, defines(legacy)));

  const both = { ...modern, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey };
  assert.doesNotThrow(() => assertPublicSupabaseBrowserBuild(both, defines(both)));
});

test("browser Supabase build guard rejects unsafe, missing, and uninlined values without exposing them", () => {
  const cases = [
    [{ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey }, {}],
    [{ NEXT_PUBLIC_SUPABASE_URL: "not a url", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey }, {}],
    [{ NEXT_PUBLIC_SUPABASE_URL: "http://remote.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey }, {}],
    [{ NEXT_PUBLIC_SUPABASE_URL: "https://user:password@remote.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey }, {}],
    [{ NEXT_PUBLIC_SUPABASE_URL: publicUrl }, {}],
    [{ NEXT_PUBLIC_SUPABASE_URL: publicUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey }, {}],
    [{ NEXT_PUBLIC_SUPABASE_URL: publicUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_do_not_expose" }, {}],
    [{ NEXT_PUBLIC_SUPABASE_URL: publicUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "  sb_secret_do_not_expose" }, {}],
    [{ NEXT_PUBLIC_SUPABASE_URL: publicUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "service_role_do_not_expose" }, {}],
    [{ NEXT_PUBLIC_SUPABASE_URL: publicUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: legacyServiceRoleJwt }, {}],
  ];
  for (const [environment, definition] of cases) {
    assert.throws(() => assertPublicSupabaseBrowserBuild(environment, definition));
  }

  const valid = {
    NEXT_PUBLIC_SUPABASE_URL: publicUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  };
  for (const missingName of Object.keys(valid)) {
    const definition = defines(valid);
    delete definition[`process.env.${missingName}`];
    assert.throws(
      () => assertPublicSupabaseBrowserBuild(valid, definition),
      (error) => !String(error).includes(publicUrl) && !String(error).includes(publishableKey),
    );
  }
});

test("browser Supabase env guard is build-only and runs after vinext config", () => {
  const plugin = publicSupabaseBuildEnvGuard();
  assert.equal(plugin.name, "marketo:public-supabase-build-env");
  assert.equal(plugin.apply, "build");
  assert.equal(plugin.enforce, "post");
  assert.equal(typeof plugin.configResolved, "function");
});

test("test production bundle contains safe public sentinels and no unresolved Supabase env expressions", async () => {
  const assetDirectory = new URL("dist/client/assets/", root);
  const scripts = (await readdir(assetDirectory)).filter((name) => name.endsWith(".js"));
  const source = (await Promise.all(scripts.map((name) => readFile(new URL(name, assetDirectory), "utf8")))).join("\n");
  assert.equal(source.includes("https://reference-test.supabase.co"), true, "test URL was not inlined");
  assert.equal(source.includes("sb_publishable_reference_test"), true, "test public key was not inlined");
  assert.equal(
    /process\.env\.NEXT_PUBLIC_SUPABASE_(?:URL|PUBLISHABLE_KEY|ANON_KEY)/.test(source),
    false,
    "browser bundle retained an unresolved public Supabase expression",
  );
});
