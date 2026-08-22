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
};

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
    { id: ids.carBrand, category_id: ids.cars, key: "brand", label_ru: "Марка", label_kk: "Маркасы", data_type: "select", unit_ru: null, unit_kk: null, is_required: true, is_filterable: true, is_searchable: false, inherits_to_children: false, validation: {}, sort_order: 10 },
    { id: ids.jobEmployment, category_id: ids.jobs, key: "employment", label_ru: "Тип занятости", label_kk: "Жұмыспен қамту түрі", data_type: "select", unit_ru: null, unit_kk: null, is_required: true, is_filterable: true, is_searchable: false, inherits_to_children: false, validation: {}, sort_order: 10 },
    { id: ids.serviceVisit, category_id: ids.services, key: "visit", label_ru: "Выезд к клиенту", label_kk: "Клиентке бару", data_type: "boolean", unit_ru: null, unit_kk: null, is_required: false, is_filterable: true, is_searchable: false, inherits_to_children: false, validation: {}, sort_order: 10 },
  ],
  category_attribute_options: [
    { id: ids.carBrandToyota, attribute_id: ids.carBrand, value: "toyota", label_ru: "Toyota", label_kk: "Toyota", sort_order: 10 },
  ],
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const requestUrl = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (requestUrl.hostname !== "reference-test.supabase.co") return originalFetch(input, init);
  const table = requestUrl.pathname.split("/").at(-1);
  let rows = structuredClone(referenceTables[table] ?? []);
  const categoryId = requestUrl.searchParams.get("category_id");
  if (categoryId?.startsWith("eq.")) rows = rows.filter((row) => row.category_id === categoryId.slice(3));
  const attributeIds = requestUrl.searchParams.get("attribute_id");
  if (attributeIds?.startsWith("in.(")) {
    const allowed = new Set(attributeIds.slice(4, -1).split(","));
    rows = rows.filter((row) => allowed.has(row.attribute_id));
  }
  return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
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

test("core routes render through the production worker", async () => {
  const routes = [
    ["/", "Покупайте и продавайте"], ["/categories", "Все категории"], ["/search", "Каталог Marketo"],
    ["/category/jobs", "Работа"], ["/category/services", "Услуги"], ["/category/cars", "Легковые автомобили"],
    ["/profile", "Войдите, чтобы открыть профиль"], ["/profile/edit", "Редактировать профиль"],
    ["/favorites", "В избранном пока пусто"], ["/messages", "Сообщений пока нет"],
    ["/messages/new?listing=listing-id", "Войдите, чтобы написать продавцу"],
    ["/notifications", "Уведомлений пока нет"], ["/publish", "Подать объявление"], ["/login", "Добро пожаловать"],
    ["/settings", "Настройки"], ["/help", "Помощь"], ["/admin", "Очередь модерации пуста"], ["/offline", "Нет подключения"],
  ];
  for (const [pathname, expected] of routes) {
    const { response, html } = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(html, new RegExp(expected), pathname);
    assert.match(html, /class="back-button|marketo-kz|Marketo/, pathname);
  }
});

test("Kazakh locale renders server-side without changing routes", async () => {
  const routes = [
    ["/", "Бүкіл Қазақстан бойынша сатып алыңыз және сатыңыз"],
    ["/categories", "Барлық санаттар"],
    ["/category/jobs", "Жұмыс"],
    ["/category/services", "Қызметтер"],
    ["/profile", "Профильді ашу үшін кіріңіз"],
    ["/publish", "Хабарландыру беру"],
    ["/notifications", "Әзірге хабарлама жоқ"],
  ];
  for (const [pathname, expected] of routes) {
    const { response, html } = await render(pathname, "kk");
    assert.equal(response.status, 200, pathname);
    assert.match(html, /<html lang="kk">/, pathname);
    assert.match(html, new RegExp(expected), pathname);
    assert.match(html, /ҚАЗ/, pathname);
  }
});

test("unknown user-data and unknown application routes use the designed 404 state", async () => {
  for (const pathname of ["/listing/not-real", "/seller/not-real", "/messages/not-real", "/admin/not-real", "/route-that-does-not-exist"]) {
    const { response, html } = await render(pathname);
    assert.equal(response.status, 404, pathname);
    assert.match(html, /Страница не найдена/, pathname);
    assert.match(html, /Вернуться на главную/, pathname);
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
