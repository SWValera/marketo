export type CatalogSearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const safeReference = (value: string) => /^[a-z0-9-]{1,80}$/i.test(value) ? value : "";

export function parseCatalogSearchParams(params: CatalogSearchParams) {
  const city = first(params.city);
  const sort = first(params.sort);
  const dynamicFilters: Record<string, string | boolean> = {};
  for (const [key, rawValue] of Object.entries(params)) {
    if (!key.startsWith("f_") || !rawValue) continue;
    const value = first(rawValue);
    dynamicFilters[key.slice(2)] = value === "true" ? true : value;
  }
  return {
    query: first(params.q).slice(0, 200),
    categorySlug: safeReference(first(params.category)),
    cityId: city === "all" ? city : safeReference(city) || undefined,
    minPrice: first(params.price_min).replace(/\D/g, ""),
    maxPrice: first(params.price_max).replace(/\D/g, ""),
    sort: ["new", "cheap", "expensive"].includes(sort) ? sort : "new",
    dynamicFilters,
  };
}
