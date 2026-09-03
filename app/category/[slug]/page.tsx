import type { Metadata } from "next";
import { AppLink as Link } from "@/components/app-link";
import { notFound } from "next/navigation";
import { CatalogClient } from "@/components/catalog-client";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { parseCatalogSearchParams, type CatalogSearchParams } from "@/lib/catalog-search-params";
import { listingRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";
import {
  createCategoryCatalogView,
  getCategoryBySlug,
  getCategoryChildren,
  getCategoryDescendantIds,
  getCategoryParent,
  getCategoryPath,
  getCategoryRoot,
  isCategoryWithin,
} from "@/lib/reference-data/catalog";
import { getCategoryAttributeReferences, getCategoryReferences } from "@/lib/reference-data/server";

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await getCategoryReferences();
  const category = getCategoryBySlug(createCategoryCatalogView(catalog.data), slug);
  const { locale } = await getServerI18n();
  const name = category ? localize(category.name, locale) : "";
  return catalog.status !== "ready" ? { robots: { index: false, follow: true } } : category ? {
    title: `${name} — Marketo`,
    description: locale === "kk" ? `Қазақстан бойынша «${name}» санатындағы хабарландырулар.` : `Объявления категории «${name}» по всему Казахстану на Marketo.`,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: { title: `${name} — Marketo`, description: locale === "kk" ? `Marketo-дағы «${name}» бөлімінің өзекті хабарландырулары.` : `Актуальные объявления раздела «${name}» на Marketo.`, url: `/category/${category.slug}` },
  } : { robots: { index: false, follow: true } };
}

export default function CategoryPage(props: CategoryPageProps) {
  return <CategoryPageContent {...props} />;
}

async function CategoryPageContent({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const catalog = await getCategoryReferences();
  const view = createCategoryCatalogView(catalog.data);
  const category = getCategoryBySlug(view, slug);
  if (catalog.status === "ready" && !category) notFound();
  const { locale, t } = await getServerI18n();
  if (!category) {
    return <><Header /><main id="main-content" tabIndex={-1} className="page-shell subpage-main"><EmptyState title={t("reference.categoriesUnavailableTitle")} description={t("reference.categoriesUnavailable")} actionHref="/help" actionLabel={t("nav.help")} /></main><MobileNav /></>;
  }
  const parsed = parseCatalogSearchParams(await searchParams);
  const requestedCategory = getCategoryBySlug(view, parsed.categorySlug);
  const filteredCategory = requestedCategory && isCategoryWithin(view, requestedCategory.slug, category.slug)
    ? requestedCategory
    : category;
  const rootCategory = getCategoryRoot(view, filteredCategory);
  let listings;
  let initialAttributes;
  try {
    [listings, initialAttributes] = await Promise.all([
      listingRepository.list({
        locale,
        categoryIds: getCategoryDescendantIds(view, filteredCategory),
        settlementId: parsed.cityId && parsed.cityId !== "all" ? parsed.cityId : undefined,
        query: parsed.query,
        minPriceMinor: parsed.minPrice ? Number(parsed.minPrice) : undefined,
        maxPriceMinor: parsed.maxPrice ? Number(parsed.maxPrice) : undefined,
        attributeFilters: parsed.dynamicFilters,
        sort: parsed.sort,
        page: parsed.page,
        limit: 60,
      }),
      getCategoryAttributeReferences(filteredCategory.id),
    ]);
  } catch {
    return <><Header categorySlug={category.slug} /><main id="main-content" tabIndex={-1} className="page-shell subpage-main"><EmptyState
      title={t("state.error")}
      description={t("state.errorNote")}
      actionHref={`/category/${category.slug}`}
      actionLabel={t("common.retry")}
    /></main><MobileNav /></>;
  }
  const parent = getCategoryParent(view, category);
  const path = getCategoryPath(view, category);
  const children = getCategoryChildren(view, category);
  const searchPlaceholder = localize(filteredCategory.searchPlaceholder ?? rootCategory?.searchPlaceholder, locale) || t("header.searchPlaceholder");
  return <><Header categorySlug={filteredCategory.slug} searchPlaceholder={searchPlaceholder} /><main id="main-content" tabIndex={-1} className="page-shell subpage-main">
    <nav className="breadcrumbs" aria-label={t("categories.eyebrow")}><Link href="/">{t("common.home")}</Link>{path.map((item) => <span key={item.slug}>/ <Link href={`/category/${item.slug}`}>{localize(item.name, locale)}</Link></span>)}</nav>
    {children.length > 0 ? <section className="subcategory-strip" aria-label={`${t("categories.refine")}: ${localize(category.name, locale)}`}><strong>{t("categories.refine")}</strong><div>{children.map((child) => <Link href={`/category/${child.slug}`} key={child.id}>{localize(child.name, locale)}</Link>)}</div></section> : null}
    <CatalogClient key={`${slug}:${JSON.stringify(parsed)}`} basePath={`/category/${category.slug}`} initialCategoryAttributes={initialAttributes} initialQuery={parsed.query} initialCategorySlug={filteredCategory.slug} initialCityId={parsed.cityId} initialMinPrice={parsed.minPrice} initialMaxPrice={parsed.maxPrice} initialSort={parsed.sort} initialDynamicFilters={parsed.dynamicFilters} titleText={filteredCategory.name} initialListings={listings.items} initialTotal={listings.total} initialPage={listings.page} initialTotalPages={listings.totalPages} initialState={listings.state} fallback={parent ? `/category/${parent.slug}` : "/categories"} />
  </main><MobileNav /></>;
}
