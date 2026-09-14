import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Home follows Header → Search → City Premium Showcase → Catalog/Listings", async () => {
  const home = await readFile(new URL("app/page.tsx", root), "utf8");
  const tabs = await readFile(new URL("components/home-marketplace-tabs.tsx", root), "utf8");
  const header = await readFile(new URL("components/header.tsx", root), "utf8");
  const headerPosition = home.indexOf("<Header />");
  const showcasePosition = home.indexOf("<CityPremiumShowcase />");
  const tabsPosition = home.indexOf("<HomeMarketplaceTabs");
  assert.ok(headerPosition >= 0 && headerPosition < showcasePosition && showcasePosition < tabsPosition);
  assert.match(header, /<form(?=[^>]*\bclassName="header-search")(?=[^>]*\baction="\/search")(?=[^>]*\brole="search")[^>]*>/);
  assert.match(home, /catalog=\{catalogPanel\}/);
  assert.match(tabs, /active === "catalog" \? catalog : listingsPanel/);
  assert.match(tabs, /fetchHomeListingPreview\(controller\.signal\)/);
});

test("showcase preserves server order, uses four initial tiles and expands the same cards", async () => {
  const source = await readFile(new URL("components/city-premium-showcase.tsx", root), "utf8");
  assert.match(source, /premiumDemoCount\(paidItems.length\)/);
  assert.match(source, /return \[\.\.\.paidItems, \.\.\.brandedItems\]/);
  assert.match(source, /viewAll \? items : items.slice\(0, 4\)/);
  assert.doesNotMatch(source, /useShowcaseTimeline|showcaseWindow|Math.random/);
  assert.match(source, /key=\{item.kind \+ "-" \+ item.id\}/);
  assert.match(source, /Date\.parse\(item\.expiresAt\) > deadlineNow/);
  assert.match(source, /paidState\.city === selectedLocation/);
  assert.match(source, /t\("showcase.total", \{ count: paid.length \}\)/);
  assert.match(source, /<LocationPicker allowAll=\{false\} \/>/);
});

test("demo tiles follow the complete 0..15 rule without filling capacity", async () => {
  const { premiumDemoCount } = await import("../lib/premium-showcase-presentation.ts");
  const expected = [4,3,2,1,0,1,0,1,0,1,0,1,0,1,0,0];
  expected.forEach((demo, real) => assert.equal(premiumDemoCount(real), demo, "real=" + real));
  for (const invalid of [-1, NaN, Infinity, 1.5, 16]) assert.equal(premiumDemoCount(invalid), 0);
});

test("premium API and migration expose active paid placements only with default capacity 15", async () => {
  const api = await readFile(new URL("app/api/showcase/route.ts", root), "utf8");
  const migration = await readFile(new URL("supabase/migrations/0019_city_premium_showcase.sql", root), "utf8");
  const correction = await readFile(new URL("supabase/migrations/0020_targeted_catalog_and_premium_foundation.sql", root), "utf8");
  assert.match(api, /eq\("is_active", true\)\.eq\("is_selectable", true\)/);
  assert.match(api, /get_city_premium_placements/);
  assert.match(api, /get_city_premium_availability/);
  assert.match(api, /p_limit: product.capacity/);
  assert.match(migration, /capacity smallint not null default 15/);
  assert.match(migration, /status = 'active'[\s\S]*starts_at <= current_timestamp[\s\S]*ends_at > current_timestamp/);
  assert.match(migration, /listing\.status = 'active'/);
  assert.match(migration, /order by md5\(p_settlement_id::text \|\| ':' \|\| placement\.id::text\), placement\.id/);
  assert.match(migration, /city premium capacity exceeded/);
  assert.match(correction, /city_premium_accounts/);
  assert.match(correction, /city_premium_orders/);
  assert.match(correction, /city_premium_events/);
  assert.match(correction, /city_premium_daily_metrics/);
  assert.doesNotMatch(correction, /10\s*000|10000/);
});

test("both showcase modes retain two mobile columns and the catalog thumbnail treatment", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  const source = await readFile(new URL("components/city-premium-showcase.tsx", root), "utf8");
  assert.match(css, /\.showcase-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.showcase-grid \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /\.showcase-grid-all \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /showcase-card:nth-child\(3\)/);
  assert.match(source, /showcase-media listing-image-wrap/);
  assert.match(source, /className="listing-image"/);
  assert.match(css, /\.showcase-media \.listing-image \{ position: absolute; inset: 0; \}/);
});
