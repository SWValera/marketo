import type { Metadata } from "next";
import { CatalogClient } from "@/components/catalog-client";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { allSearchPlaceholder, categoryOptions, getCategoryAttributes, getCategoryBySlug } from "@/lib/catalog-config";
import { listingRepository } from "@/lib/data/repositories";

export const metadata: Metadata = {
  title: "Каталог объявлений",
  description: "Товары, транспорт, недвижимость, работа и услуги по всему Казахстану на Marketo.",
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const params = await searchParams;
  const category = getCategoryBySlug(params.category);
  const listings = await listingRepository.list();
  return <><Header categorySlug={category?.slug} searchPlaceholder={category?.searchPlaceholder?.ru} /><main className="page-shell subpage-main"><CatalogClient initialQuery={params.q ?? ""} initialCategorySlug={category?.slug ?? ""} title={category?.name.ru ?? "Все объявления"} placeholder={category?.searchPlaceholder?.ru ?? allSearchPlaceholder.ru} attributes={getCategoryAttributes(category?.slug)} categories={categoryOptions.filter((item) => item.depth === 0).map((item) => ({ slug: item.slug, label: item.name.ru, depth: item.depth }))} initialListings={listings.items} /></main><MobileNav /></>;
}
