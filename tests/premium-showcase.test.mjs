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

test("showcase is a stable compact preview with no carousel controls or autoplay", async () => {
  const source = await readFile(new URL("components/city-premium-showcase.tsx", root), "utf8");
  assert.doesNotMatch(source, /useShowcaseTimeline|rotationIndexAt|rotationFrameAt|autoplayPaused|toggleAutoplay|rotationOffsets|setInterval|marketo-showcase-offset|showcase-controls|aria-roledescription/);
  assert.match(source, /const visible = items\.slice\(0, 3\)/);
  assert.match(source, /Math\.max\(0, 3 - paidItems\.length\)/);
  assert.match(source, /cityKey = selectedLocation === "all" \? "all-kazakhstan" : selectedLocation/);
  assert.doesNotMatch(source, /cityKey\s*=.*locale/);
  assert.match(source, /<div className="showcase-city-row">\s*<p className="showcase-city">[\s\S]*?\{cityLabel\}[\s\S]*?<\/p>\s*<button className="secondary-button showcase-view-all"/);
  assert.doesNotMatch(source, /t\("showcase\.activeOnly"\)/);
  assert.match(source, /const displayed = viewAll \? paid\.map\(/);
  assert.match(source, /Date\.parse\(item\.expiresAt\) > deadlineNow/);
  assert.match(source, /paidState\.city === selectedLocation/);
  assert.match(source, /<LocationPicker allowAll=\{false\} \/>/);
  assert.match(source, /viewAll && paidLoading/);
  assert.match(source, /paid\.length \? "showcase\.total" : "showcase\.empty"/);
});

test("premium API and migration expose active paid placements only with default capacity 15", async () => {
  const api = await readFile(new URL("app/api/showcase/route.ts", root), "utf8");
  const migration = await readFile(new URL("supabase/migrations/0019_city_premium_showcase.sql", root), "utf8");
  const correction = await readFile(new URL("supabase/migrations/0020_targeted_catalog_and_premium_foundation.sql", root), "utf8");
  assert.match(api, /eq\("is_active", true\)\.eq\("is_selectable", true\)/);
  assert.match(api, /get_city_premium_placements/);
  assert.match(api, /p_limit: 15/);
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

test("showcase renders three complete desktop cards, two complete mobile cards, and listing grid stays two-up", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /\.showcase-grid \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.showcase-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.showcase-grid:not\(\.showcase-grid-all\) > \.showcase-card:nth-child\(3\) \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.listing-grid \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
});
