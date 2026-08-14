import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("PWA manifest and icons are complete", async () => {
  const manifest = JSON.parse(await readFile(new URL("public/manifest.webmanifest", root), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  for (const icon of ["marketo-180.png", "marketo-192.png", "marketo-512.png", "marketo-maskable-512.png"]) {
    assert.ok((await stat(new URL(`public/icons/${icon}`, root))).size > 100);
  }
});

test("PWA install always opens on platform choice", async () => {
  const source = await readFile(new URL("components/pwa-install.tsx", root), "utf8");
  assert.match(source, /const showInstall[\s\S]*setChoice\(null\)[\s\S]*setOpen\(true\)/);
  assert.match(source, /setChoice\("ios"\)/);
  assert.match(source, /setChoice\("android"\)/);
});

test("PWA updates wait for an explicit user action", async () => {
  const worker = await readFile(new URL("public/sw.js", root), "utf8");
  const runtime = await readFile(new URL("components/pwa-runtime.tsx", root), "utf8");
  const installHandler = worker.match(/addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);
  assert.doesNotMatch(installHandler, /skipWaiting/);
  assert.match(runtime, /Доступна новая версия Marketo/);
  assert.match(runtime, /postMessage\(\{ type: "SKIP_WAITING" \}\)/);
});

test("Kazakhstan geography uses one nationwide typed reference", async () => {
  const { KAZAKHSTAN, regions, settlements } = await import(new URL("lib/geography.ts", root));
  assert.equal(KAZAKHSTAN.iso2, "KZ");
  assert.equal(KAZAKHSTAN.currency, "KZT");
  assert.equal(regions.filter((region) => region.kind === "region").length, 17);
  assert.equal(regions.filter((region) => region.kind === "republican_city").length, 3);
  assert.equal(settlements.length, 90);
  for (const required of ["Астана", "Алматы", "Шымкент", "Петропавловск", "Костанай", "Уральск", "Усть-Каменогорск", "Байконыр", "Алатау"]) {
    assert.ok(settlements.some((settlement) => settlement.name.ru === required), `missing ${required}`);
  }
});

test("category context controls placeholders and filters", async () => {
  const { categoryConfigs, getCategoryBySlug } = await import(new URL("lib/catalog-config.ts", root));
  assert.ok(categoryConfigs.length >= 10);
  const transport = getCategoryBySlug("transport");
  const jobs = getCategoryBySlug("jobs");
  const services = getCategoryBySlug("services");
  assert.notEqual(transport.searchPlaceholder.ru, jobs.searchPlaceholder.ru);
  assert.notEqual(transport.searchPlaceholder.ru, services.searchPlaceholder.ru);
  assert.ok(jobs.filters.some((filter) => filter.id === "employment"));
  assert.ok(!jobs.filters.some((filter) => filter.id === "brand"));
  assert.ok(services.filters.some((filter) => filter.id === "serviceType"));
});

test("every category has coherent marketplace sample data", async () => {
  const { categoryConfigs } = await import(new URL("lib/catalog-config.ts", root));
  const source = await readFile(new URL("lib/mock-data.ts", root), "utf8");
  for (const category of categoryConfigs) {
    assert.match(source, new RegExp(`categorySlug:\\s*["']${category.slug}["']`), `missing sample listing for ${category.slug}`);
  }
  assert.match(source, /categorySlug:\s*"jobs"[\s\S]{0,260}employment:/);
  assert.match(source, /categorySlug:\s*"services"[\s\S]{0,260}serviceType:/);
});

test("production CSS contains shared internal-page primitives", async () => {
  const assetNames = await readdir(new URL("dist/client/assets/", root));
  const cssName = assetNames.find((name) => name.endsWith(".css"));
  assert.ok(cssName, "compiled CSS asset is missing");
  const css = await readFile(new URL(`dist/client/assets/${cssName}`, root), "utf8");
  for (const selector of [".app-page-header", ".back-button", ".location-sheet", ".publish-card", ".chat-index-shell"]) {
    assert.match(css, new RegExp(selector.replace(".", "\\.")));
  }
  assert.match(css, /--border:/);
});

test("mobile CSS protects Safari forms and fixed navigation", async () => {
  const source = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(source, /overflow-x:\s*(?:hidden|clip)/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /\.back-button[\s\S]{0,220}min-height:\s*44px/);
  assert.match(source, /@media \(max-width: 640px\)[\s\S]*font-size:\s*16px/);
  assert.match(source, /select[\s\S]{0,180}appearance:\s*none/);
});

test("shell helpers never execute another shell helper directly", async () => {
  for (const file of ["build-verified.sh", "install-ci.sh", "validate-artifact.sh"]) {
    const source = await readFile(new URL(`scripts/${file}`, root), "utf8");
    assert.doesNotMatch(source, /^\s*(?:exec\s+)?"\$\{script_dir\}\/sites-env\.sh"/m);
    assert.match(source, /source "\$\{script_dir\}\/sites-env\.sh"/);
  }
  const build = await readFile(new URL("scripts/build-verified.sh", root), "utf8");
  assert.match(build, /bash "\$\{script_dir\}\/validate-artifact\.sh"/);
});

test("source contains no absolute local Windows paths", async () => {
  const files = ["package.json", "vite.config.ts", "next.config.ts", "README.md"];
  for (const file of files) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.doesNotMatch(source, /[A-Za-z]:\\\\/);
  }
});

test("back navigation uses in-app history and a route fallback", async () => {
  const source = await readFile(new URL("components/back-button.tsx", root), "utf8");
  const tracker = await readFile(new URL("components/navigation-history.tsx", root), "utf8");
  assert.match(source, /router\.back\(\)/);
  assert.match(source, /router\.push\(fallback\)/);
  assert.match(source, /PREVIOUS_ROUTE_KEY/);
  assert.match(tracker, /referrer\.origin !== window\.location\.origin/);
});

test("Cloudflare compatibility flag has one production source", async () => {
  const wrangler = await readFile(new URL("wrangler.jsonc", root), "utf8");
  const vite = await readFile(new URL("vite.config.ts", root), "utf8");
  const generated = JSON.parse(await readFile(new URL("dist/server/wrangler.json", root), "utf8"));
  assert.equal((wrangler.match(/nodejs_compat/g) ?? []).length, 1);
  assert.doesNotMatch(vite, /nodejs_compat|compatibility_flags/);
  assert.deepEqual(generated.compatibility_flags, ["nodejs_compat"]);
  assert.equal(generated.assets.binding, "ASSETS");
});
