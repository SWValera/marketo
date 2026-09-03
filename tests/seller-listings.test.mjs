import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  listPublishedListingCardsBySeller,
  normalizeSellerListingsPage,
  resolveSellerListingsPage,
} from "../lib/data/supabase/listings.ts";

const root = new URL("../", import.meta.url);

function listingRow(index) {
  const id = String(index).padStart(2, "0");
  return {
    id: `listing-${id}`,
    slug: `offer-${id}`,
    title: `Offer ${id}`,
    price_minor: 1000,
    currency_code: "KZT",
    category_id: "category-id",
    settlement_id: "settlement-id",
    published_at: "2026-01-01T00:00:00.000Z",
    promoted_until: new Date(Date.now() + 60_000).toISOString(),
    categories: { slug: "electronics" },
    settlements: { id: "settlement-id", name_ru: "Алматы", name_kk: "Алматы" },
    listing_images: [{ storage_key: `seller/offer-${id}.jpg`, sort_order: 0 }],
  };
}

function createQueryClient(rows, {
  count = rows.length,
  countError = null,
  dataError = null,
  countResponses = [],
  dataResponses = [],
} = {}) {
  const calls = [];
  let queryCount = 0;
  let countResponseIndex = 0;
  let dataResponseIndex = 0;
  const client = {
    from(table) {
      const query = ++queryCount;
      const state = { countExact: false, head: false, range: null };
      calls.push({ query, method: "from", args: [table] });
      const request = {
        select(...args) {
          state.head = args[1]?.head === true;
          state.countExact = args[1]?.count === "exact";
          calls.push({ query, method: "select", args });
          return this;
        },
        eq(...args) { calls.push({ query, method: "eq", args }); return this; },
        not(...args) { calls.push({ query, method: "not", args }); return this; },
        is(...args) { calls.push({ query, method: "is", args }); return this; },
        order(...args) { calls.push({ query, method: "order", args }); return this; },
        limit(...args) { calls.push({ query, method: "limit", args }); return this; },
        range(...args) {
          state.range = args;
          calls.push({ query, method: "range", args });
          return this;
        },
        then(resolve, reject) {
          if (state.head) {
            const scripted = countResponses[countResponseIndex++];
            const error = scripted?.error ?? countError;
            const responseCount = scripted && Object.hasOwn(scripted, "count") ? scripted.count : count;
            return Promise.resolve({
              data: null,
              error,
              count: error ? null : responseCount,
              status: scripted?.status ?? (error ? 500 : 200),
            }).then(resolve, reject);
          }
          const scripted = dataResponses[dataResponseIndex++];
          const error = scripted?.error ?? dataError;
          if (error) {
            return Promise.resolve({
              data: null,
              error,
              count: null,
              status: scripted?.status ?? 500,
            }).then(resolve, reject);
          }
          const snapshotRows = scripted?.rows ?? rows;
          const snapshotCount = scripted && Object.hasOwn(scripted, "count") ? scripted.count : count;
          const [start, end] = state.range ?? [0, snapshotRows.length - 1];
          if (start > 0 && typeof snapshotCount === "number" && start >= snapshotCount) {
            return Promise.resolve({
              data: null,
              error: {
                code: "PGRST103",
                message: "Requested range not satisfiable",
              },
              count: null,
              status: 416,
            }).then(resolve, reject);
          }
          return Promise.resolve({
            data: snapshotRows.slice(start, end + 1),
            error: null,
            count: state.countExact ? snapshotCount : null,
            status: 206,
          }).then(resolve, reject);
        },
      };
      return request;
    },
  };
  return { calls, client };
}

function callsFor(audit, method, query) {
  return audit.calls.filter((call) => call.method === method && (query === undefined || call.query === query));
}

test("seller cards query paginates the complete public seller result with an exact total", async () => {
  const rows = Array.from({ length: 49 }, (_, index) => listingRow(index + 1));

  const first = createQueryClient(rows);
  const firstPage = await listPublishedListingCardsBySeller(first.client, "seller-id", { page: 1, pageSize: 24 });
  assert.equal(firstPage.items.length, 24);
  assert.equal(firstPage.items[0].id, "listing-01");
  assert.equal(firstPage.items.at(-1).id, "listing-24");
  assert.equal(firstPage.total, 49);
  assert.equal(firstPage.page, 1);
  assert.equal(firstPage.totalPages, 3);
  assert.equal(firstPage.nextPage, 2);
  assert.equal(firstPage.state, "ready");
  assert.deepEqual(callsFor(first, "select", 1)[0]?.args, ["id", { count: "exact", head: true }]);
  assert.deepEqual(callsFor(first, "select", 2)[0]?.args[1], { count: "exact" });
  assert.deepEqual(callsFor(first, "range", 2)[0]?.args, [0, 23]);
  assert.equal(callsFor(first, "range", 1).length, 0, "the count request must never carry a range");

  const second = createQueryClient(rows);
  const secondPage = await listPublishedListingCardsBySeller(second.client, "seller-id", { page: 2, pageSize: 24 });
  assert.equal(secondPage.items.length, 24);
  assert.equal(secondPage.items[0].id, "listing-25");
  assert.equal(secondPage.items.at(-1).id, "listing-48");
  assert.equal(secondPage.total, 49);
  assert.equal(secondPage.page, 2);
  assert.equal(secondPage.totalPages, 3);
  assert.equal(secondPage.nextPage, 3);
  assert.equal(secondPage.state, "ready");
  assert.deepEqual(callsFor(second, "range", 2)[0]?.args, [24, 47]);

  const third = createQueryClient(rows);
  const thirdPage = await listPublishedListingCardsBySeller(third.client, "seller-id", { page: 3, pageSize: 24 });
  assert.deepEqual(thirdPage.items.map((row) => row.id), ["listing-49"]);
  assert.equal(thirdPage.total, 49);
  assert.equal(thirdPage.page, 3);
  assert.equal(thirdPage.totalPages, 3);
  assert.equal(thirdPage.nextPage, null);
  assert.equal(thirdPage.state, "ready");
  assert.deepEqual(callsFor(third, "range", 2)[0]?.args, [48, 71]);

  const expectedFilters = [
    ["owner_id", "seller-id"],
    ["status", "active"],
  ];
  assert.deepEqual(callsFor(first, "eq", 1).map((call) => call.args), expectedFilters);
  assert.deepEqual(callsFor(first, "eq", 2).map((call) => call.args), expectedFilters);
  for (const query of [1, 2]) {
    assert.deepEqual(callsFor(first, "not", query)[0]?.args, ["published_at", "is", null]);
    assert.deepEqual(callsFor(first, "is", query)[0]?.args, ["deleted_at", null]);
  }
  assert.deepEqual(callsFor(first, "order", 2).map((call) => call.args), [
    ["published_at", { ascending: false }],
    ["id", { ascending: false }],
    ["sort_order", { referencedTable: "listing_images" }],
  ]);
  assert.deepEqual(callsFor(first, "limit", 2)[0]?.args, [1, { referencedTable: "listing_images" }]);
  assert.equal(firstPage.items[0].category_slug, "electronics");
  assert.equal(firstPage.items[0].primary_image_storage_key, "seller/offer-01.jpg");
  assert.equal(firstPage.items[0].promoted, true);
});

test("seller pagination handles exact page boundaries, out-of-range pages, and invalid input", async () => {
  for (const total of [24, 48]) {
    const rows = Array.from({ length: total }, (_, index) => listingRow(index + 1));
    const page = total / 24;
    const query = createQueryClient(rows);
    const result = await listPublishedListingCardsBySeller(query.client, "seller-id", { page, pageSize: 24 });
    assert.equal(result.items.length, 24);
    assert.equal(result.total, total);
    assert.equal(result.totalPages, page);
    assert.equal(result.state, "ready");
    assert.equal(result.nextPage, null, `${total} exact rows must not expose a phantom next page`);
  }

  const rows = Array.from({ length: 48 }, (_, index) => listingRow(index + 1));
  const outOfRange = createQueryClient(rows);
  const stalePage = await listPublishedListingCardsBySeller(outOfRange.client, "seller-id", { page: 3, pageSize: 24 });
  assert.deepEqual(stalePage, {
    items: [], total: 48, page: 3, totalPages: 2, nextPage: null, state: "out_of_range",
  });
  assert.equal(callsFor(outOfRange, "from").length, 1);
  assert.equal(callsFor(outOfRange, "range").length, 0);

  const huge = createQueryClient(rows);
  const hugePage = await listPublishedListingCardsBySeller(huge.client, "seller-id", {
    page: Number.MAX_SAFE_INTEGER,
    pageSize: 24,
  });
  assert.equal(hugePage.page, Number.MAX_SAFE_INTEGER);
  assert.equal(hugePage.state, "out_of_range");
  assert.equal(callsFor(huge, "from").length, 1);
  assert.equal(callsFor(huge, "range").length, 0, "a huge out-of-range page must stop after count");

  const postgrestGuard = createQueryClient(rows);
  const invalidRangeResponse = await postgrestGuard.client.from("listings").select("id").range(48, 71);
  assert.equal(invalidRangeResponse.error?.code, "PGRST103");
  assert.equal(invalidRangeResponse.status, 416);
  assert.equal(invalidRangeResponse.error?.status, undefined, "HTTP status is a top-level postgrest-js field");
});

test("seller page data and count come from one authoritative ranged snapshot", async () => {
  const grownRows = Array.from({ length: 49 }, (_, index) => listingRow(index + 1));
  const grown = createQueryClient(grownRows, { countResponses: [{ count: 25 }] });
  const grownPage = await listPublishedListingCardsBySeller(grown.client, "seller-id", { page: 2, pageSize: 24 });
  assert.equal(grownPage.items.length, 24);
  assert.equal(grownPage.total, 49);
  assert.equal(grownPage.totalPages, 3);
  assert.equal(grownPage.nextPage, 3);
  assert.deepEqual(callsFor(grown, "range", 2)[0]?.args, [24, 47]);
  assert.deepEqual(callsFor(grown, "select", 2)[0]?.args[1], { count: "exact" });

  const shrunkRows = Array.from({ length: 47 }, (_, index) => listingRow(index + 1));
  const shrunk = createQueryClient(shrunkRows, { countResponses: [{ count: 49 }] });
  const shrunkPage = await listPublishedListingCardsBySeller(shrunk.client, "seller-id", { page: 2, pageSize: 24 });
  assert.equal(shrunkPage.items.length, 23);
  assert.equal(shrunkPage.total, 47);
  assert.equal(shrunkPage.totalPages, 2);
  assert.equal(shrunkPage.nextPage, null);

  const emptied = createQueryClient([], { countResponses: [{ count: 1 }] });
  assert.deepEqual(
    await listPublishedListingCardsBySeller(emptied.client, "seller-id", { page: 1, pageSize: 24 }),
    { items: [], total: 0, page: 1, totalPages: 0, nextPage: null, state: "empty" },
  );
});

test("seller page reconciles an unsatisfied range without masking operational errors", async () => {
  const twentyFourRows = Array.from({ length: 24 }, (_, index) => listingRow(index + 1));
  const deletedLastPage = createQueryClient(twentyFourRows, {
    countResponses: [{ count: 25 }, { count: 24 }],
  });
  assert.deepEqual(
    await listPublishedListingCardsBySeller(deletedLastPage.client, "seller-id", { page: 2, pageSize: 24 }),
    { items: [], total: 24, page: 2, totalPages: 1, nextPage: null, state: "out_of_range" },
  );
  assert.equal(callsFor(deletedLastPage, "from").length, 3);
  assert.equal(callsFor(deletedLastPage, "range").length, 1);

  const twentyFiveRows = Array.from({ length: 25 }, (_, index) => listingRow(index + 1));
  const recovered = createQueryClient(twentyFiveRows, {
    countResponses: [{ count: 25 }, { count: 25 }],
    dataResponses: [
      { rows: twentyFourRows, count: 24 },
      { rows: twentyFiveRows, count: 25 },
    ],
  });
  const recoveredPage = await listPublishedListingCardsBySeller(recovered.client, "seller-id", { page: 2, pageSize: 24 });
  assert.equal(recoveredPage.state, "ready");
  assert.equal(recoveredPage.total, 25);
  assert.deepEqual(recoveredPage.items.map((row) => row.id), ["listing-25"]);
  assert.equal(callsFor(recovered, "from").length, 4);
  assert.equal(callsFor(recovered, "range").length, 2);

  const unstable = createQueryClient(twentyFiveRows, {
    countResponses: [{ count: 25 }, { count: 25 }, { count: 25 }],
    dataResponses: [
      { rows: twentyFourRows, count: 24 },
      { rows: twentyFourRows, count: 24 },
    ],
  });
  await assert.rejects(
    listPublishedListingCardsBySeller(unstable.client, "seller-id", { page: 2, pageSize: 24 }),
    /seller_listing_page_unstable/,
  );

  const recountFailure = new Error("reconciliation count failed");
  const failedReconciliation = createQueryClient(twentyFiveRows, {
    countResponses: [{ count: 25 }, { error: recountFailure }],
    dataResponses: [{ rows: twentyFourRows, count: 24 }],
  });
  await assert.rejects(
    listPublishedListingCardsBySeller(failedReconciliation.client, "seller-id", { page: 2, pageSize: 24 }),
    /reconciliation count failed/,
  );

  const nonRangeError = { code: "PGRST999", message: "data query failed" };
  const failedData = createQueryClient(twentyFiveRows, {
    countResponses: [{ count: 25 }],
    dataResponses: [{ error: nonRangeError, status: 500 }],
  });
  await assert.rejects(
    listPublishedListingCardsBySeller(failedData.client, "seller-id", { page: 2, pageSize: 24 }),
    (error) => error === nonRangeError,
  );
});

test("seller page normalization is strict, canonical, and identical across layers", async () => {
  for (const [value, expected] of [
    [undefined, { page: 1, isCanonical: true }],
    ["1", { page: 1, isCanonical: false }],
    ["2", { page: 2, isCanonical: true }],
    [Number.MAX_SAFE_INTEGER, { page: Number.MAX_SAFE_INTEGER, isCanonical: true }],
    [String(Number.MAX_SAFE_INTEGER), { page: Number.MAX_SAFE_INTEGER, isCanonical: true }],
  ]) {
    assert.deepEqual(resolveSellerListingsPage(value), expected);
    assert.equal(normalizeSellerListingsPage(value), expected.page);
  }

  for (const value of [
    "", "0", 0, "-1", -1, "2.5", 2.5, Number.NaN, Number.POSITIVE_INFINITY,
    "not-a-number", " 2 ", "1e3", String(Number.MAX_SAFE_INTEGER + 1), Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.deepEqual(resolveSellerListingsPage(value), { page: 1, isCanonical: false }, String(value));
    assert.equal(normalizeSellerListingsPage(value), 1, String(value));
  }

  assert.deepEqual(resolveSellerListingsPage(["3", "2"]), { page: 3, isCanonical: false });
  assert.deepEqual(resolveSellerListingsPage([]), { page: 1, isCanonical: false });

  const rows = Array.from({ length: 48 }, (_, index) => listingRow(index + 1));
  const normalized = createQueryClient(rows);
  const normalizedResult = await listPublishedListingCardsBySeller(normalized.client, "seller-id", {
    page: Number.MAX_SAFE_INTEGER + 1,
    pageSize: 24,
  });
  assert.equal(normalizedResult.page, 1);
  assert.equal(normalizedResult.state, "ready");
  assert.deepEqual(callsFor(normalized, "range", 2)[0]?.args, [0, 23]);
});

test("seller pagination uses permanent canonical redirects and hard 404 SEO semantics", async () => {
  const { notFound, permanentRedirect } = await import("next/navigation.js");
  const captureDigest = (action) => {
    try {
      action();
      assert.fail("the Next navigation action must interrupt rendering");
    } catch (error) {
      return error?.digest;
    }
  };

  assert.equal(
    captureDigest(() => permanentRedirect("/seller/seller-id")),
    "NEXT_REDIRECT;replace;/seller/seller-id;308;",
  );
  assert.equal(captureDigest(() => notFound()), "NEXT_HTTP_ERROR_FALLBACK;404");
  assert.deepEqual(resolveSellerListingsPage(undefined), { page: 1, isCanonical: true });
  assert.deepEqual(resolveSellerListingsPage("1"), { page: 1, isCanonical: false });
  assert.deepEqual(resolveSellerListingsPage("2"), { page: 2, isCanonical: true });
});

test("seller cards query distinguishes a real empty result from query and count failures", async () => {
  const empty = createQueryClient([], { count: 0 });
  assert.deepEqual(
    await listPublishedListingCardsBySeller(empty.client, "seller-id"),
    { items: [], total: 0, page: 1, totalPages: 0, nextPage: null, state: "empty" },
  );
  assert.equal(callsFor(empty, "from").length, 1);
  assert.equal(callsFor(empty, "range").length, 0);

  const emptySellerStalePage = createQueryClient([], { count: 0 });
  assert.deepEqual(
    await listPublishedListingCardsBySeller(emptySellerStalePage.client, "seller-id", { page: 2 }),
    { items: [], total: 0, page: 2, totalPages: 0, nextPage: null, state: "out_of_range" },
  );
  assert.equal(callsFor(emptySellerStalePage, "from").length, 1);
  assert.equal(callsFor(emptySellerStalePage, "range").length, 0);

  const failed = createQueryClient([], { countError: new Error("count failed"), count: null });
  await assert.rejects(
    listPublishedListingCardsBySeller(failed.client, "seller-id"),
    /count failed/,
  );
  assert.equal(callsFor(failed, "from").length, 1);
  assert.equal(callsFor(failed, "range").length, 0);

  const missingCount = createQueryClient([listingRow(1)], { count: null });
  await assert.rejects(
    listPublishedListingCardsBySeller(missingCount.client, "seller-id"),
    /seller_listing_count_unavailable/,
  );
  assert.equal(callsFor(missingCount, "from").length, 1);

  const dataFailure = createQueryClient([listingRow(1)], { dataError: new Error("data failed") });
  await assert.rejects(
    listPublishedListingCardsBySeller(dataFailure.client, "seller-id"),
    /data failed/,
  );
  assert.equal(callsFor(dataFailure, "from").length, 2);
  assert.deepEqual(callsFor(dataFailure, "range", 2)[0]?.args, [0, 23]);

  const inconsistent = createQueryClient([], { count: 1 });
  await assert.rejects(
    listPublishedListingCardsBySeller(inconsistent.client, "seller-id"),
    /seller_listing_page_inconsistent/,
  );

  const malformedRow = listingRow(1);
  malformedRow.categories = null;
  const malformed = createQueryClient([malformedRow], { count: 1 });
  await assert.rejects(
    listPublishedListingCardsBySeller(malformed.client, "seller-id"),
    /seller_listing_row_invalid/,
  );
});

test("seller page exposes continuation and keeps load, empty, and stale-page states distinct", async () => {
  const [page, repositories] = await Promise.all([
    readFile(new URL("app/seller/[id]/page.tsx", root), "utf8"),
    readFile(new URL("lib/data/repositories.ts", root), "utf8"),
  ]);

  assert.match(page, /searchParams: Promise<Record<string, string \| string\[\] \| undefined>>/);
  assert.match(page, /const pageResolution = resolveSellerListingsPage\(query\.page\)/);
  assert.match(page, /const hasOnlySupportedParameters = Object\.keys\(query\)\.every\(\(key\) => key === "page"\)/);
  assert.match(page, /if \(id !== sellerId \|\| !pageResolution\.isCanonical \|\| !hasOnlySupportedParameters\) \{[\s\S]*?permanentRedirect\(requestedPage === 1 \? sellerPath : `\$\{sellerPath\}\?page=\$\{requestedPage\}`\)/);
  assert.match(page, /listPublishedBySeller\(sellerId, \{ page: requestedPage, pageSize: PAGE_SIZE, locale: i18n\.locale \}\)/);
  assert.match(page, /listings\.items\.map\(\(listing\) => <ListingCard listing=\{listing\}/);
  assert.match(page, /!listings \? <EmptyState/);
  assert.match(page, /listings\.total === 0 \? <EmptyState/);
  assert.match(page, /if \(listings\?\.state === "out_of_range"\) notFound\(\)/);
  assert.doesNotMatch(page, /listings\.items\.length === 0/);
  assert.match(page, /seller\.loadErrorTitle/);
  assert.match(page, /seller\.activeCount/);
  assert.match(page, /seller\.previousPage/);
  assert.match(page, /seller\.nextPage/);
  assert.match(page, /listings\.page > 1 \|\| listings\.nextCursor/);
  assert.match(page, /listings\.page === 2 \? sellerPath : `\$\{sellerPath\}\?page=\$\{listings\.page - 1\}`/);
  assert.doesNotMatch(page, /\?page=\$\{page - 1\}/);
  assert.match(page, /href=\{`\$\{sellerPath\}\?page=\$\{listings\.nextCursor\}`\}/);
  assert.match(page, /actionHref=\{retryPath\}[\s\S]*?actionLabel=\{t\("common\.retry"\)\}/);
  assert.match(page, /listings\.total === 0[\s\S]*?seller\.empty[\s\S]*?seller\.emptyNote/);
  const errorBranch = page.indexOf("!listings ? <EmptyState");
  const emptyBranch = page.indexOf("listings.total === 0 ? <EmptyState");
  assert.ok(errorBranch >= 0 && errorBranch < emptyBranch);
  const canonicalRedirect = page.indexOf("if (id !== sellerId || !pageResolution.isCanonical || !hasOnlySupportedParameters)");
  const profileRead = page.indexOf("profileRepository.findById");
  assert.ok(canonicalRedirect >= 0 && profileRead >= 0 && canonicalRedirect < profileRead);
  assert.match(repositories, /total: page\.total/);
  assert.match(repositories, /page: page\.page/);
  assert.match(repositories, /totalPages: page\.totalPages/);
  assert.match(repositories, /state: page\.state/);
  assert.match(repositories, /nextCursor: page\.nextPage === null \? null : String\(page\.nextPage\)/);
  assert.match(repositories, /if \(!tryGetServerSupabasePublicConfig\(\)\) throw new Error\("seller_listings_unavailable"\)/);
  const sellerMethod = repositories.slice(repositories.indexOf("async listPublishedBySeller"), repositories.indexOf("export const profileRepository"));
  assert.doesNotMatch(sellerMethod, /catch\s*\{/);
  assert.doesNotMatch(sellerMethod, /return emptyPage/);
});
