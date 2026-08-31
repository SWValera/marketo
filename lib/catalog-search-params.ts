export type CatalogSearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const safeReference = (value: string) => /^[a-z0-9-]{1,80}$/i.test(value) ? value : "";

export function parseCatalogSearchParams(params: CatalogSearchParams) {
  const city = first(params.city);
  const sort = first(params.sort);
  const normalizedSort: "new" | "cheap" | "expensive" = sort === "cheap" || sort === "expensive" ? sort : "new";
  const dynamicFilters: Record<string, string | boolean> = {};
  for (const [key, rawValue] of Object.entries(params)) {
    const attributeKey = key.slice(2);
    if (!key.startsWith("f_") || !rawValue || !/^[a-z][A-Za-z0-9_]{0,79}$/.test(attributeKey)) continue;
    if (Object.keys(dynamicFilters).length >= 40) break;
    const value = first(rawValue).slice(0, 200);
    if (value) dynamicFilters[attributeKey] = value === "true" ? true : value;
  }
  return {
    query: first(params.q).slice(0, 200),
    categorySlug: safeReference(first(params.category)),
    cityId: city === "all" ? city : safeReference(city) || undefined,
    minPrice: first(params.price_min).replace(/\D/g, ""),
    maxPrice: first(params.price_max).replace(/\D/g, ""),
    sort: normalizedSort,
    dynamicFilters,
  };
}
