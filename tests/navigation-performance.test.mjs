import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

async function walk(directory, extensions = new Set([".js", ".jsx", ".ts", ".tsx"])) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, extensions));
    else if (extensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) files.push(path);
  }
  return files;
}

function openingTags(text, component) {
  return text.match(new RegExp(`<${component}\\b[\\s\\S]*?\\/?>`, "g")) ?? [];
}

test("application links disable speculative RSC prefetch unless explicitly opted in", async () => {
  const directImports = [];
  for (const directory of ["app", "components", "lib", "build"]) {
    for (const file of await walk(join(rootPath, directory))) {
      const text = await readFile(file, "utf8");
      if (/from\s+["']next\/link["']|require\(\s*["']next\/link["']\s*\)/.test(text)) {
        directImports.push(relative(rootPath, file).split(sep).join("/"));
      }
    }
  }

  assert.deepEqual(directImports.sort(), ["components/app-link.tsx"]);
  const appLink = await source("components/app-link.tsx");
  assert.match(appLink, /\{\s*prefetch\s*=\s*false\s*,\s*\.\.\.props\s*\}/);
  assert.match(appLink, /<NextLink\b[^>]*\{\.\.\.props\}[^>]*\bprefetch=\{prefetch\}/);
  assert.match(appLink, /needsDocumentNavigation\(href\)/);
  assert.match(appLink, /pathname === "\/publish"/);
  assert.match(appLink, /return <a \{\.\.\.props\} href=\{href\} \/>/);
});

test("listing intent prefetch waits for deliberate hover, cancels transient intent and deduplicates", async () => {
  const { createIntentPrefetchController } = await import(new URL("lib/navigation/intent-prefetch.ts", root));
  const scheduled = new Map();
  let nextHandle = 1;
  let requests = 0;
  const clock = {
    schedule(callback, delayMilliseconds) {
      const handle = nextHandle++;
      scheduled.set(handle, { callback, delayMilliseconds });
      return handle;
    },
    cancel(handle) {
      scheduled.delete(handle);
    },
  };
  const controller = createIntentPrefetchController(() => { requests += 1; }, 150, clock);

  controller.schedule();
  assert.equal(requests, 0);
  assert.equal(scheduled.size, 1);
  assert.equal([...scheduled.values()][0].delayMilliseconds, 150);
  controller.cancel();
  assert.equal(scheduled.size, 0);
  assert.equal(requests, 0);

  controller.schedule();
  const pending = [...scheduled.values()][0];
  scheduled.clear();
  pending.callback();
  assert.equal(requests, 1);
  controller.schedule();
  controller.request();
  assert.equal(requests, 1);
  assert.equal(scheduled.size, 0);

  const disposableController = createIntentPrefetchController(() => { requests += 1; }, 150, clock);
  disposableController.schedule();
  disposableController.dispose();
  assert.equal(scheduled.size, 0, "unmount must cancel pending intent");

  const card = await source("components/listing-card.tsx");
  assert.match(card, /createIntentPrefetchController\(\(\) => router\.prefetch\(href\)\)/);
  assert.match(card, /onMouseEnter:\s*intentPrefetch\.schedule/);
  assert.match(card, /onMouseLeave:\s*intentPrefetch\.cancel/);
  assert.match(card, /onClick:\s*intentPrefetch\.cancel/);
  assert.doesNotMatch(card, /on(?:TouchStart|PointerEnter|Focus):/);
});

test("catalog filters navigate only on explicit apply and route state remounts predictably", async () => {
  const client = await source("components/catalog-client.tsx");
  assert.match(client, /function\s+navigateWithFilters\s*\([^)]*\)[\s\S]*?router\.replace\s*\(/);
  assert.match(client, /function\s+applyFilters\s*\(\s*\)\s*\{\s*navigateWithFilters\(\);\s*\}/);
  assert.match(client, /onClick=\{applyFilters\}/);
  assert.match(client, /function\s+resetFilters[\s\S]*?navigateWithFilters\s*\(\s*\{/);
  assert.match(client, /onChange=\{[^}]*navigateWithFilters\(\{ sort: nextSort \}\)/);
  assert.doesNotMatch(client, /setTimeout\s*\(/);
  assert.match(client, /if\s*\(initialCityId !== undefined \|\| storedLocation === "all"\) return;[\s\S]*?params\.set\("city", storedLocation\);[\s\S]*?params\.delete\("page"\);[\s\S]*?router\.replace\(/,
    "stored browser location may trigger one guarded URL reconciliation so the server owns the resulting query");
  const navigateWithFilters = client.match(/function\s+navigateWithFilters\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? "";
  assert.equal(navigateWithFilters.match(/\brouter\.replace\s*\(/g)?.length ?? 0, 1,
    "interactive filters must schedule only one route navigation");
  assert.equal(client.match(/\brouter\.replace\s*\(/g)?.length ?? 0, 2,
    "only explicit filter navigation and guarded stored-location reconciliation may replace the route");
  assert.match(client, /query === initialQuery \|\| !normalizedQuery/, "applied server search results must stay authoritative after hydration");

  for (const page of ["app/search/page.tsx", "app/category/[slug]/page.tsx"]) {
    const text = await source(page);
    const catalogTags = openingTags(text, "CatalogClient");
    assert.equal(catalogTags.length, 1, `${page} must render one catalog client`);
    assert.doesNotMatch(catalogTags[0], /\bcatalog\s*=/, `${page} must not serialize the catalog into RSC props`);
    assert.match(catalogTags[0], /\bkey\s*=/, `${page} must remount from stable server route state`);
    assert.match(text, /JSON\.stringify\(parsed\)/, `${page} key must include parsed route state`);
  }
});

test("global layout does not fetch or serialize geography and browser references are single-flight", async () => {
  const layout = await source("app/layout.tsx");
  assert.doesNotMatch(layout, /\bgetGeographyReferences\b/);
  const providerTags = openingTags(layout, "ReferenceGeographyProvider");
  assert.equal(providerTags.length, 1);
  assert.doesNotMatch(providerTags[0], /\b(?:value|initialValue|reference)\s*=/);

  const provider = await source("components/reference-geography-provider.tsx");
  const browser = await source("lib/reference-data/browser.ts");
  assert.match(provider, /loading\.current/);
  assert.match(provider, /loadBrowserGeographyReferences/);
  assert.match(browser, /createSingleFlightTtlLoader/);
  assert.match(browser, /loadBrowserCategoryReferences\s*=\s*createSingleFlightTtlLoader/);
  assert.match(browser, /loadBrowserGeographyReferences\s*=\s*createSingleFlightTtlLoader/);

  const { createSingleFlightTtlLoader } = await import(new URL("lib/reference-data/cache.ts", root));
  let calls = 0;
  let now = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const loader = createSingleFlightTtlLoader(async () => {
    calls += 1;
    await gate;
    return { call: calls };
  }, 20, () => now);

  const first = loader();
  const concurrent = loader();
  assert.strictEqual(first, concurrent);
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await first, { call: 1 });
  assert.deepEqual(await loader(), { call: 1 });
  now = 20;
  assert.deepEqual(await loader(), { call: 2 });
});

test("reference cache coalesces requests, expires errors early and evicts least-recently-used keys", async () => {
  const { createSingleFlightTtlCache } = await import(new URL("lib/reference-data/cache.ts", root));
  let now = 0;
  const cache = createSingleFlightTtlCache({
    maxEntries: 2,
    ttlMilliseconds: (value) => value.status === "error" ? 5 : 50,
    now: () => now,
  });
  const loads = new Map();
  const load = (key, status = "ready") => async () => {
    const count = (loads.get(key) ?? 0) + 1;
    loads.set(key, count);
    return { key, status, count };
  };

  assert.deepEqual(await cache.getOrLoad("a", load("a")), { key: "a", status: "ready", count: 1 });
  await cache.getOrLoad("b", load("b"));
  await cache.getOrLoad("a", load("a")); // Touch a, so b becomes the LRU entry.
  await cache.getOrLoad("c", load("c"));
  assert.equal((await cache.getOrLoad("b", load("b"))).count, 2);

  now = 1;
  assert.equal((await cache.getOrLoad("failure", load("failure", "error"))).count, 1);
  now = 5;
  assert.equal((await cache.getOrLoad("failure", load("failure", "error"))).count, 1);
  now = 6;
  assert.equal((await cache.getOrLoad("failure", load("failure", "error"))).count, 2);
});

test("async pages avoid duplicate vinext probes without losing dynamic HTTP errors", async () => {
  const appDirectory = join(rootPath, "app");
  const pages = (await walk(appDirectory)).filter((file) => file.endsWith(`${sep}page.tsx`));
  const asyncPages = [];

  for (const page of pages) {
    const text = await readFile(page, "utf8");
    if (!/export\s+default\s+async\s+function\b/.test(text)) continue;
    asyncPages.push(relative(rootPath, page).split(sep).join("/"));
    const boundary = join(dirname(page), "loading.tsx");
    await assert.doesNotReject(access(boundary), `${relative(rootPath, boundary)} is required for ${relative(rootPath, page)}`);
  }

  assert.ok(asyncPages.length >= 10, "the audit must cover every current async route family");

  for (const page of [
    "app/admin/page.tsx",
    "app/admin/[id]/page.tsx",
    "app/auth/result/page.tsx",
    "app/auth/update-password/page.tsx",
    "app/category/[slug]/page.tsx",
    "app/listing/[slug]/page.tsx",
    "app/login/page.tsx",
    "app/messages/[id]/page.tsx",
    "app/profile/edit/page.tsx",
    "app/seller/[id]/page.tsx",
  ]) {
    const text = await source(page);
    assert.match(text, /export\s+default\s+function\b[\s\S]*?return\s+<\w+PageContent(?:\s+\{\.\.\.props\})?\s*\/>/,
      `${page} must use a sync wrapper so notFound/redirect settles before the response shell`);
    assert.doesNotMatch(text, /export\s+default\s+async\s+function\b/);
    await assert.rejects(access(join(dirname(join(rootPath, page)), "loading.tsx")),
      `${page} must not use a leaf loading boundary that can turn notFound into a 200 shell`);
  }
});

test("request-driven mutations do not schedule a duplicate replace plus refresh navigation", async () => {
  const offenders = [];
  for (const directory of ["app", "components"]) {
    for (const file of await walk(join(rootPath, directory))) {
      const text = await readFile(file, "utf8");
      if (/\brouter\.replace\s*\(/.test(text) && /\brouter\.refresh\s*\(/.test(text)) {
        offenders.push(relative(rootPath, file).split(sep).join("/"));
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("PWA runtime ignores initial controller acquisition and avoids an eager update request", async () => {
  const runtime = await source("components/pwa-runtime.tsx");
  assert.match(runtime, /controlledAtRegistration\s*=\s*Boolean\(navigator\.serviceWorker\.controller\)/);
  assert.match(runtime, /if\s*\(\s*!controlledAtRegistration\s*\)\s*\{[\s\S]*?controlledAtRegistration\s*=\s*true;[\s\S]*?return;/);
  assert.match(runtime, /reloadRequested\.current/);
  assert.equal(runtime.match(/\bcheckForUpdate\(\)/g)?.length ?? 0, 1, "only the visibility-gated interval may check for updates");
  assert.match(runtime, /setInterval\([\s\S]*?visibilityState\s*===\s*["']visible["'][\s\S]*?checkForUpdate\(\)/);
});
