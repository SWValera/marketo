import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeRouteUuid,
  classifyRequestRouting,
  isKnownPublicAssetPath,
  isUnknownAssetLikePath,
  needsSupabaseSessionRefresh,
  normalizeRscPathname,
} from "../lib/http/request-routing.ts";

test("route UUIDs have one strict lowercase canonical representation", () => {
  const lowercase = "5abcdef0-1234-4abc-8def-1234567890ab";
  assert.equal(canonicalizeRouteUuid(lowercase), lowercase);
  assert.equal(canonicalizeRouteUuid(lowercase.toUpperCase()), lowercase);
  assert.equal(canonicalizeRouteUuid("5AbCdEf0-1234-4AbC-8dEf-1234567890aB"), lowercase);

  for (const invalid of [
    "not-a-uuid",
    "5abcdef012344abc8def1234567890ab",
    "5abcdef0-1234-0abc-8def-1234567890ab",
    "5abcdef0-1234-4abc-7def-1234567890ab",
    "5abcdef0-1234-4abc-8def-1234567890ab/extra",
  ]) {
    assert.equal(canonicalizeRouteUuid(invalid), null, invalid);
  }
});

test("public marketplace reads bypass Supabase session refresh", () => {
  for (const pathname of [
    "/",
    "/.rsc",
    "/categories",
    "/category/transport",
    "/listing/example-listing",
    "/listing/example-listing.rsc",
    "/search?q=phone",
    "/seller/00000000-0000-0000-0000-000000000000",
    "/seller/00000000-0000-0000-0000-000000000000.rsc",
    "/api/listings",
    "/api/listings?view=home-preview",
    "/api/reference/categories/category-id/attributes",
    "/api/showcase?city=almaty",
  ]) {
    assert.equal(classifyRequestRouting(pathname, "GET"), "continue", pathname);
    assert.equal(needsSupabaseSessionRefresh(pathname, "GET"), false, pathname);
  }
});

test("public help documents refresh the optional account session without widening public Auth work", () => {
  for (const pathname of ["/help", "/help/", "/help.rsc", "/help.rsc?state=next"]) {
    assert.equal(classifyRequestRouting(pathname, "GET"), "refresh-session", pathname);
    assert.equal(needsSupabaseSessionRefresh(pathname, "HEAD"), true, pathname);
  }
  assert.equal(needsSupabaseSessionRefresh("/help", "OPTIONS"), false);
  assert.equal(classifyRequestRouting("/helpful", "GET"), "continue");
  assert.equal(classifyRequestRouting("/help-center", "GET"), "continue");
});

test("protected, auth, and owner-listing reads refresh the session, including RSC paths", () => {
  for (const pathname of [
    "/admin",
    "/admin/listing-id.rsc",
    "/auth/callback",
    "/favorites.rsc",
    "/login",
    "/messages/new.rsc",
    "/notifications",
    "/profile/edit.rsc",
    "/publish.rsc",
    "/settings",
    "/api/admin/listings/listing-id",
    "/api/listings/listing-id",
  ]) {
    assert.equal(classifyRequestRouting(pathname, "GET"), "refresh-session", pathname);
    assert.equal(needsSupabaseSessionRefresh(pathname, "GET"), true, pathname);
  }

  assert.equal(normalizeRscPathname("/.rsc"), "/");
  assert.equal(normalizeRscPathname("/profile/edit.rsc?state=next"), "/profile/edit");
  assert.equal(needsSupabaseSessionRefresh("/profiled", "GET"), false);
  assert.equal(needsSupabaseSessionRefresh("/api/mediax/photo.jpg", "GET"), false);
});

test("all mutation methods refresh the session while safe public methods do not", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(classifyRequestRouting("/api/listings", method), "refresh-session", method);
    assert.equal(classifyRequestRouting("/search", method), "refresh-session", method);
  }
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(needsSupabaseSessionRefresh("/search", method), false, method);
  }
});

test("known public assets and framework asset namespaces remain available", () => {
  for (const pathname of [
    "/favicon.svg",
    "/file.svg",
    "/globe.svg",
    "/manifest.webmanifest",
    "/marketo-app-icon.svg",
    "/marketo-favicon-v2.svg",
    "/marketo-maskable.svg",
    "/robots.txt",
    "/sitemap.xml",
    "/sitemap-1.xml",
    "/sw.js",
    "/window.svg",
    "/assets/index-abc123.js",
    "/icons/marketo-pwa-192-v2.png",
    "/_next/static/chunks/app.js",
    "/_next/image?url=%2Ficons%2Fmarketo-180.png",
  ]) {
    assert.equal(isKnownPublicAssetPath(pathname), true, pathname);
    assert.equal(classifyRequestRouting(pathname, "GET"), "continue", pathname);
  }
});

test("unknown asset-like and well-known probes receive the cheap 404 decision", () => {
  for (const pathname of [
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/does-not-exist.js",
    "/nested/missing.css",
    "/.well-known",
    "/.well-known/appspecific/com.chrome.devtools.json",
  ]) {
    assert.equal(isUnknownAssetLikePath(pathname), true, pathname);
    assert.equal(classifyRequestRouting(pathname, "GET"), "not-found", pathname);
  }

  assert.equal(isUnknownAssetLikePath("/help.rsc"), false);
  assert.equal(classifyRequestRouting("/help.rsc", "GET"), "refresh-session");
  assert.equal(classifyRequestRouting("/api/media/listing/photo.jpg", "GET"), "continue");
  assert.equal(classifyRequestRouting("/assets-legacy/missing.js", "GET"), "not-found");
});
