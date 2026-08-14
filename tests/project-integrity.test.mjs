import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("PWA manifest, icons and offline update flow are complete", async () => {
  const manifest = JSON.parse(await readFile(new URL("public/manifest.webmanifest", root), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  for (const icon of ["marketo-180.png", "marketo-192.png", "marketo-512.png", "marketo-maskable-512.png"]) assert.ok((await stat(new URL(`public/icons/${icon}`, root))).size > 100);
  const worker = await readFile(new URL("public/sw.js", root), "utf8");
  const runtime = await readFile(new URL("components/pwa-runtime.tsx", root), "utf8");
  assert.match(worker, /marketo-static-v4/);
  assert.match(worker, /"\/offline"/);
  assert.match(worker, /event\.waitUntil\(self\.skipWaiting/);
  assert.match(worker, /postMessage\(\{ activated: true \}\)/);
  assert.match(runtime, /updateViaCache: "none"/);
  assert.match(runtime, /new MessageChannel\(\)/);
  assert.match(runtime, /Доступна новая версия Marketo/);
  assert.match(runtime, /4500/);
});

test("PWA install always opens on explicit iPhone or Android choice", async () => {
  const source = await readFile(new URL("components/pwa-install.tsx", root), "utf8");
  assert.match(source, /const showInstall[\s\S]*setChoice\(null\)[\s\S]*setOpen\(true\)/);
  assert.match(source, /setChoice\("ios"\)/);
  assert.match(source, /setChoice\("android"\)/);
});

test("Kazakhstan geography is a nationwide typed reference", async () => {
  const { KAZAKHSTAN, regions, settlements } = await import(new URL("lib/geography.ts", root));
  assert.equal(KAZAKHSTAN.iso2, "KZ");
  assert.equal(KAZAKHSTAN.currency, "KZT");
  assert.equal(regions.filter((region) => region.kind === "region").length, 17);
  assert.equal(regions.filter((region) => region.kind === "republican_city").length, 3);
  assert.equal(settlements.length, 90);
  for (const required of ["Астана", "Алматы", "Шымкент", "Петропавловск", "Костанай", "Уральск", "Усть-Каменогорск", "Байконыр", "Алатау"]) assert.ok(settlements.some((settlement) => settlement.name.ru === required), `missing ${required}`);
});

test("category tree covers marketplace sections and context-specific attributes", async () => {
  const catalog = await import(new URL("lib/catalog-config.ts", root));
  assert.ok(catalog.categoryTree.length >= 14);
  assert.ok(catalog.categoryCount >= 150);
  for (const slug of ["cars", "motorcycles", "commercial-transport", "special-transport", "agricultural-transport", "water-transport", "air-transport", "parts", "real-estate", "jobs", "services", "electronics", "home-garden", "personal", "kids", "hobby", "animals", "business", "free", "exchange"]) assert.ok(catalog.getCategoryBySlug(slug), `missing category ${slug}`);
  const transport = catalog.getCategoryBySlug("transport");
  const jobs = catalog.getCategoryBySlug("jobs");
  const services = catalog.getCategoryBySlug("services");
  assert.notEqual(transport.searchPlaceholder.ru, jobs.searchPlaceholder.ru);
  assert.notEqual(transport.searchPlaceholder.ru, services.searchPlaceholder.ru);
  assert.ok(catalog.getCategoryAttributes("jobs").some((item) => item.id === "employment"));
  assert.ok(!catalog.getCategoryAttributes("jobs").some((item) => item.id === "brand"));
  assert.ok(catalog.getCategoryAttributes("services").some((item) => item.id === "visit"));
});

test("user-data repositories are honest empty adapters and mock modules are absent", async () => {
  const { listingRepository, profileRepository, chatRepository, notificationRepository, moderationRepository } = await import(new URL("lib/data/repositories.ts", root));
  assert.deepEqual(await listingRepository.list(), { items: [], total: 0, nextCursor: null });
  assert.equal(await profileRepository.current(), null);
  assert.equal((await chatRepository.list()).total, 0);
  assert.equal((await notificationRepository.list()).total, 0);
  assert.equal((await moderationRepository.list()).total, 0);
  await assert.rejects(access(new URL("lib/mock-data.ts", root)));
  await assert.rejects(access(new URL("lib/chat-data.ts", root)));
  const sourceFiles = ["app/page.tsx", "app/profile/page.tsx", "app/messages/page.tsx", "app/notifications/page.tsx", "app/admin/page.tsx", "components/publish-form.tsx"];
  for (const file of sourceFiles) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.doesNotMatch(source, /Айдос|Нурлан|Марина|Руслан|78 000|4,9|18 отзыв/);
  }
});

test("production CSS has shared mobile primitives and no compiled webfonts", async () => {
  const assetNames = await readdir(new URL("dist/client/assets/", root));
  const cssName = assetNames.find((name) => name.endsWith(".css"));
  assert.ok(cssName);
  const css = await readFile(new URL(`dist/client/assets/${cssName}`, root), "utf8");
  for (const selector of [".app-page-header", ".back-button", ".location-sheet", ".publish-card", ".chat-index-shell", ".category-directory"]) assert.match(css, new RegExp(selector.replace(".", "\\.")));
  assert.equal(assetNames.some((name) => name.includes("_vinext_fonts")), false);
  const source = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(source, /overflow-x:\s*(?:hidden|clip)/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /@media \(max-width: 640px\)[\s\S]*font-size:\s*16px/);
  assert.match(source, /select[\s\S]{0,180}appearance:\s*none/);
});

test("shell helpers do not depend on executable bits", async () => {
  for (const file of ["build-verified.sh", "install-ci.sh", "validate-artifact.sh"]) {
    const source = await readFile(new URL(`scripts/${file}`, root), "utf8");
    assert.match(source, /source "\$\{script_dir\}\/sites-env\.sh"/);
    assert.doesNotMatch(source, /^\s*(?:exec\s+)?"\$\{script_dir\}\/sites-env\.sh"/m);
  }
  const build = await readFile(new URL("scripts/build-verified.sh", root), "utf8");
  assert.match(build, /bash "\$\{script_dir\}\/validate-artifact\.sh"/);
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  for (const command of Object.values(pkg.scripts)) if (/\.sh\b/.test(command)) assert.match(command, /^(?:bash|source|\.)\s/);
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
