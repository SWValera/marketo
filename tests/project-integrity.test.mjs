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
  assert.match(worker, /marketo-static-v6/);
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
  const { messages } = await import(new URL("lib/i18n/messages.ts", root));
  assert.match(source, /const showInstall[\s\S]*setChoice\(null\)[\s\S]*setOpen\(true\)/);
  assert.match(source, /setChoice\("ios"\)/);
  assert.match(source, /setChoice\("android"\)/);
  assert.match(source, /pwa\.androidStandaloneNote/);
  for (const platform of ["iphone", "android"]) {
    for (let step = 1; step <= 6; step += 1) assert.match(source, new RegExp(`pwa\\.${platform}Step${step}`));
  }
  assert.match(messages.ru["pwa.iphoneNote"], /WhatsApp.*Telegram.*Safari/);
  assert.match(messages.kk["pwa.iphoneNote"], /WhatsApp.*Telegram.*Safari/);
  assert.match(messages.ru["pwa.androidStep2"], /⋮.*правом верхнем углу/);
  assert.match(messages.kk["pwa.androidStep2"], /жоғарғы оң жақ.*⋮/);
});

test("Kazakhstan geography provides a nationwide region and major-city bootstrap", async () => {
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
  assert.deepEqual(catalog.searchCategoryOptions("ноутбук").map((item) => item.slug), ["computer-laptop-repair", "laptops"]);
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

test("mobile category selection renders one Supabase-backed level and catalog filters share the same tree", async () => {
  const picker = await readFile(new URL("components/category-picker.tsx", root), "utf8");
  const cascade = await readFile(new URL("components/category-cascade.tsx", root), "utf8");
  const catalog = await readFile(new URL("components/catalog-client.tsx", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(picker, /getCategoryChildren\(view, parentSlug\)/);
  assert.match(picker, /searchCategoryReferences\(view, query\)/);
  assert.match(picker, /getCategoryChildren\(view, item\)\.length > 0[\s\S]*setParentSlug\(item\.slug\)/);
  assert.doesNotMatch(picker, /categoryOptions\.map|item\.depth|paddingLeft/);
  assert.match(cascade, /getRootCategories\(view\)/);
  assert.match(cascade, /getCategoryChildren\(view, parent\)/);
  assert.match(catalog, /<CategoryCascade/);
  assert.match(catalog, /isCategoryWithin\(catalogView, item\.categorySlug, categorySlug\)/);
  assert.match(catalog, /item\.attributes\?\.\[attributeKey\]/);
  assert.match(catalog, /params\.set\(`f_\$\{key\}`/);
  assert.match(catalog, /document\.body\.style\.overflow = "hidden"/);
  assert.match(picker, /window\.visualViewport/);
  assert.match(picker, /body\.style\.position = "fixed"/);
  assert.match(picker, /addEventListener\("resize", syncVisualViewport\)/);
  assert.doesNotMatch(picker, /autoFocus/);
  assert.match(css, /--category-picker-viewport-height/);
  assert.match(css, /\.category-picker-results \{ min-height: 0;/);
});

test("mobile publish actions stay in document flow and passenger-car fields are normalized", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  const publish = await readFile(new URL("components/publish-form.tsx", root), "utf8");
  const { attributeSets } = await import(new URL("lib/catalog-config.ts", root));
  const { passengerVehicleBrands } = await import(new URL("lib/reference-data/vehicle-brands.ts", root));
  assert.match(css, /\.publish-controls \{ position: static; bottom: auto; z-index: auto; box-shadow: none; \}/);
  assert.match(publish, /publish-controls/);
  assert.match(publish, /publish\.title/);
  assert.equal(passengerVehicleBrands.length, 141);
  assert.equal(new Set(passengerVehicleBrands.map((item) => item.value)).size, passengerVehicleBrands.length);
  assert.equal(passengerVehicleBrands.at(-1)?.value, "other");
  assert.deepEqual(attributeSets.passengerCar.map((attribute) => attribute.id), [
    "brand", "model", "year", "mileage", "transmission", "fuel", "drive", "engine_volume", "condition",
  ]);
  assert.equal(attributeSets.passengerCar.filter((attribute) => attribute.id === "brand").length, 1);
  assert.equal(attributeSets.passengerCar.some((attribute) => attribute.id === "body"), false);
});

test("application UI reads reference data through Supabase adapters, never seed modules", async () => {
  const sourceFiles = [
    "app/page.tsx",
    "app/categories/page.tsx",
    "app/search/page.tsx",
    "app/category/[slug]/page.tsx",
    "app/publish/page.tsx",
    "components/catalog-client.tsx",
    "components/category-cascade.tsx",
    "components/category-picker.tsx",
    "components/location-picker.tsx",
    "components/publish-form.tsx",
  ];
  for (const file of sourceFiles) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.doesNotMatch(source, /@\/lib\/(?:catalog-config|geography)/, file);
  }
  const server = await readFile(new URL("lib/reference-data/server.ts", root), "utf8");
  const geographyQueries = await readFile(new URL("lib/data/supabase/geography.ts", root), "utf8");
  const categoryQueries = await readFile(new URL("lib/data/supabase/categories.ts", root), "utf8");
  const attributeRoute = await readFile(new URL("app/api/reference/categories/[id]/attributes/route.ts", root), "utf8");
  for (const table of ["countries", "regions", "settlements"]) assert.match(geographyQueries, new RegExp(`from\\(\"${table}\"\\)`));
  for (const table of ["categories", "category_attributes", "category_attribute_options"]) assert.match(categoryQueries, new RegExp(`from\\(\"${table}\"\\)`));
  assert.match(server, /createSupabasePublicServerClient/);
  assert.match(attributeRoute, /getCategoryAttributeReferences/);
  assert.doesNotMatch([server, geographyQueries, categoryQueries, attributeRoute].join("\n"), /service_role|SUPABASE_SECRET_KEY|createSupabaseAdminClient/i);
});

test("home search, City Premium Showcase and primary calls to action navigate to real routes", async () => {
  const home = await readFile(new URL("app/page.tsx", root), "utf8");
  const showcase = await readFile(new URL("components/city-premium-showcase.tsx", root), "utf8");
  const header = await readFile(new URL("components/header.tsx", root), "utf8");
  assert.match(home, /<Link(?=[^>]*\bhref="\/publish")(?=[^>]*\bprefetch=\{false\})[^>]*\bclassName="primary-action"/);
  assert.match(home, /<CityPremiumShowcase \/>/);
  assert.match(home, /<HomeMarketplaceTabs catalog=\{catalogPanel\} listings=\{listingsPanel\} \/>/);
  assert.match(showcase, /href=\{`\/listing\/\$\{item\.listingId\}-\$\{item\.slug\}`\}/);
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
  const migration = await readFile(new URL("supabase/migrations/0003_profiles_and_roles.sql", root), "utf8");
  assert.match(layout, /<html lang=\{locale\}>/);
  assert.match(header, /<LanguageSwitcher compact/);
  assert.match(provider, /Max-Age=31536000/);
  assert.match(provider, /router\.refresh\(\)/);
  assert.match(migration, /language_code varchar\(10\) not null default 'ru'/);
});

test("listing reads use Supabase while disconnected user domains stay honest and mock modules stay absent", async () => {
  const repositories = await readFile(new URL("lib/data/repositories.ts", root), "utf8");
  const listings = await readFile(new URL("lib/data/supabase/listings.ts", root), "utf8");
  assert.match(repositories, /listPublishedListingCards\(createSupabasePublicServerClient\(\), filters\)/);
  assert.match(repositories, /const client = createSupabasePublicServerClient\(\)/);
  assert.match(repositories, /getListingDetailByRouteKey\(client, slug\)/);
  assert.match(repositories, /hydrateAttributes\(rows\.map\(\(row\) => row\.id\), locale\)/);
  assert.match(listings, /from\("listing_attribute_values"\)/);
  assert.match(listings, /from\("listing_attribute_option_values"\)/);
  for (const adapter of ["profileRepository", "chatRepository", "notificationRepository", "moderationRepository"]) {
    assert.match(repositories, new RegExp(`export const ${adapter} =`));
  }
  assert.doesNotMatch(repositories, /Айдос|Нурлан|Марина|Руслан|78 000|4,9|18 отзыв/);
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

test("npm build chain is cross-platform and independent of shell scripts", async () => {
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const expectedScripts = {
    "install:ci": "node scripts/install-ci.mjs",
    build: "node scripts/build-verified.mjs",
    test: "node scripts/run-with-sites-env.mjs --node scripts/test.mjs",
    "validate:artifact": "node scripts/validate-artifact.mjs",
  };
  for (const [name, command] of Object.entries(expectedScripts)) assert.equal(pkg.scripts[name], command);
  for (const [name, command] of Object.entries(pkg.scripts)) {
    assert.doesNotMatch(command, /(?:^|\s)(?:bash|sh|source)(?:\s|$)|\.sh\b|&&|\|\||tests\/\*/, `${name} must not require a POSIX shell`);
  }
  for (const file of ["build-verified.mjs", "install-ci.mjs", "run-with-sites-env.mjs", "test.mjs", "validate-artifact.mjs", "lib/node-runtime.mjs", "lib/sites-runtime.mjs"]) {
    await access(new URL(`scripts/${file}`, root));
  }
  const runtime = await readFile(new URL("scripts/lib/sites-runtime.mjs", root), "utf8");
  const installer = await readFile(new URL("scripts/install-ci.mjs", root), "utf8");
  const build = await readFile(new URL("scripts/build-verified.mjs", root), "utf8");
  assert.match(runtime, /WRANGLER_LOG_PATH/);
  assert.match(runtime, /npm_config_cache/);
  assert.match(installer, /integrity/);
  assert.match(installer, /install\.lock/);
  assert.match(build, /SITES_BUILD_TIMEOUT/);
});

test("local runtime scripts set Wrangler logging cross-platform", async () => {
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(pkg.devDependencies["cross-env"], "10.1.0");
  assert.match(pkg.scripts.dev, /^cross-env WRANGLER_LOG_PATH=\S+ vite$/);
  assert.match(pkg.scripts.start, /^cross-env WRANGLER_LOG_PATH=\S+ vinext start$/);
  for (const command of [pkg.scripts.dev, pkg.scripts.start]) {
    assert.doesNotMatch(command, /^WRANGLER_LOG_PATH=/);
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

test("repository source contains no committed credential values", async () => {
  const ignoredSegments = new Set([".git", ".next", ".sites-runtime", ".vinext", ".wrangler", "dist", "node_modules"]);
  const candidates = (await readdir(root, { recursive: true }))
    .map((name) => name.replaceAll("\\", "/"))
    .filter((name) => !name.split("/").some((segment) => ignoredSegments.has(segment)))
    .filter((name) => /(?:^|\/)(?:\.env\.example|[^/]+\.(?:ts|tsx|js|mjs|cjs|json|jsonc|sql|md|sh|yml|yaml))$/.test(name));
  const credentialPatterns = [
    /sb_secret_[A-Za-z0-9_-]{20,}/,
    /eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
    /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s/]+@/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /^(?!\s*#)\s*(?:CLOUDFLARE_API_TOKEN|R2_SECRET_ACCESS_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|POSTGRES_PASSWORD)\s*=\s*(?![^\r\n]*(?:REPLACE|YOUR_|EXAMPLE|<))[^\r\n]{16,}$/im,
  ];
  const unsafeFiles = [];
  for (const name of candidates) {
    const source = await readFile(new URL(name, root), "utf8").catch(() => "");
    if (credentialPatterns.some((pattern) => pattern.test(source))) unsafeFiles.push(name);
  }
  assert.deepEqual(unsafeFiles, [], `credential-like values found in: ${unsafeFiles.join(", ")}`);
});
