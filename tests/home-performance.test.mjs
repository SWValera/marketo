import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { listActiveCategories, listHomeCategories } from "../lib/data/supabase/categories.ts";
import { resolveAuthenticatedUserId } from "../lib/data/supabase/authenticated-user.ts";
import { fetchHomeListingPreview } from "../lib/data/home-listing-preview.ts";
import { readListingAttributePreview } from "../lib/data/listing-filter-preview.ts";
import { listPublishedListingCards, listPublishedListingPreview } from "../lib/data/supabase/listings.ts";

const root = new URL("../", import.meta.url);

function listingRow(index) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    slug: `listing-${index}`,
    title: `Listing ${index}`,
    price_minor: index,
    currency_code: "KZT",
    category_id: "10000000-0000-4000-8000-000000000001",
    category_slug: "transport",
    settlement_id: "20000000-0000-4000-8000-000000000001",
    location_name_ru: "Алматы",
    location_name_kk: "Алматы",
    published_at: "2026-09-04T00:00:00.000Z",
    promoted: false,
    primary_image_storage_key: null,
  };
}

function listingSummary(index = 1) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    slug: `listing-${index}`,
    title: `Listing ${index}`,
    priceLabel: `${index} ₸`,
    priceAmount: index,
    locationLabel: "Алматы",
    publishedLabel: "4 сент. 2026 г.",
    imageUrl: null,
    categorySlug: "transport",
    cityId: "20000000-0000-4000-8000-000000000001",
    promoted: false,
  };
}

function previewClient(rows, responseError = null) {
  const calls = [];
  const request = {
    order(column, options) {
      calls.push({ operation: "order", column, options });
      return this;
    },
    async range(from, to) {
      calls.push({ operation: "range", from, to });
      return responseError
        ? { data: null, error: responseError }
        : { data: rows.slice(from, to + 1), error: null };
    },
  };
  return {
    calls,
    client: {
      rpc(name, args, options) {
        calls.push({ operation: "rpc", name, args, options });
        return request;
      },
      from(table) {
        calls.push({ operation: "from", table });
        throw new Error("attribute queries are forbidden in the Home preview");
      },
    },
  };
}

function catalogPageOneClient(response) {
  const calls = [];
  const request = {
    order(column, options) {
      calls.push({ operation: "order", column, options });
      return this;
    },
    async range(from, to) {
      calls.push({ operation: "range", from, to });
      return response;
    },
  };
  return {
    calls,
    client: {
      rpc(name, args, options) {
        calls.push({ operation: "rpc", name, args, options });
        return request;
      },
    },
  };
}

test("Home listing preview is one bounded data RPC without exact count or attribute hydration", async () => {
  const fixture = previewClient(Array.from({ length: 20 }, (_, index) => listingRow(index + 1)));
  const rows = await listPublishedListingPreview(fixture.client, { limit: 12 });

  assert.equal(rows.length, 12);
  assert.deepEqual(fixture.calls.filter((call) => call.operation === "rpc").map((call) => ({
    name: call.name,
    options: call.options,
  })), [{ name: "search_catalog_listing_cards", options: undefined }]);
  assert.deepEqual(fixture.calls.filter((call) => call.operation === "range"), [
    { operation: "range", from: 0, to: 11 },
  ]);
  assert.equal(fixture.calls.some((call) => call.operation === "from"), false);
  assert.equal(fixture.calls.some((call) => call.options?.count === "exact" || call.options?.head === true), false);
});

test("Home listing preview remains bounded and propagates data failures", async () => {
  const bounded = previewClient(Array.from({ length: 40 }, (_, index) => listingRow(index + 1)));
  const rows = await listPublishedListingPreview(bounded.client, { limit: Number.MAX_SAFE_INTEGER });
  assert.equal(rows.length, 24);
  assert.deepEqual(bounded.calls.find((call) => call.operation === "range"), {
    operation: "range",
    from: 0,
    to: 23,
  });

  const expected = new Error("preview unavailable");
  const failed = previewClient([], expected);
  await assert.rejects(listPublishedListingPreview(failed.client), (error) => error === expected);
});

test("catalog page one combines exact count and data in one RPC", async () => {
  const rows = [listingRow(1), listingRow(2)];
  const fixture = catalogPageOneClient({ data: rows, error: null, count: rows.length });

  const page = await listPublishedListingCards(fixture.client, { page: 1, limit: 60 });
  assert.equal(page.total, 2);
  assert.equal(page.state, "ready");
  assert.deepEqual(page.items, rows);
  assert.deepEqual(fixture.calls.filter((call) => call.operation === "rpc").map((call) => call.options), [
    { count: "exact" },
  ]);
  assert.deepEqual(fixture.calls.filter((call) => call.operation === "range"), [
    { operation: "range", from: 0, to: 59 },
  ]);
});

test("catalog page-one fast path handles empty, continued and malformed count responses", async () => {
  const emptyFixture = catalogPageOneClient({ data: [], error: null, count: 0 });
  const empty = await listPublishedListingCards(emptyFixture.client, { page: 1, limit: 24 });
  assert.deepEqual(empty, {
    items: [], total: 0, page: 1, totalPages: 0, nextPage: null, state: "empty",
  });
  assert.equal(emptyFixture.calls.filter((call) => call.operation === "rpc").length, 1);

  const continuedRows = Array.from({ length: 60 }, (_, index) => listingRow(index + 1));
  const continuedFixture = catalogPageOneClient({ data: continuedRows, error: null, count: 61 });
  const continued = await listPublishedListingCards(continuedFixture.client, { page: 1, limit: 60 });
  assert.equal(continued.totalPages, 2);
  assert.equal(continued.nextPage, 2);
  assert.equal(continued.items.length, 60);

  for (const response of [
    { data: [], error: null, count: null },
    { data: [], error: null, count: -1 },
    { data: null, error: null, count: 0 },
    { data: [listingRow(1)], error: null, count: 0 },
  ]) {
    const malformed = catalogPageOneClient(response);
    await assert.rejects(listPublishedListingCards(malformed.client, { page: 1 }));
  }
});

test("browser Home preview is request-driven, no-store and rejects malformed/error responses", async () => {
  const calls = [];
  const expected = listingSummary();
  const items = await fetchHomeListingPreview(undefined, async (input, init) => {
    calls.push({ input, init });
    return Response.json({ items: [expected] });
  });
  assert.deepEqual(items, [expected]);
  assert.equal(calls[0].input, "/api/listings?view=home-preview");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.credentials, "same-origin");

  await assert.rejects(fetchHomeListingPreview(undefined, async () => Response.json({ error: "unavailable" }, { status: 503 })), /home_listing_preview_failed/);
  await assert.rejects(fetchHomeListingPreview(undefined, async () => Response.json({ items: [{ id: "incomplete" }] })), /home_listing_preview_failed/);
});

test("Home category query starts both bounded hierarchy pages without a sequential waterfall", async () => {
  const rootRows = [
    { id: "root-a", parent_id: null, sort_order: 1 },
    { id: "root-b", parent_id: null, sort_order: 2 },
  ];
  const childRows = [
    { id: "child-a", parent_id: "root-a", sort_order: 1 },
    { id: "grandchild-a", parent_id: "child-a", sort_order: 1 },
    { id: "child-b", parent_id: "root-b", sort_order: 1 },
  ];
  const calls = [];
  let queryNumber = 0;
  const client = {
    from(table) {
      const currentQuery = queryNumber++;
      calls.push({ operation: "from", table, currentQuery });
      const result = currentQuery === 0 ? rootRows : currentQuery === 1 ? childRows : [];
      const builder = {
        select(columns) {
          calls.push({ operation: "select", columns, currentQuery });
          return this;
        },
        eq(column, value) {
          calls.push({ operation: "eq", column, value, currentQuery });
          return this;
        },
        is(column, value) {
          calls.push({ operation: "is", column, value, currentQuery });
          return this;
        },
        order() {
          return this;
        },
        async range(from, to) {
          calls.push({ operation: "range", from, to, currentQuery });
          if (currentQuery === 2) {
            return { data: null, error: { code: "PGRST103", message: "Requested range not satisfiable" } };
          }
          return { data: result, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: result, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };

  const rows = await listHomeCategories(client);
  assert.deepEqual(rows, [
    { ...rootRows[0], child_count: 2 },
    { ...rootRows[1], child_count: 1 },
  ]);
  assert.equal(calls.filter((call) => call.operation === "range").length, 2);
  assert.equal(calls.some((call) => call.operation === "range" && call.currentQuery === 0), false);
  assert.deepEqual(calls.filter((call) => call.operation === "range").map(({ from, to }) => ({ from, to })), [
    { from: 0, to: 999 },
    { from: 1000, to: 1999 },
  ]);
  assert.deepEqual(calls.filter((call) => call.operation === "select" && call.currentQuery !== 0).map((call) => call.columns), ["id, parent_id", "id, parent_id"]);
});

test("full category reference pages are requested concurrently and continue in bounded waves", async () => {
  const pending = [];
  const client = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        range(from, to) {
          return new Promise((resolve) => pending.push({ from, to, resolve }));
        },
      };
    },
  };

  const loading = listActiveCategories(client);
  await Promise.resolve();
  assert.equal(pending.length, 2, "both Supabase pages must start before either resolves");
  assert.deepEqual(pending.map(({ from, to }) => ({ from, to })), [
    { from: 0, to: 999 },
    { from: 1000, to: 1999 },
  ]);
  pending[0].resolve({ data: [{ id: "root" }], error: null });
  pending[1].resolve({ data: null, error: { code: "PGRST103", message: "Requested range not satisfiable" } });
  assert.deepEqual(await loading, [{ id: "root" }]);

  const ranges = [];
  const continuedClient = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        async range(from, to) {
          ranges.push({ from, to });
          if (from === 3_000) {
            return { data: null, error: { code: "PGRST103", message: "Requested range not satisfiable" } };
          }
          const length = from < 2_000 ? 1_000 : from === 2_000 ? 1 : 0;
          return {
            data: Array.from({ length }, (_, index) => ({ id: `${from + index}` })),
            error: null,
          };
        },
      };
    },
  };
  const continued = await listActiveCategories(continuedClient);
  assert.equal(continued.length, 2_001);
  assert.deepEqual(ranges, [
    { from: 0, to: 999 },
    { from: 1_000, to: 1_999 },
    { from: 2_000, to: 2_999 },
    { from: 3_000, to: 3_999 },
  ]);

  const failedClient = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        async range(from) {
          return from === 0
            ? { data: [], error: { code: "08006", message: "connection failure" } }
            : { data: null, error: { code: "PGRST103", message: "Requested range not satisfiable" } };
        },
      };
    },
  };
  await assert.rejects(listActiveCategories(failedClient), (error) => (
    error?.code === "08006" && error?.message === "connection failure"
  ));
});

test("missing card attributes remain visible until authoritative server filter navigation", () => {
  assert.deepEqual(readListingAttributePreview(undefined, "brand"), { known: false });
  assert.deepEqual(readListingAttributePreview({}, "brand"), { known: false });
  assert.deepEqual(readListingAttributePreview({ brand: "toyota" }, "brand"), { known: true, value: "toyota" });
  assert.deepEqual(readListingAttributePreview({ electric: false }, "electric"), { known: true, value: false });
  assert.deepEqual(readListingAttributePreview({ year: 0 }, "year"), { known: true, value: 0 });
});

test("Home initial render omits listing I/O and loads a bounded preview only after tab intent", async () => {
  const [home, tabs, route, repositories, referenceServer] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("components/home-marketplace-tabs.tsx", root), "utf8"),
    readFile(new URL("app/api/listings/route.ts", root), "utf8"),
    readFile(new URL("lib/data/repositories.ts", root), "utf8"),
    readFile(new URL("lib/reference-data/server.ts", root), "utf8"),
  ]);

  assert.match(home, /<Suspense\s+fallback=\{<HomeCatalogFallback\s+locale=\{locale\}\s*\/>\}/);
  assert.match(home, /getHomeCategoryReferences\(\)/);
  assert.doesNotMatch(home, /getCategoryReferences\(\)/);
  assert.doesNotMatch(home, /listingRepository\.(?:preview|list)\(/);
  assert.match(home, /<HomeMarketplaceTabs\s+catalog=\{catalogPanel\}\s*\/>/);
  assert.match(tabs, /next === "listings"[\s\S]*?loadListings\(\)/);
  assert.match(tabs, /fetchHomeListingPreview\(controller\.signal\)/);
  assert.match(tabs, /listingState === "error"/);
  assert.match(tabs, /listingState === "ready" && listings\.length === 0/);
  assert.match(route, /searchParams\.get\("view"\) === "home-preview"/);
  assert.match(route, /listingRepository\.preview\(\{ locale, limit: 12 \}\)/);
  assert.match(referenceServer, /getHomeCategoryReferences[\s\S]*?listHomeCategories/);
  assert.match(referenceServer, /getCategoryReferences[\s\S]*?listActiveCategories/);
  assert.match(repositories, /async\s+preview[\s\S]*?listPublishedListingPreview[\s\S]*?mapCatalogListingSummary/);

  const previewMethod = repositories.match(/async\s+preview[\s\S]*?\n\s*},\n\s*async\s+list/)?.[0] ?? "";
  assert.doesNotMatch(previewMethod, /hydrateAttributes|getListingAttributeRecords/);
  const listMethod = repositories.match(/async\s+list[\s\S]*?\n\s*},\n\s*async\s+favorites/)?.[0] ?? "";
  assert.match(listMethod, /listPublishedListingCards/);
  assert.doesNotMatch(listMethod, /hydrateAttributes|getListingAttributeRecords/);
  const catalogClient = await readFile(new URL("components/catalog-client.tsx", root), "utf8");
  assert.match(catalogClient, /readListingAttributePreview\(item\.attributes, attributeKey\)/);
});

test("listing cards defer the Supabase browser SDK until favorite state is requested", async () => {
  const store = await readFile(new URL("components/favorite-store.ts", root), "utf8");
  assert.doesNotMatch(store, /^import\s+\{[^\n]+\}\s+from\s+"@\/lib\/(?:supabase\/browser|data\/supabase\/favorites)"/m);
  assert.match(store, /import\("@\/lib\/supabase\/browser"\)/);
  assert.match(store, /import\("@\/lib\/data\/supabase\/favorites"\)/);
  assert.match(store, /const \{ getSupabaseBrowserClient, listFavoriteListingIds \} = await loadFavoriteDependencies\(\)/);
  assert.match(store, /\.catch\(\(error\) => \{\s*dependenciesPromise = null;\s*throw error;/);
});

test("authenticated profile listings reuse the verified Auth identity without a second getUser call", async () => {
  const [profile, myListings] = await Promise.all([
    readFile(new URL("app/profile/page.tsx", root), "utf8"),
    readFile(new URL("lib/data/supabase/my-listings.ts", root), "utf8"),
  ]);
  assert.match(profile, /authenticatedUserId:\s*authContext\.user\.id/);
  assert.match(myListings, /currentUserId\(client, options\.authenticatedUserId\)/);
  assert.match(myListings, /\.eq\("owner_id", userId\)/);

  let getUserCalls = 0;
  const client = {
    auth: {
      async getUser() {
        getUserCalls += 1;
        throw new Error("duplicate Auth lookup");
      },
    },
  };

  const userId = await resolveAuthenticatedUserId(client, "verified-user-id");
  assert.equal(getUserCalls, 0);
  assert.equal(userId, "verified-user-id");
});
