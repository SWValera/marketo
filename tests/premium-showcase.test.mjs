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
  assert.match(header, /<form className="header-search" action="\/search">/);
  assert.match(home, /catalog=\{catalogPanel\}/);
  assert.match(tabs, /active === "catalog" \? catalog : listingsPanel/);
  assert.match(tabs, /fetchHomeListingPreview\(controller\.signal\)/);
});

test("showcase uses the persistent elapsed-time timeline with locale-stable offsets and explicit pause", async () => {
  const source = await readFile(new URL("components/city-premium-showcase.tsx", root), "utf8");
  const timeline = await readFile(new URL("components/use-showcase-timeline.ts", root), "utf8");
  const rotation = await readFile(new URL("lib/showcase-rotation.ts", root), "utf8");
  assert.match(rotation, /SHOWCASE_ROTATION_MS = 3000/);
  assert.match(timeline, /rotationFrameAt\(Date\.now\(\)\)/);
  assert.match(timeline, /window\.setInterval\(listener, SHOWCASE_ROTATION_MS\)/);
  assert.match(source, /useShowcaseTimeline\(items\.length < 2 \|\| autoplayPaused\)/);
  assert.match(source, /rotationIndexAt\(timelineFrame, items\.length, persistedOffset\)/);
  assert.doesNotMatch(source, /setInterval/);
  assert.match(source, /safeWriteBrowserStorage\("localStorage", storageKey, String\(value\)\)/);
  assert.match(source, /safeWriteBrowserStorage\("sessionStorage", storageKey, String\(value\)\)/);
  assert.match(source, /safeReadBrowserStorage\("localStorage", storageKey\)/);
  assert.match(source, /safeReadBrowserStorage\("sessionStorage", storageKey\)/);
  assert.match(source, /marketo-showcase-offset-v2/);
  assert.match(source, /getServerSnapshot = useCallback\(\(\) => rotationOffsets\.get\(rotationKey\) \?\? 0/);
  assert.match(source, /rotationKey = selectedLocation === "all" \? "all-kazakhstan" : selectedLocation/);
  assert.doesNotMatch(source, /rotationKey\s*=.*locale/);
  assert.match(source, /onClick=\{\(\) => advance\(-1\)\}/);
  assert.match(source, /onClick=\{\(\) => advance\(1\)\}/);
  assert.match(source, /const \[autoplayPaused, setAutoplayPaused\] = useState\(false\)/);
  assert.match(source, /onClick=\{toggleAutoplay\}/);
  assert.match(source, /aria-pressed=\{autoplayPaused\}/);
  assert.deepEqual(
    [...source.matchAll(/\{ id: "(market|goods|auto|property|jobs|services|rental|business|exchange|free)"/g)].map((match) => match[1]),
    ["market", "goods", "auto", "property", "jobs", "services", "rental", "business", "exchange", "free"],
  );
  assert.match(source, /paidItems\.length < 6 \? 6 - paidItems\.length : 0/);
  assert.doesNotMatch(source, /placeholder/i);
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
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.showcase-card:nth-child\(3\) \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.listing-grid \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
});
