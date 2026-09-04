export type CatalogSearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const safeReference = (value: string) => /^[a-z0-9-]{1,80}$/i.test(value) ? value : "";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CATALOG_PRICE = 90_000_000_000;

function safePrice(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const numeric = Number(digits);
  return Number.isSafeInteger(numeric) && numeric <= MAX_CATALOG_PRICE ? String(numeric) : "";
}

function safePage(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return 1;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : 1;
}

export function parseCatalogSearchParams(params: CatalogSearchParams) {
  const city = first(params.city);
  const sort = first(params.sort);
  const normalizedSort: "new" | "cheap" | "expensive" = sort === "cheap" || sort === "expensive" ? sort : "new";
  const dynamicFilters: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(params)) {
    const attributeKey = key.slice(2);
    if (!key.startsWith("f_") || !rawValue || !/^[a-z][A-Za-z0-9_]{0,79}$/.test(attributeKey)) continue;
    if (Object.keys(dynamicFilters).length >= 40) break;
    const value = first(rawValue).slice(0, 200);
    if (value) dynamicFilters[attributeKey] = value;
  }
  return {
    query: first(params.q).slice(0, 200),
    categorySlug: safeReference(first(params.category)),
    cityId: city === "all" ? city : UUID_PATTERN.test(city) ? city.toLowerCase() : undefined,
    minPrice: safePrice(first(params.price_min)),
    maxPrice: safePrice(first(params.price_max)),
    sort: normalizedSort,
    page: safePage(first(params.page)),
    dynamicFilters,
  };
}
