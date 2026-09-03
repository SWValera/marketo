import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { parseCatalogSearchParams } from "../lib/catalog-search-params.ts";
import { normalizePositivePage, pageWindow } from "../lib/data/pagination.ts";
import { isValidIsoCalendarDate } from "../lib/publish/contract.ts";
import {
  createPublishRecovery,
  readPublishRecovery,
  removePublishRecovery,
  savePublishRecovery,
} from "../lib/publish/recovery.ts";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

async function filesBelow(path) {
  const directory = new URL(`${path}/`, root);
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const child = `${path}/${entry.name}`;
    return entry.isDirectory() ? filesBelow(child) : [child];
  }));
  return nested.flat();
}

test("catalog URL input has one bounded server-authoritative representation", () => {
  const city = "01234567-89ab-4cde-8fab-0123456789ab";
  assert.deepEqual(parseCatalogSearchParams({
    city: city.toUpperCase(),
    price_min: "₸ 12 345",
    price_max: "90000000000",
    page: "2",
    sort: "cheap",
  }), {
    query: "",
    categorySlug: "",
    cityId: city,
    minPrice: "12345",
    maxPrice: "90000000000",
    sort: "cheap",
    page: 2,
    dynamicFilters: {},
  });
  assert.equal(parseCatalogSearchParams({ city: "almaty" }).cityId, undefined);
  assert.equal(parseCatalogSearchParams({ price_max: "90000000001" }).maxPrice, "");
  assert.equal(parseCatalogSearchParams({ page: String(Number.MAX_SAFE_INTEGER + 1) }).page, 1);
});

test("numbered pagination never constructs an unsafe or out-of-range offset", () => {
  assert.equal(normalizePositivePage("2"), 2);
  for (const invalid of ["0", "-1", "2.5", "1e6", String(Number.MAX_SAFE_INTEGER + 1)]) {
    assert.equal(normalizePositivePage(invalid), 1);
  }
  assert.deepEqual(pageWindow(25, 2, 12), {
    totalPages: 3,
    outOfRange: false,
    offset: 12,
    rangeEnd: 23,
  });
  assert.deepEqual(pageWindow(25, Number.MAX_SAFE_INTEGER, 12), {
    totalPages: 3,
    outOfRange: true,
    offset: null,
    rangeEnd: null,
  });
});

test("publish recovery fails safely when browser storage is unavailable", () => {
  const userId = "01234567-89ab-4cde-8fab-0123456789ab";
  const storage = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("quota"); },
    removeItem() { throw new Error("denied"); },
  };
  const recovery = createPublishRecovery(userId, {
    categorySlug: "cars",
    cityId: userId,
    title: "Example",
    description: "Example listing",
    priceDigits: "1000",
    attributes: {},
    contactName: "Seller",
    contactPhone: "+77000000000",
    allowMessages: false,
  }, userId, 1_000);
  assert.deepEqual(readPublishRecovery(storage, userId, 1_000), { status: "unavailable", draft: null });
  assert.equal(savePublishRecovery(storage, recovery), false);
  assert.equal(removePublishRecovery(storage, userId), false);
  assert.deepEqual(readPublishRecovery(null, userId, 1_000), { status: "unavailable", draft: null });
});

test("publish dates reject calendar rollover instead of trusting Date parsing", () => {
  assert.equal(isValidIsoCalendarDate("2024-02-29"), true);
  assert.equal(isValidIsoCalendarDate("2023-02-29"), false);
  assert.equal(isValidIsoCalendarDate("2026-02-31"), false);
  assert.equal(isValidIsoCalendarDate("2026-13-01"), false);
});

test("catalog, listing, seller, profile and moderation pages keep authoritative error and canonical states", async () => {
  const [search, category, catalog, listing, seller, profile, admin, repositories] = await Promise.all([
    source("app/search/page.tsx"),
    source("app/category/[slug]/page.tsx"),
    source("components/catalog-client.tsx"),
    source("app/listing/[slug]/page.tsx"),
    source("app/seller/[id]/page.tsx"),
    source("app/profile/page.tsx"),
    source("app/admin/page.tsx"),
    source("lib/data/repositories.ts"),
  ]);
  assert.match(search, /reference\.categoriesUnavailableTitle/);
  assert.match(search, /title=\{t\("state\.error"\)\}/);
  assert.match(category, /isCategoryWithin/);
  assert.match(category, /title=\{t\("state\.error"\)\}/);
  assert.match(catalog, /a\.priceAmount === null/);
  assert.match(catalog, /params\.set\("city", storedLocation\)/);
  assert.match(listing, /permanentRedirect\(canonicalPath\)/);
  assert.match(seller, /canonicalizeRouteUuid/);
  assert.doesNotMatch(seller, /messages\/new\?seller=/);
  assert.match(profile, /listings\.state === "out_of_range"/);
  assert.match(profile, /listings\.page > 1/);
  assert.match(admin, /queue\.state === "out_of_range"/);
  assert.match(admin, /queue\.page > 1/);
  assert.match(repositories, /class PublicListingDataError/);
  assert.doesNotMatch(repositories, /catch\(\(\) => emptyPage/);
});

test("unsupported product actions are not exposed as working controls", async () => {
  const [seller, actions, newConversation, help] = await Promise.all([
    source("app/seller/[id]/page.tsx"),
    source("components/listing-actions.tsx"),
    source("app/messages/new/page.tsx"),
    source("app/help/page.tsx"),
  ]);
  assert.doesNotMatch(seller, /messages\/new\?seller=/);
  assert.doesNotMatch(actions, /messages\/new\?listing=/);
  assert.match(newConversation, /messages\.startUnavailableTitle/);
  assert.doesNotMatch(newConversation, /getOrCreateListingConversation/);
  assert.doesNotMatch(help, /href="\/help"/);
});

test("upload copy states the validator's intentionally narrow supported subset", async () => {
  const [form, messages] = await Promise.all([
    source("components/publish-form.tsx"),
    source("lib/i18n/messages.ts"),
  ]);
  assert.match(form, /accept="image\/jpeg,image\/png"/);
  assert.match(messages, /baseline JPEG \(Huffman\) или неиндексированный PNG/);
  assert.match(messages, /baseline JPEG с Huffman-кодированием либо неиндексированный PNG без дополнительных метаданных/);
  assert.match(messages, /baseline JPEG \(Huffman\) немесе индекстелмеген PNG/);
});

test("every rendered main element is a valid target for the global skip link", async () => {
  const files = (await Promise.all([filesBelow("app"), filesBelow("components")]))
    .flat()
    .filter((path) => path.endsWith(".tsx"));
  for (const path of files) {
    const text = await source(path);
    const tags = text.match(/<main\b[^>]*>/g) ?? [];
    for (const tag of tags) {
      assert.match(tag, /\bid="main-content"/, `${path}: ${tag}`);
      assert.match(tag, /\btabIndex=\{-1\}/, `${path}: ${tag}`);
    }
  }
});

test("interactive overlays and tabs expose focus and keyboard contracts", async () => {
  const [modal, header, catalog, auth, marketplace] = await Promise.all([
    source("lib/browser/modal.ts"),
    source("components/header.tsx"),
    source("components/catalog-client.tsx"),
    source("components/auth-form.tsx"),
    source("components/home-marketplace-tabs.tsx"),
  ]);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /event\.key !== "Tab"/);
  assert.match(modal, /previousFocus\?\.focus/);
  assert.match(header, /aria-controls="marketo-mobile-menu"/);
  assert.match(catalog, /role=\{filtersOpen \? "dialog" : undefined\}/);
  assert.match(auth, /ArrowRight/);
  assert.match(marketplace, /aria-controls/);
});
