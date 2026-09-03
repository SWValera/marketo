import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getPublicSellerProfile } from "../lib/data/supabase/profiles.ts";
import { getServerSupabasePublicConfig } from "../lib/supabase/server-env.ts";

const root = new URL("../", import.meta.url);

function createProfileClient(result) {
  const calls = [];
  const request = {
    select(...args) { calls.push(["select", ...args]); return this; },
    eq(...args) { calls.push(["eq", ...args]); return this; },
    maybeSingle() { calls.push(["maybeSingle"]); return Promise.resolve(result); },
  };
  return {
    calls,
    client: {
      from(table) { calls.push(["from", table]); return request; },
    },
  };
}

test("public seller profile reads distinguish a row, absence, and query failure", async () => {
  const row = {
    id: "5abcdef0-1234-4abc-8def-1234567890ab",
    display_name: "Seller",
    avatar_path: "avatars/seller.webp",
    settlement_id: null,
    bio: null,
    verified_at: null,
  };
  const existing = createProfileClient({ data: row, error: null });
  assert.equal(await getPublicSellerProfile(existing.client, row.id), row);
  assert.deepEqual(existing.calls, [
    ["from", "seller_profiles"],
    ["select", "*"],
    ["eq", "id", row.id],
    ["maybeSingle"],
  ]);

  const absent = createProfileClient({ data: null, error: null });
  assert.equal(await getPublicSellerProfile(absent.client, row.id), null);

  const queryError = Object.assign(new Error("database unavailable"), { code: "08006" });
  const failed = createProfileClient({ data: null, error: queryError });
  await assert.rejects(getPublicSellerProfile(failed.client, row.id), (error) => error === queryError);
});

test("missing public Supabase runtime configuration throws instead of becoming not found", () => {
  const names = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.throws(
      () => getServerSupabasePublicConfig(),
      /Supabase public runtime variables are not configured/,
    );
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("seller repository and route preserve not-found, operational-error, avatar, and UUID contracts", async () => {
  const [repositories, page, avatar] = await Promise.all([
    readFile(new URL("lib/data/repositories.ts", root), "utf8"),
    readFile(new URL("app/seller/[id]/page.tsx", root), "utf8"),
    readFile(new URL("components/seller-avatar.tsx", root), "utf8"),
  ]);
  const profileMethod = repositories.slice(
    repositories.indexOf("async findById(id: string)"),
    repositories.indexOf("export const chatRepository"),
  );

  assert.match(profileMethod, /const row = await getPublicSellerProfile\(createSupabasePublicServerClient\(\), id\)/);
  assert.match(profileMethod, /if \(!row\) return null/);
  assert.match(profileMethod, /if \(!row\.id \|\| !row\.display_name\) throw new Error\("seller_profile_invalid"\)/);
  assert.doesNotMatch(profileMethod, /tryGetServerSupabasePublicConfig\(\)\) return null/);
  assert.doesNotMatch(profileMethod, /catch\s*\{/);

  assert.match(page, /const sellerId = canonicalizeRouteUuid\(id\)/);
  assert.match(page, /if \(!sellerId\) notFound\(\)/);
  assert.match(page, /if \(id !== sellerId \|\| !pageResolution\.isCanonical \|\| !hasOnlySupportedParameters\)/);
  assert.match(page, /permanentRedirect\(requestedPage === 1 \? sellerPath : `\$\{sellerPath\}\?page=\$\{requestedPage\}`\)/);
  assert.match(page, /profileRepository\.findById\(sellerId\)/);
  assert.match(page, /listPublishedBySeller\(sellerId,/);
  assert.match(page, /<SellerAvatar src=\{seller\.avatarUrl\} \/>/);

  assert.match(avatar, /^"use client";/);
  assert.match(avatar, /failedSrc !== src/);
  assert.match(avatar, /<img[\s\S]*?src=\{src \?\? undefined\}[\s\S]*?alt=""[\s\S]*?onError=\{\(\) => setFailedSrc\(src\)\}/);
  assert.match(avatar, /className="seller-profile-avatar" aria-hidden="true"/);
});
