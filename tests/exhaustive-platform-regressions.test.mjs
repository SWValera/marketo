import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("reference cache bounds distinct in-flight requests while preserving coalescing", async () => {
  const { createSingleFlightTtlCache } = await import(new URL("lib/reference-data/cache.ts", root));
  const cache = createSingleFlightTtlCache({
    maxEntries: 2,
    maxInFlight: 2,
    ttlMilliseconds: () => 100,
  });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = cache.getOrLoad("first", () => gate.then(() => "first"));
  const duplicate = cache.getOrLoad("first", () => Promise.resolve("unexpected"));
  const second = cache.getOrLoad("second", () => gate.then(() => "second"));

  assert.strictEqual(first, duplicate);
  await assert.rejects(cache.getOrLoad("third", () => Promise.resolve("third")), /capacity exceeded/);
  release();
  assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
});

test("paginated reference queries end with a unique id tie-breaker", async () => {
  for (const path of ["lib/data/supabase/categories.ts", "lib/data/supabase/geography.ts"]) {
    const text = await source(path);
    for (const rangeQuery of text.matchAll(/(?:await\s+)?[\s\S]{0,500}?\.range\([^;]+;/g)) {
      assert.match(rangeQuery[0], /\.order\("id"\)[\s\S]*\.range\(/, `${path} range query needs id ordering`);
    }
  }
});

test("PWA cache operations are namespace-scoped and offline fallback is self-contained", async () => {
  const worker = await source("public/sw.js");
  const offline = await source("public/offline.html");
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(worker, /await\s+caches\.match\(/);
  assert.match(worker, /cache\.match\(OFFLINE_URL\)/);
  assert.match(offline, /lang="und"/);
  assert.doesNotMatch(offline, /<(?:script|link)\b/i);
  assert.match(offline, /Нет подключения[\s\S]*Интернет байланысы жоқ/);
});

test("install prompt failures are contained and clear stale prompt state", async () => {
  const install = await source("components/pwa-install.tsx");
  assert.match(install, /try\s*\{[\s\S]*installPrompt\.prompt\(\)[\s\S]*installPrompt\.userChoice/);
  assert.match(install, /catch\s*\{[\s\S]*setInstallError\(true\)/);
  assert.match(install, /finally\s*\{[\s\S]*setInstallPrompt\(null\)[\s\S]*setInstalling\(false\)/);
});

test("artifact validator covers client assets, bindings and server-only credential markers", async () => {
  const validator = await source("scripts/validate-artifact.mjs");
  for (const marker of ["client Vite manifest", "web app manifest", "service worker", "r2_buckets", "workerConfig.images", "serverOnlyMarkers"]) {
    assert.match(validator, new RegExp(marker));
  }
});

test("R2 bucket identity is explicit per build environment and never hardcoded", async () => {
  const vite = await source("vite.config.ts");
  const example = await source(".env.example");
  assert.match(vite, /process\.env\.MARKETO_MEDIA_BUCKET_NAME\?\.trim\(\)/);
  assert.match(vite, /MARKETO_MEDIA_BUCKET_NAME is required/);
  assert.match(vite, /bucket_name:\s*mediaBucketName!/);
  assert.doesNotMatch(vite, /site-creator-r2/);
  assert.match(example, /^MARKETO_MEDIA_BUCKET_NAME=/m);
});

test("Cloudflare Images binding is explicit for upload normalization and delivery optimization", async () => {
  const [vite, wrangler, worker] = await Promise.all([
    source("vite.config.ts"),
    source("wrangler.jsonc"),
    source("worker/index.ts"),
  ]);
  assert.match(vite, /images:\s*\{ binding: "IMAGES" \}/);
  assert.match(wrangler, /"images"[\s\S]*"binding": "IMAGES"/);
  assert.match(worker, /IMAGES: ImagesBinding/);
});

test("sitemap fails closed on reference errors and emits canonical listing URLs", async () => {
  const sitemap = await source("app/sitemap.ts");
  assert.match(sitemap, /catalog\.status !== "ready"/);
  assert.match(sitemap, /count:\s*"exact",\s*head:\s*true/);
  assert.match(sitemap, /\/listing\/\$\{listing\.id\}-\$\{listing\.slug\}/);
  assert.match(sitemap, /Published listing count exceeds the single-sitemap capacity/);
});
