import type { Metadata } from "next";
import { CatalogClient } from "@/components/catalog-client";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { parseCatalogSearchParams, type CatalogSearchParams } from "@/lib/catalog-search-params";
import { listingRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";
import { createCategoryCatalogView, getCategoryBySlug, getCategoryChildren, getCategoryDescendantIds, getCategoryRoot } from "@/lib/reference-data/catalog";
import { sanitizeAttributeFilters } from "@/lib/reference-data/attributes";
import { getCategoryAttributeReferences, getCategoryReferences } from "@/lib/reference-data/server";
import { EMPTY_CATEGORIES } from "@/lib/reference-data/types";

export const metadata: Metadata = {
  title: "Каталог объявлений",
  description: "Товары, транспорт, недвижимость, работа и услуги по всему Казахстану на Marketo.",
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const parsed = parseCatalogSearchParams(await searchParams);
  const catalogPromise = parsed.categorySlug
    ? getCategoryReferences()
    : Promise.resolve({ status: "ready" as const, data: EMPTY_CATEGORIES });
  const [catalog, i18n] = await Promise.all([
    catalogPromise,
    getServerI18n(),
  ]);
  const view = createCategoryCatalogView(catalog.data);
  const category = getCategoryBySlug(view, parsed.categorySlug);
  const rootCategory = getCategoryRoot(view, category);
  const { locale, t } = i18n;
  if (parsed.categorySlug && (catalog.status !== "ready" || !category)) {
    const unavailable = catalog.status !== "ready";
    return <><Header /><main id="main-content" tabIndex={-1} className="page-shell subpage-main"><EmptyState
      title={unavailable ? t("reference.categoriesUnavailableTitle") : t("catalog.emptyTitle")}
      description={unavailable ? t("reference.categoriesUnavailable") : t("catalog.emptyDescription")}
      actionHref="/search"
      actionLabel={t("catalog.reset")}
    /></main><MobileNav /></>;
  }
  let initialAttributes;
  let listings;
  let initialDynamicFilters: Record<string, string> = {};
  try {
    const categoryIsLeaf = Boolean(category && getCategoryChildren(view, category).length === 0);
    initialAttributes = categoryIsLeaf && category ? await getCategoryAttributeReferences(category.id) : undefined;
    initialDynamicFilters = initialAttributes?.status === "ready"
      ? sanitizeAttributeFilters(initialAttributes.data.attributes, parsed.dynamicFilters)
      : {};
    listings = await listingRepository.list({
      locale,
      categoryIds: category ? getCategoryDescendantIds(view, category) : undefined,
      settlementId: parsed.cityId && parsed.cityId !== "all" ? parsed.cityId : undefined,
      query: parsed.query,
      minPriceMinor: parsed.minPrice ? Number(parsed.minPrice) : undefined,
      maxPriceMinor: parsed.maxPrice ? Number(parsed.maxPrice) : undefined,
      attributeFilters: initialDynamicFilters,
      sort: parsed.sort,
      page: parsed.page,
      limit: 60,
    });
  } catch {
    return <><Header /><main id="main-content" tabIndex={-1} className="page-shell subpage-main"><EmptyState
      title={t("state.error")}
      description={t("state.errorNote")}
      actionHref="/search"
      actionLabel={t("common.retry")}
    /></main><MobileNav /></>;
  }
  const searchPlaceholder = localize(category?.searchPlaceholder ?? rootCategory?.searchPlaceholder, locale) || t("header.searchPlaceholder");
  const clientKey = JSON.stringify({ ...parsed, dynamicFilters: initialDynamicFilters });
  return <><Header categorySlug={category?.slug} searchPlaceholder={searchPlaceholder} /><main id="main-content" tabIndex={-1} className="page-shell subpage-main"><CatalogClient key={clientKey} basePath="/search" initialCategoryAttributes={initialAttributes} initialQuery={parsed.query} initialCategorySlug={category?.slug ?? ""} initialCityId={parsed.cityId} initialMinPrice={parsed.minPrice} initialMaxPrice={parsed.maxPrice} initialSort={parsed.sort} initialDynamicFilters={initialDynamicFilters} titleText={category?.name} title={category ? undefined : t("catalog.allListings")} initialListings={listings.items} initialTotal={listings.total} initialPage={listings.page} initialTotalPages={listings.totalPages} initialState={listings.state} /></main><MobileNav /></>;
}
