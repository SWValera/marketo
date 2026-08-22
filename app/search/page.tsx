import type { Metadata } from "next";
import { CatalogClient } from "@/components/catalog-client";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { parseCatalogSearchParams, type CatalogSearchParams } from "@/lib/catalog-search-params";
import { listingRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";
import { createCategoryCatalogView, getCategoryBySlug, getCategoryRoot } from "@/lib/reference-data/catalog";
import { getCategoryAttributeReferences, getCategoryReferences } from "@/lib/reference-data/server";

export const metadata: Metadata = {
  title: "Каталог объявлений",
  description: "Товары, транспорт, недвижимость, работа и услуги по всему Казахстану на Marketo.",
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const parsed = parseCatalogSearchParams(await searchParams);
  const [catalog, listings, i18n] = await Promise.all([
    getCategoryReferences(),
    listingRepository.list(),
    getServerI18n(),
  ]);
  const view = createCategoryCatalogView(catalog.data);
  const category = getCategoryBySlug(view, parsed.categorySlug);
  const rootCategory = getCategoryRoot(view, category);
  const initialAttributes = category ? await getCategoryAttributeReferences(category.id) : undefined;
  const { locale, t } = i18n;
  const searchPlaceholder = localize(category?.searchPlaceholder ?? rootCategory?.searchPlaceholder, locale) || t("header.searchPlaceholder");
  return <><Header categorySlug={category?.slug} searchPlaceholder={searchPlaceholder} /><main className="page-shell subpage-main"><CatalogClient catalog={catalog} initialCategoryAttributes={initialAttributes} initialQuery={parsed.query} initialCategorySlug={category?.slug ?? ""} initialCityId={parsed.cityId} initialMinPrice={parsed.minPrice} initialMaxPrice={parsed.maxPrice} initialSort={parsed.sort} initialDynamicFilters={parsed.dynamicFilters} titleText={category?.name} title={category ? undefined : t("catalog.allListings")} initialListings={listings.items} /></main><MobileNav /></>;
}
