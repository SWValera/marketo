import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Home follows Header в†’ Search в†’ City Premium Showcase в†’ Catalog/Listings", async () => {
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

test("showcase preserves server order, pages by pairs and expands the same cards", async () => {
  const source = await readFile(new URL("components/city-premium-showcase.tsx", root), "utf8");
  assert.match(source, /premiumDemoCount\(paidItems.length\)/);
  assert.match(source, /return \[\.\.\.paidItems, \.\.\.brandedItems\]/);
  assert.match(source, /hidden=\{!visible\}/);
  assert.match(source, /useShowcaseTimeline\(Math.ceil\(items.length \/ cardsPerPage\)/);
  assert.doesNotMatch(source, /showcaseWindow|Math.random/);
  assert.match(source, /key=\{item.kind \+ "-" \+ item.id\}/);
  assert.match(source, /Date\.parse\(item\.expiresAt\) > deadlineNow/);
  assert.match(source, /paidState\.city === selectedLocation/);
  assert.match(source, /t\("showcase.total", \{ count: paid.length \}\)/);
  assert.match(source, /<LocationPicker allowAll=\{false\} \/>/);
});

test("demo tiles follow the complete 0..15 rule without filling capacity", async () => {
  const { premiumDemoCount } = await import("../lib/premium-showcase-presentation.ts");
  const expected = [2,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1];
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
  assert.match(css, /\.showcase-grid \{ display: grid; grid-template-columns: repeat\(var\(--showcase-columns, 2\), minmax\(0, 1fr\)\)/);
  assert.match(css, /\.showcase-grid-all \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /\.showcase-grid-all \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /showcase-card:nth-child\(3\)/);
  assert.match(source, /showcase-media listing-image-wrap/);
  assert.match(source, /<ShowcaseImage/);
  assert.match(css, /\.showcase-media \.listing-image \{ position: absolute; inset: 0;/);
});

test("carousel shows exactly two items per page, wraps and preserves real ordering", async () => {
  const { premiumDemoCount, premiumCarouselPage } = await import("../lib/premium-showcase-presentation.ts");
  for (let real = 0; real <= 15; real++) {
    const items = [...Array.from({length: real}, (_,i) => "real-"+i), ...Array.from({length: premiumDemoCount(real)}, (_,i) => "demo-"+i)];
    const count = Math.ceil(items.length / 2);
    const seen = [];
    for (let page = 0; page < count; page++) {
      const result = premiumCarouselPage(items, page);
      assert.equal(result.items.length, 2);
      assert.equal(result.pageIndex, page);
      seen.push(...result.items);
    }
    assert.deepEqual(seen, items);
    assert.equal(premiumCarouselPage(items, -1).pageIndex, count-1);
    assert.deepEqual(premiumCarouselPage(items, count).items, items.slice(0,2));
    assert.deepEqual(premiumCarouselPage(items, NaN).items, items.slice(0,2));
  }
  assert.deepEqual(premiumCarouselPage([], 10), {pageCount: 0, pageIndex: 0, items: []});
});


test("actual container breakpoints and dynamic pages retain every real item exactly once", async () => {
 const {premiumCardsPerPage,premiumCarouselPage,premiumDemoCount,premiumPreparedIndexes}=await import("../lib/premium-showcase-presentation.ts");
 for(const [width,size] of [[320,2],[720,2],[990,2],[1039,2],[1040,3],[1253,3],[1339,3],[1340,4],[1390,4]])assert.equal(premiumCardsPerPage(width),size);
 for(const size of [2,3,4])for(const real of [0,1,2,3,4,5,6,14,15]){
  const items=Array.from({length:real+premiumDemoCount(real)},(_,i)=>i),count=Math.ceil(items.length/size),seen=[];
  for(let page=0;page<count;page++){
   const current=premiumCarouselPage(items,page,size);assert.ok(current.items.length<=size);seen.push(...current.items);
   const warm=premiumPreparedIndexes(items.length,page,size);assert.ok(warm.size<=size*3);
   for(const offset of [-1,0,1])for(const index of premiumCarouselPage(items,page+offset,size).items)assert.ok(warm.has(index));
  }
  assert.deepEqual(seen,items);assert.equal(new Set(seen).size,items.length);
 }
});
