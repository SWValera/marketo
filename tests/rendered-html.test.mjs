import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://reference-test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_reference_test";

const ids = {
  country: "00000000-0000-4000-8000-000000000001",
  astanaRegion: "00000000-0000-4000-8000-000000000002",
  northRegion: "00000000-0000-4000-8000-000000000003",
  astana: "00000000-0000-4000-8000-000000000004",
  petropavl: "00000000-0000-4000-8000-000000000005",
  transport: "10000000-0000-4000-8000-000000000001",
  cars: "10000000-0000-4000-8000-000000000002",
  jobs: "10000000-0000-4000-8000-000000000003",
  services: "10000000-0000-4000-8000-000000000004",
  electronics: "10000000-0000-4000-8000-000000000005",
  carBrand: "20000000-0000-4000-8000-000000000001",
  carBrandToyota: "30000000-0000-4000-8000-000000000001",
  jobEmployment: "20000000-0000-4000-8000-000000000002",
  serviceVisit: "20000000-0000-4000-8000-000000000003",
  seller: "5abcdef0-0000-4000-8000-000000000001",
  emptySeller: "5abcdef0-0000-4000-8000-000000000002",
  missingSeller: "5abcdef0-0000-4000-8000-000000000003",
  errorSeller: "5abcdef0-0000-4000-8000-000000000004",
};

const sellerListingRows = Array.from({ length: 49 }, (_, index) => ({
  id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  owner_id: ids.seller,
  slug: `seller-offer-${index + 1}`,
  title: `Seller offer ${index + 1}`,
  price_minor: 1000 + index,
  currency_code: "KZT",
  category_id: ids.electronics,
  settlement_id: ids.astana,
  published_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 49 - index)).toISOString(),
  promoted_until: null,
  status: "active",
  deleted_at: null,
  categories: { slug: "electronics" },
  settlements: { id: ids.astana, name_ru: "Астана", name_kk: "Астана" },
  listing_images: [{ storage_key: `seller/offer-${index + 1}.jpg`, sort_order: 0 }],
}));

const referenceTables = {
  countries: [{ id: ids.country, code: "KZ", slug: "kazakhstan", name_ru: "Казахстан", name_kk: "Қазақстан", currency_code: "KZT", currency_symbol: "₸", currency_exponent: 0, phone_code: "+7", sort_order: 10 }],
  regions: [
    { id: ids.astanaRegion, country_id: ids.country, code: "astana", slug: "astana", name_ru: "Астана", name_kk: "Астана", kind: "republican_city", sort_order: 10 },
    { id: ids.northRegion, country_id: ids.country, code: "north-kazakhstan", slug: "north-kazakhstan", name_ru: "Северо-Казахстанская область", name_kk: "Солтүстік Қазақстан облысы", kind: "region", sort_order: 20 },
  ],
  settlements: [
    { id: ids.astana, region_id: ids.astanaRegion, parent_id: null, kato_code: null, slug: "astana", name_ru: "Астана", name_kk: "Астана", kind: "city", sort_order: 10 },
    { id: ids.petropavl, region_id: ids.northRegion, parent_id: null, kato_code: null, slug: "petropavl", name_ru: "Петропавловск", name_kk: "Петропавл", kind: "city", sort_order: 10 },
  ],
  categories: [
    { id: ids.transport, parent_id: null, slug: "transport", name_ru: "Транспорт", name_kk: "Көлік", icon_key: "car", tone_key: "blue", search_placeholder_ru: "Например, Toyota Camry", search_placeholder_kk: "Мысалы, Toyota Camry", title_placeholder_ru: null, title_placeholder_kk: null, description_hint_ru: null, description_hint_kk: null, price_mode: "price", sort_order: 10 },
    { id: ids.cars, parent_id: ids.transport, slug: "cars", name_ru: "Легковые автомобили", name_kk: "Жеңіл автомобильдер", icon_key: "car", tone_key: "blue", search_placeholder_ru: "Марка или модель автомобиля", search_placeholder_kk: "Автомобиль маркасы немесе моделі", title_placeholder_ru: null, title_placeholder_kk: null, description_hint_ru: null, description_hint_kk: null, price_mode: "price", sort_order: 10 },
    { id: ids.jobs, parent_id: null, slug: "jobs", name_ru: "Работа", name_kk: "Жұмыс", icon_key: "briefcase", tone_key: "amber", search_placeholder_ru: "Например, водитель, продавец", search_placeholder_kk: "Мысалы, жүргізуші, сатушы", title_placeholder_ru: null, title_placeholder_kk: null, description_hint_ru: null, description_hint_kk: null, price_mode: "salary", sort_order: 20 },
    { id: ids.services, parent_id: null, slug: "services", name_ru: "Услуги", name_kk: "Қызметтер", icon_key: "wrench", tone_key: "green", search_placeholder_ru: "Например, ремонт квартир", search_placeholder_kk: "Мысалы, пәтер жөндеу", title_placeholder_ru: null, title_placeholder_kk: null, description_hint_ru: null, description_hint_kk: null, price_mode: "price", sort_order: 30 },
    { id: ids.electronics, parent_id: null, slug: "electronics", name_ru: "Электроника", name_kk: "Электроника", icon_key: "laptop", tone_key: "violet", search_placeholder_ru: "Например, iPhone 15", search_placeholder_kk: "Мысалы, iPhone 15", title_placeholder_ru: null, title_placeholder_kk: null, description_hint_ru: null, description_hint_kk: null, price_mode: "price", sort_order: 40 },
  ],
  category_attributes: [
    { id: ids.carBrand, category_id: ids.cars, key: "brand", label_ru: "Марка", label_kk: "Маркасы", data_type: "select", unit_ru: null, unit_kk: null, is_required: true, is_filterable: true, is_searchable: false, inherits_to_children: false, validation: {}, filter_mode: "exact", options_load_mode: "eager", depends_on_key: null, is_visible: true, sort_order: 10 },
    { id: ids.jobEmployment, category_id: ids.jobs, key: "employment", label_ru: "Тип занятости", label_kk: "Жұмыспен қамту түрі", data_type: "select", unit_ru: null, unit_kk: null, is_required: true, is_filterable: true, is_searchable: false, inherits_to_children: false, validation: {}, filter_mode: "exact", options_load_mode: "eager", depends_on_key: null, is_visible: true, sort_order: 10 },
    { id: ids.serviceVisit, category_id: ids.services, key: "visit", label_ru: "Выезд к клиенту", label_kk: "Клиентке бару", data_type: "boolean", unit_ru: null, unit_kk: null, is_required: false, is_filterable: true, is_searchable: false, inherits_to_children: false, validation: {}, filter_mode: "exact", options_load_mode: "eager", depends_on_key: null, is_visible: true, sort_order: 10 },
  ],
  category_attribute_options: [
    { id: ids.carBrandToyota, attribute_id: ids.carBrand, parent_option_id: null, value: "toyota", label_ru: "Toyota", label_kk: "Toyota", sort_order: 10 },
  ],
  seller_profiles: [
    { id: ids.seller, display_name: "SEO Seller", avatar_path: `avatars/${ids.seller}/profile.webp`, settlement_id: ids.astana, bio: null, verified_at: null },
    { id: ids.emptySeller, display_name: "Empty Seller", avatar_path: null, settlement_id: ids.astana, bio: null, verified_at: null },
  ],
  listings: sellerListingRows,
};

for (let index = referenceTables.categories.length; index < 1356; index += 1) {
  referenceTables.categories.push({
    id: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    parent_id: ids.electronics,
    slug: `synthetic-category-${index}`,
    name_ru: `Тестовая категория ${index}`,
    name_kk: `Сынақ санаты ${index}`,
    icon_key: null,
    tone_key: null,
    search_placeholder_ru: null,
    search_placeholder_kk: null,
    title_placeholder_ru: null,
    title_placeholder_kk: null,
    description_hint_ru: null,
    description_hint_kk: null,
    price_mode: "price",
    sort_order: index,
  });
}

const originalFetch = globalThis.fetch;
const supabaseRequestCounts = new Map();
const sellerListingRangeRequests = [];
const mediaGetRequests = [];
let categoryResponseGate = null;
const avatarBytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
globalThis.fetch = async (input, init) => {
  const requestUrl = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (requestUrl.hostname !== "reference-test.supabase.co") return originalFetch(input, init);
  supabaseRequestCounts.set(requestUrl.pathname, (supabaseRequestCounts.get(requestUrl.pathname) ?? 0) + 1);
  const table = requestUrl.pathname.split("/").at(-1);
  if (table === "categories" && categoryResponseGate) await categoryResponseGate;
  if (table === "seller_profiles" && requestUrl.searchParams.get("id") === `eq.${ids.errorSeller}`) {
    return new Response(JSON.stringify({
      code: "08006",
      message: "forced seller profile query failure",
      details: null,
      hint: null,
    }), { status: 503, headers: { "content-type": "application/json" } });
  }
  let rows = structuredClone(referenceTables[table] ?? []);
  for (const column of ["id", "owner_id", "status", "slug"]) {
    const filter = requestUrl.searchParams.get(column);
    if (filter?.startsWith("eq.")) rows = rows.filter((row) => row[column] === filter.slice(3));
  }
  const parentId = requestUrl.searchParams.get("parent_id");
  if (parentId === "is.null") rows = rows.filter((row) => row.parent_id === null);
  if (parentId?.startsWith("in.(")) {
    const allowed = new Set(parentId.slice(4, -1).split(","));
    rows = rows.filter((row) => allowed.has(row.parent_id));
  }
  const categoryId = requestUrl.searchParams.get("category_id");
  if (categoryId?.startsWith("eq.")) rows = rows.filter((row) => row.category_id === categoryId.slice(3));
  const attributeIds = requestUrl.searchParams.get("attribute_id");
  if (attributeIds?.startsWith("in.(")) {
    const allowed = new Set(attributeIds.slice(4, -1).split(","));
    rows = rows.filter((row) => allowed.has(row.attribute_id));
  }
  const requestMethod = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const requestHeaders = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => requestHeaders.set(key, value));
  const range = requestHeaders.get("range");
  const total = rows.length;
  if (requestMethod === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { "content-range": total === 0 ? "*/0" : `0-${total - 1}/${total}` },
    });
  }
  if (requestUrl.searchParams.has("limit")) {
    const offset = Number(requestUrl.searchParams.get("offset") ?? 0);
    const limit = Number(requestUrl.searchParams.get("limit"));
    if (table === "listings") {
      sellerListingRangeRequests.push({ offset, limit, url: requestUrl.href });
      if (offset > 0 && offset >= total) {
        return new Response(JSON.stringify({
          code: "PGRST103",
          message: "Requested range not satisfiable",
        }), {
          status: 416,
          headers: { "content-type": "application/json", "content-range": `*/${total}` },
        });
      }
    }
    rows = rows.slice(offset, offset + limit);
  }
  const rangeMatch = range?.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const offset = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (table === "listings") sellerListingRangeRequests.push({ offset, limit: end - offset + 1, url: requestUrl.href });
    rows = rows.slice(offset, end + 1);
  }
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { "content-type": "application/json", "content-range": total === 0 ? "*/0" : `0-${Math.max(0, rows.length - 1)}/${total}` },
  });
};

globalThis.__MARKETO_CLOUDFLARE_ENV__ = {
  MARKETO_MEDIA: {
    async get(storageKey) {
      mediaGetRequests.push(storageKey);
      if (storageKey !== referenceTables.seller_profiles[0].avatar_path) return null;
      return {
        body: avatarBytes.slice(),
        httpEtag: '"seller-avatar-test"',
        writeHttpMetadata(headers) {
          headers.set("content-type", "application/octet-stream");
        },
      };
    },
  },
};

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function render(pathname, locale = "ru") {
  const response = await worker.fetch(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html", cookie: `marketo-locale=${locale}` } }), env, ctx);
  return { response, html: await response.text() };
}

async function renderRsc(pathname, locale = "ru") {
  const url = new URL(`http://localhost${pathname}`);
  url.pathname = url.pathname === "/" ? "/.rsc" : `${url.pathname}.rsc`;
  url.searchParams.set("_rsc", "");
  const response = await worker.fetch(new Request(url, {
    headers: { accept: "text/x-component", cookie: `marketo-locale=${locale}`, rsc: "1" },
  }), env, ctx);
  return { response, body: await response.arrayBuffer() };
}

function hasRobotsNoindex(html) {
  return /<meta(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["'][^"']*noindex)[^>]*>/i.test(html);
}

test("Home streams its shell before bounded category data resolves and performs no listing RPC", async () => {
  let releaseCategories;
  categoryResponseGate = new Promise((resolve) => {
    releaseCategories = resolve;
  });
  const listingRpcPath = "/rest/v1/rpc/search_catalog_listing_cards";
  const listingCallsBefore = supabaseRequestCounts.get(listingRpcPath) ?? 0;
  const categoryCallsBefore = supabaseRequestCounts.get("/rest/v1/categories") ?? 0;
  let reader;
  try {
    const response = await worker.fetch(new Request("http://localhost/", {
      headers: { accept: "text/html", cookie: "marketo-locale=ru" },
    }), env, ctx);
    assert.equal(response.status, 200);
    reader = response.body.getReader();
    const first = await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Home shell did not stream before category data")), 2_000)),
    ]);
    assert.equal(first.done, false);
    assert.ok(first.value.byteLength > 0);
  } finally {
    releaseCategories?.();
    categoryResponseGate = null;
  }
  while (!(await reader.read()).done) {
    // Drain the response so the bounded category queries complete before the next test.
  }
  assert.equal(supabaseRequestCounts.get(listingRpcPath) ?? 0, listingCallsBefore);
  assert.equal((supabaseRequestCounts.get("/rest/v1/categories") ?? 0) - categoryCallsBefore, 3,
    "the 1,352 immediate-child fixture requires two deterministic 1,000-row pages after the root query");
});

test("core routes render through the production worker", async () => {
  const routes = [
    ["/", "Лучшее рядом с вами"], ["/categories", "Все категории"], ["/search", "Каталог Marketo"],
    ["/category/jobs", "Работа"], ["/category/services", "Услуги"], ["/category/cars", "Легковые автомобили"],
    ["/profile", "Войдите, чтобы открыть профиль"],
    ["/favorites", "Войдите, чтобы открыть избранное"], ["/messages", "Войдите, чтобы написать продавцу"],
    ["/messages/new?listing=listing-id", "Войдите, чтобы написать продавцу"],
    ["/notifications", "Войдите, чтобы открыть уведомления"], ["/login", "Добро пожаловать"],
    ["/settings", "Настройки"], ["/help", "Помощь"], ["/offline", "Нет подключения"],
  ];
  for (const [pathname, expected] of routes) {
    const { response, html } = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(html, new RegExp(expected), pathname);
    assert.match(html, /class="back-button|marketo-kz|Marketo/, pathname);
  }
});

test("Home listing preview stays idle until its explicit public API request", async () => {
  const rpcPath = "/rest/v1/rpc/search_catalog_listing_cards";
  const before = supabaseRequestCounts.get(rpcPath) ?? 0;
  const response = await worker.fetch(new Request("http://localhost/api/listings?view=home-preview", {
    headers: { accept: "application/json", cookie: "marketo-locale=ru" },
  }), env, ctx);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { items: [] });
  assert.equal((supabaseRequestCounts.get(rpcPath) ?? 0) - before, 1);
});

test("Kazakh locale renders server-side without changing routes", async () => {
  const routes = [
    ["/", "Жаныңыздағы үздік ұсыныстар"],
    ["/categories", "Барлық санаттар"],
    ["/category/jobs", "Жұмыс"],
    ["/category/services", "Қызметтер"],
    ["/profile", "Профильді ашу үшін кіріңіз"],
    ["/notifications", "Хабарламаларды ашу үшін кіріңіз"],
  ];
  for (const [pathname, expected] of routes) {
    const { response, html } = await render(pathname, "kk");
    assert.equal(response.status, 200, pathname);
    assert.match(html, /<html lang="kk">/, pathname);
    assert.match(html, new RegExp(expected), pathname);
    assert.match(html, /ҚАЗ/, pathname);
  }
});

test("anonymous profile exposes explicit Auth actions and no account-only or moderation sections", async () => {
  const { response, html } = await render("/profile");
  assert.equal(response.status, 200);
  assert.match(html, />Войти</);
  assert.match(html, />Зарегистрироваться</);
  assert.match(html, />Восстановить пароль</);
  assert.match(html, /href="\/login\?mode=login(?:&amp;|&)next=\/profile"/);
  assert.match(html, /href="\/login\?mode=register(?:&amp;|&)next=\/profile"/);
  assert.match(html, /href="\/login\?mode=recover(?:&amp;|&)next=\/profile"/);
  assert.doesNotMatch(html, /Мои объявления/);
  assert.doesNotMatch(html, />Модерация</);
});

test("invalid callback cannot create an open redirect", async () => {
  const { response } = await render("/auth/callback?next=https://evil.example/steal");
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location"), "http://localhost");
  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("auth_error"), "invalid");
  assert.equal(location.searchParams.get("next"), "/profile");
});

test("protected pages redirect anonymous users to login in both locales", async () => {
  for (const locale of ["ru", "kk"]) {
    for (const [pathname, expectedNext] of [
      [`/publish?listing=${ids.country}`, `/publish?listing=${ids.country}`],
      ["/publish", "/publish"],
      ["/profile/edit", "/profile/edit"],
      ["/admin", "/admin"],
      [`/admin/${ids.country}`, `/admin/${ids.country}`],
    ]) {
      const { response } = await render(pathname, locale);
      assert.equal(response.status, 307, `${locale} ${pathname}`);
      const location = new URL(response.headers.get("location"), "http://localhost");
      assert.equal(location.pathname, "/login", `${locale} ${pathname}`);
      assert.equal(location.searchParams.get("next"), expectedNext, `${locale} ${pathname}`);
    }
  }
});

test("anonymous moderation mutation is denied by the production worker", async () => {
  const response = await worker.fetch(new Request(`http://localhost/api/admin/listings/${ids.country}/moderate`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ decision: "approve" }),
  }), env, ctx);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "authentication_required" });
});

test("owner mutations reject cross-origin requests before Auth and allow same-origin requests to reach Auth", async () => {
  const routes = [
    { pathname: "/api/listings", method: "POST", body: "{}" },
    { pathname: `/api/listings/${ids.country}`, method: "PATCH", body: "{}" },
    { pathname: `/api/listings/${ids.country}/submit`, method: "POST" },
    { pathname: `/api/listings/${ids.country}/archive`, method: "POST" },
    { pathname: `/api/listings/${ids.country}/sold`, method: "POST" },
    { pathname: `/api/listings/${ids.country}/images`, method: "POST" },
  ];
  for (const route of routes) {
    const crossOrigin = await worker.fetch(new Request(`http://localhost${route.pathname}`, {
      method: route.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      ...(route.body ? { body: route.body } : {}),
    }), env, ctx);
    assert.equal(crossOrigin.status, 403, route.pathname);
    assert.deepEqual(await crossOrigin.json(), { error: "cross_origin_request_denied" }, route.pathname);

    const sameOrigin = await worker.fetch(new Request(`http://localhost${route.pathname}`, {
      method: route.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: "http://localhost",
      },
      ...(route.body ? { body: route.body } : {}),
    }), env, ctx);
    assert.equal(sameOrigin.status, 401, route.pathname);
    assert.deepEqual(await sameOrigin.json(), { error: "authentication_required" }, route.pathname);
  }
});

test("unknown user-data and unknown application routes use the designed 404 state", async () => {
  for (const pathname of ["/listing/not-real", "/seller/not-real", "/messages/not-real", "/route-that-does-not-exist"]) {
    const { response, html } = await render(pathname);
    assert.equal(response.status, 404, pathname);
    assert.match(html, /Страница не найдена/, pathname);
    assert.match(html, /Вернуться на главную/, pathname);
  }
});

test("seller pagination has canonical redirects and non-indexable out-of-range responses", async () => {
  const sellerPath = `/seller/${ids.seller}`;
  const rangeRequestsBeforeValidPages = sellerListingRangeRequests.length;

  const rootPage = await render(sellerPath);
  assert.equal(rootPage.response.status, 200);
  assert.match(rootPage.html, /SEO Seller/);
  assert.match(rootPage.html, /Seller offer 1/);
  assert.match(
    rootPage.html,
    new RegExp(`<img(?=[^>]*src="[^"]*avatars/${ids.seller}/profile\\.webp")(?=[^>]*alt="")[^>]*>`),
  );
  assert.equal(hasRobotsNoindex(rootPage.html), false);

  const avatarPath = rootPage.html.match(new RegExp(`src="([^"]*avatars/${ids.seller}/profile\\.webp)"`))?.[1];
  assert.equal(avatarPath, `/api/media/avatars/${ids.seller}/profile.webp`);
  const deliveredAvatar = await worker.fetch(new Request(`http://localhost${avatarPath}`), env, ctx);
  assert.equal(deliveredAvatar.status, 200);
  assert.equal(deliveredAvatar.headers.get("content-type"), "image/webp");
  assert.equal(deliveredAvatar.headers.get("cache-control"), "public, max-age=3600, s-maxage=3600");
  assert.equal(deliveredAvatar.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await deliveredAvatar.arrayBuffer()), avatarBytes);
  assert.deepEqual(mediaGetRequests, [`avatars/${ids.seller}/profile.webp`]);

  const mediaReadsBeforeRejectedPaths = mediaGetRequests.length;
  const mismatchedAvatar = await worker.fetch(
    new Request(`http://localhost/api/media/avatars/${ids.seller}/not-the-profile.webp`),
    env,
    ctx,
  );
  assert.equal(mismatchedAvatar.status, 404);
  const invalidAvatar = await worker.fetch(
    new Request("http://localhost/api/media/avatars/not-a-uuid/profile.webp"),
    env,
    ctx,
  );
  assert.equal(invalidAvatar.status, 404);
  assert.equal(mediaGetRequests.length, mediaReadsBeforeRejectedPaths);

  const explicitPageOne = await render(`${sellerPath}?page=1`);
  assert.equal(explicitPageOne.response.status, 308);
  assert.equal(new URL(explicitPageOne.response.headers.get("location"), "http://localhost").pathname, sellerPath);
  assert.equal(new URL(explicitPageOne.response.headers.get("location"), "http://localhost").search, "");

  const secondPage = await render(`${sellerPath}?page=2`);
  assert.equal(secondPage.response.status, 200);
  assert.match(secondPage.html, /Seller offer 25/);
  assert.equal(hasRobotsNoindex(secondPage.html), false);

  const lastPage = await render(`${sellerPath}?page=3`);
  assert.equal(lastPage.response.status, 200);
  assert.match(lastPage.html, /Seller offer 49/);
  assert.equal(hasRobotsNoindex(lastPage.html), false);
  assert.deepEqual(
    sellerListingRangeRequests.slice(rangeRequestsBeforeValidPages).map(({ offset, limit }) => ({ offset, limit })),
    [
      { offset: 0, limit: 24 },
      { offset: 24, limit: 24 },
      { offset: 48, limit: 24 },
    ],
  );

  for (const requestedPage of [4, Number.MAX_SAFE_INTEGER]) {
    const rangeRequestsBefore = sellerListingRangeRequests.length;
    const result = await render(`${sellerPath}?page=${requestedPage}`);
    assert.equal(result.response.status, 404, `page=${requestedPage}`);
    assert.equal(hasRobotsNoindex(result.html), true, `page=${requestedPage}`);
    assert.equal(sellerListingRangeRequests.length, rangeRequestsBefore, `page=${requestedPage} must not issue a listings range request`);
  }

  const emptySellerPath = `/seller/${ids.emptySeller}`;
  const emptyRoot = await render(emptySellerPath);
  assert.equal(emptyRoot.response.status, 200);
  assert.match(emptyRoot.html, /Активных объявлений пока нет/);
  const emptyAvatar = emptyRoot.html.match(/<div class="seller-profile-avatar"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.match(emptyAvatar, /<svg/);
  assert.doesNotMatch(emptyAvatar, /<img/);

  const emptyOutOfRange = await render(`${emptySellerPath}?page=2`);
  assert.equal(emptyOutOfRange.response.status, 404);
  assert.equal(hasRobotsNoindex(emptyOutOfRange.html), true);
});

test("seller UUID routes redirect to lowercase without losing canonical pagination", async () => {
  const sellerPath = `/seller/${ids.seller}`;
  const uppercasePath = `/seller/${ids.seller.toUpperCase()}`;
  const mixedCasePath = `/seller/${ids.seller.replace("abcdef", "AbCdEf")}`;

  for (const pathname of [uppercasePath, mixedCasePath]) {
    const result = await render(pathname);
    assert.equal(result.response.status, 308, pathname);
    const location = new URL(result.response.headers.get("location"), "http://localhost");
    assert.equal(location.pathname, sellerPath);
    assert.equal(location.search, "");
  }

  const upperSecondPage = await render(`${uppercasePath}?page=2`);
  assert.equal(upperSecondPage.response.status, 308);
  const secondPageLocation = new URL(upperSecondPage.response.headers.get("location"), "http://localhost");
  assert.equal(secondPageLocation.pathname, sellerPath);
  assert.equal(secondPageLocation.search, "?page=2");

  const upperFirstPage = await render(`${uppercasePath}?page=1`);
  assert.equal(upperFirstPage.response.status, 308);
  const firstPageLocation = new URL(upperFirstPage.response.headers.get("location"), "http://localhost");
  assert.equal(firstPageLocation.pathname, sellerPath);
  assert.equal(firstPageLocation.search, "");

  const readsBeforeInvalid = supabaseRequestCounts.get("/rest/v1/seller_profiles") ?? 0;
  const invalid = await render("/seller/not-a-uuid?page=2");
  assert.equal(invalid.response.status, 404);
  assert.equal(supabaseRequestCounts.get("/rest/v1/seller_profiles") ?? 0, readsBeforeInvalid);
});

test("seller absence is 404 while an operational profile query failure is not", async () => {
  const missing = await render(`/seller/${ids.missingSeller}`);
  assert.equal(missing.response.status, 404);

  const failed = await render(`/seller/${ids.errorSeller}`);
  // vinext currently renders the root application error boundary with a 200
  // document status. The semantic contract here is that an operational read
  // failure reaches that error boundary and is never converted to the seller
  // not-found/noindex response.
  assert.notEqual(failed.response.status, 404);
  assert.equal(hasRobotsNoindex(failed.html), false);
  assert.match(failed.html, /Не удалось загрузить страницу/);
  assert.doesNotMatch(failed.html, /Страница не найдена/);
});

test("missing asset probes bypass the application 404 render pipeline", async () => {
  for (const pathname of ["/favicon.ico", "/apple-touch-icon.png", "/does-not-exist.js", "/.well-known/probe.json"]) {
    const { response, html } = await render(pathname);
    assert.equal(response.status, 404, pathname);
    assert.match(response.headers.get("content-type") ?? "", /^text\/plain/, pathname);
    assert.equal(html, "Not Found", pathname);
  }
});

test("category attributes route returns Supabase-backed filters without an elevated key", async () => {
  const { response, html } = await render(`/api/reference/categories/${ids.cars}/attributes`);
  assert.equal(response.status, 200);
  const payload = JSON.parse(html);
  assert.equal(payload.categoryId, ids.cars);
  assert.equal(payload.attributes[0].key, "brand");
  assert.equal(payload.attributes[0].options[0].value, "toyota");
});

test("50 sequential direct warm Worker RSC requests keep aggregate payload bounded and avoid hidden Home listing work", async () => {
  const routes = ["/", "/categories", "/search", "/category/jobs", "/category/services", "/help", "/offline"];
  const listingRoutes = new Set(["/search", "/category/jobs", "/category/services"]);
  const rpcPath = "/rest/v1/rpc/search_catalog_listing_cards";
  const rpcBefore = supabaseRequestCounts.get(rpcPath) ?? 0;
  const geographyBefore = new Map(
    ["countries", "regions", "settlements"].map((table) => [table, supabaseRequestCounts.get(`/rest/v1/${table}`) ?? 0]),
  );
  let expectedListingRequests = 0;
  let totalBytes = 0;

  for (let index = 0; index < 50; index += 1) {
    const pathname = routes[index % routes.length];
    const listingRpcBeforeRequest = supabaseRequestCounts.get(rpcPath) ?? 0;
    const { response, body } = await renderRsc(pathname);
    const listingRpcAfterRequest = supabaseRequestCounts.get(rpcPath) ?? 0;
    const expectsListingRequest = listingRoutes.has(pathname);
    assert.equal(response.status, 200, `${index + 1}: ${pathname}`);
    assert.match(response.headers.get("content-type") ?? "", /text\/x-component/, pathname);
    assert.equal(
      listingRpcAfterRequest - listingRpcBeforeRequest,
      expectsListingRequest ? 1 : 0,
      `${index + 1}: ${pathname} must execute ${expectsListingRequest ? "exactly one" : "no"} catalog RPC`,
    );
    totalBytes += body.byteLength;
    if (expectsListingRequest) expectedListingRequests += 1;
  }

  const rpcAfter = supabaseRequestCounts.get(rpcPath) ?? 0;
  assert.equal(expectedListingRequests, 21, "the fixed 50-request route sequence must contain 21 listing-bearing requests");
  assert.equal(rpcAfter - rpcBefore, 21, "one catalog RPC per listing-bearing direct RSC request");
  assert.ok(totalBytes < 2_500_000, `50 RSC payloads unexpectedly retained full catalog data: ${totalBytes} bytes`);
  for (const table of ["countries", "regions", "settlements"]) {
    assert.equal(
      supabaseRequestCounts.get(`/rest/v1/${table}`) ?? 0,
      geographyBefore.get(table),
      `${table} must not load during global server layout navigation`,
    );
  }
});
