import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("PWA manifest, icons and offline update flow are complete", async () => {
  const manifest = JSON.parse(await readFile(new URL("public/manifest.webmanifest", root), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.display_override[0], "standalone");
  assert.equal(manifest.scope, "/");
  assert.notEqual(manifest.id, "/");
  assert.match(manifest.start_url, /mode=standalone/);
  assert.equal(manifest.prefer_related_applications, false);
  for (const [icon, width] of [["marketo-pwa-192-v2.png", 192], ["marketo-pwa-512-v2.png", 512], ["marketo-pwa-maskable-192-v2.png", 192], ["marketo-pwa-maskable-512-v2.png", 512]]) {
    const data = await readFile(new URL(`public/icons/${icon}`, root));
    assert.ok(data.length > 100);
    assert.equal(data.readUInt32BE(16), width);
    assert.equal(data.readUInt32BE(20), width);
  }
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "maskable"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  const layout = await readFile(new URL("app/layout.tsx", root), "utf8");
  const favicon = await readFile(new URL("public/marketo-favicon-v2.svg", root), "utf8");
  assert.match(layout, /marketo-favicon-v2\.svg/);
  assert.match(favicon, /#16a34a/);
  assert.match(favicon, />M|M132 364/);
  assert.doesNotMatch(favicon, /#0C79D8|#2E9EFF/);
  const worker = await readFile(new URL("public/sw.js", root), "utf8");
  const runtime = await readFile(new URL("components/pwa-runtime.tsx", root), "utf8");
  assert.match(worker, /marketo-static-v5/);
  assert.match(worker, /"\/offline"/);
  assert.doesNotMatch(worker.match(/const APP_SHELL[^;]+;/)?.[0] ?? "", /manifest\.webmanifest|favicon/);
  assert.match(worker, /request\.mode === "navigate"[\s\S]*fetch\(request\)/);
  assert.match(worker, /event\.waitUntil\(self\.skipWaiting/);
  assert.match(worker, /postMessage\(\{ activated: true \}\)/);
  assert.match(runtime, /updateViaCache: "none"/);
  assert.match(runtime, /new MessageChannel\(\)/);
  assert.match(runtime, /pwa\.updateTitle/);
  assert.match(runtime, /4500/);
});

test("PWA install always opens on explicit iPhone or Android choice", async () => {
  const source = await readFile(new URL("components/pwa-install.tsx", root), "utf8");
  assert.match(source, /const showInstall[\s\S]*setChoice\(null\)[\s\S]*setOpen\(true\)/);
  assert.match(source, /setChoice\("ios"\)/);
  assert.match(source, /setChoice\("android"\)/);
  assert.match(source, /pwa\.androidStandaloneNote/);
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
  assert.deepEqual(catalog.getCategoryPath("cars-suv").map((item) => item.slug), ["transport", "cars", "cars-suv"]);
  assert.deepEqual(catalog.getCategoryPath("smartphones").map((item) => item.slug), ["electronics", "phones-accessories", "smartphones"]);
  assert.equal(catalog.getCategoryChildren().length, catalog.categoryTree.length);
  assert.deepEqual(catalog.getCategoryChildren("cars").map((item) => item.slug).slice(0, 2), ["cars-sedan", "cars-suv"]);
  assert.equal(catalog.categoryReferences.find((item) => item.slug === "cars-suv").parentId, "cars");
  assert.deepEqual(catalog.searchCategoryOptions("седан").map((item) => item.slug), ["cars-sedan"]);
  assert.deepEqual(catalog.searchCategoryOptions("ноутбук").map((item) => item.slug), ["laptops"]);
  assert.equal(catalog.getCategoryPresentation("jobs-logistics").priceMode, "salary");
  assert.equal(catalog.getCategoryPresentation("free-home").priceMode, "free");
  assert.ok(catalog.getCategoryAttributes("smartphones").some((item) => item.id === "model" && item.filterable));
  assert.ok(catalog.getCategoryAttributes("smartphones").some((item) => item.id === "color"));
  const allNodes = [];
  const visit = (nodes) => nodes.forEach((node) => { allNodes.push(node); if (node.children) visit(node.children); });
  visit(catalog.categoryTree);
  assert.ok(allNodes.every((node) => node.name.ru && node.name.kk));
  assert.ok(allNodes.filter((node) => node.name.ru !== node.name.kk).length >= 120);
  for (const set of Object.values(catalog.attributeSets)) for (const attribute of set) {
    assert.ok(attribute.label.ru && attribute.label.kk);
    for (const option of attribute.options ?? []) assert.ok(option.label.ru && option.label.kk);
  }
});

test("mobile category selection renders one level and catalog filters share the same tree", async () => {
  const picker = await readFile(new URL("components/category-picker.tsx", root), "utf8");
  const cascade = await readFile(new URL("components/category-cascade.tsx", root), "utf8");
  const catalog = await readFile(new URL("components/catalog-client.tsx", root), "utf8");
  assert.match(picker, /getCategoryChildren\(parentSlug\)/);
  assert.match(picker, /searchCategoryOptions\(query\)/);
  assert.match(picker, /item\.children\?\.length[\s\S]*setParentSlug\(item\.slug\)/);
  assert.doesNotMatch(picker, /categoryOptions\.map|item\.depth|paddingLeft/);
  assert.match(cascade, /categoryTree\.map/);
  assert.match(cascade, /parent\.children\.map/);
  assert.match(catalog, /<CategoryCascade/);
  assert.match(catalog, /isCategoryWithin\(item\.categorySlug, categorySlug\)/);
  assert.match(catalog, /item\.attributes\?\.\[key\]/);
  assert.match(catalog, /params\.set\(`f_\$\{key\}`/);
  assert.match(catalog, /document\.body\.style\.overflow = "hidden"/);
});

test("home search and primary mobile calls to action navigate to real routes", async () => {
  const home = await readFile(new URL("app/page.tsx", root), "utf8");
  const header = await readFile(new URL("components/header.tsx", root), "utf8");
  assert.match(home, /<Link href="\/publish" className="primary-action"/);
  assert.match(home, /<Link href="\/search" className="secondary-action"/);
  assert.match(header, /<form className="header-search" action="\/search">/);
  assert.match(header, /<input name="q"/);
  assert.match(header, /<button type="submit">/);
});

test("catalog URL parser preserves search, geo, sorting and category attributes", async () => {
  const { parseCatalogSearchParams } = await import(new URL("lib/catalog-search-params.ts", root));
  assert.deepEqual(parseCatalogSearchParams({ q: "camry", category: "cars-suv", city: "petropavl", price_min: "1 000", sort: "cheap", f_drive: "all", f_remote: "true" }), {
    query: "camry",
    categorySlug: "cars-suv",
    cityId: "petropavl",
    minPrice: "1000",
    maxPrice: "",
    sort: "cheap",
    dynamicFilters: { drive: "all", remote: true },
  });
});

test("Russian and Kazakh dictionaries stay type-aligned and locale preference is wired", async () => {
  const { messages } = await import(new URL("lib/i18n/messages.ts", root));
  assert.deepEqual(Object.keys(messages.kk).sort(), Object.keys(messages.ru).sort());
  assert.ok(Object.values(messages.kk).every(Boolean));
  const layout = await readFile(new URL("app/layout.tsx", root), "utf8");
  const header = await readFile(new URL("components/header.tsx", root), "utf8");
  const provider = await readFile(new URL("components/i18n-provider.tsx", root), "utf8");
  const migration = await readFile(new URL("supabase/migrations/0001_marketo_core.sql", root), "utf8");
  assert.match(layout, /<html lang=\{locale\}>/);
  assert.match(header, /<LanguageSwitcher compact/);
  assert.match(provider, /Max-Age=31536000/);
  assert.match(provider, /router\.refresh\(\)/);
  assert.match(migration, /language text not null default 'ru'/);
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
  for (const selector of [".app-page-header", ".back-button", ".location-sheet", ".publish-card", ".chat-index-shell", ".category-directory", ".language-switcher"]) assert.match(css, new RegExp(selector.replace(".", "\\.")));
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
  for (const file of ["build-verified.sh", "install-ci.sh", "sites-env.sh", "validate-artifact.sh"]) {
    const source = await readFile(new URL(`scripts/${file}`, root), "utf8");
    for (const line of source.split("\n").filter((item) => /"\$\{script_dir\}\/[^\s"]+\.sh"/.test(item))) assert.match(line, /\b(?:source|bash)\s+"\$\{script_dir\}\//);
  }
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
