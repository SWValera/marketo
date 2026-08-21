import type { Metadata } from "next";
import { CatalogClient } from "@/components/catalog-client";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { allSearchPlaceholder, getCategoryBySlug, getCategoryRoot } from "@/lib/catalog-config";
import { parseCatalogSearchParams, type CatalogSearchParams } from "@/lib/catalog-search-params";
import { listingRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";

export const metadata: Metadata = {
  title: "Каталог объявлений",
  description: "Товары, транспорт, недвижимость, работа и услуги по всему Казахстану на Marketo.",
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const parsed = parseCatalogSearchParams(await searchParams);
  const category = getCategoryBySlug(parsed.categorySlug);
  const rootCategory = getCategoryRoot(category?.slug);
  const listings = await listingRepository.list();
  const { locale, t } = await getServerI18n();
  return <><Header categorySlug={category?.slug} searchPlaceholder={localize(category?.searchPlaceholder ?? rootCategory?.searchPlaceholder ?? allSearchPlaceholder, locale)} /><main className="page-shell subpage-main"><CatalogClient initialQuery={parsed.query} initialCategorySlug={category?.slug ?? ""} initialCityId={parsed.cityId} initialMinPrice={parsed.minPrice} initialMaxPrice={parsed.maxPrice} initialSort={parsed.sort} initialDynamicFilters={parsed.dynamicFilters} titleText={category?.name} title={category ? undefined : t("catalog.allListings")} initialListings={listings.items} /></main><MobileNav /></>;
}
