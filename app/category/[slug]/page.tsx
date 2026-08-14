import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogClient } from "@/components/catalog-client";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { categoryOptions, getCategoryAttributes, getCategoryBySlug, getCategoryParent, getCategoryPath } from "@/lib/catalog-config";
import { listingRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  const { locale } = await getServerI18n();
  const name = category ? localize(category.name, locale) : "";
  return category ? {
    title: `${name} — Marketo`,
    description: locale === "kk" ? `Қазақстан бойынша «${name}» санатындағы хабарландырулар.` : `Объявления категории «${name}» по всему Казахстану на Marketo.`,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: { title: `${name} — Marketo`, description: locale === "kk" ? `Marketo-дағы «${name}» бөлімінің өзекті хабарландырулары.` : `Актуальные объявления раздела «${name}» на Marketo.`, url: `/category/${category.slug}` },
  } : {};
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();
  const listings = await listingRepository.list();
  const { locale, t } = await getServerI18n();
  const parent = getCategoryParent(category.slug);
  const path = getCategoryPath(category.slug);
  return <><Header categorySlug={category.slug} searchPlaceholder={localize(category.searchPlaceholder, locale)} /><main className="page-shell subpage-main">
    <nav className="breadcrumbs" aria-label={t("categories.eyebrow")}><Link href="/">{t("common.home")}</Link>{path.map((item) => <span key={item.slug}>/ <Link href={`/category/${item.slug}`}>{localize(item.name, locale)}</Link></span>)}</nav>
    {category.children?.length ? <section className="subcategory-strip" aria-label={`${t("categories.refine")}: ${localize(category.name, locale)}`}><strong>{t("categories.refine")}</strong><div>{category.children.map((child) => <Link href={`/category/${child.slug}`} key={child.slug}>{localize(child.name, locale)}</Link>)}</div></section> : null}
    <CatalogClient initialCategorySlug={category.slug} title={localize(category.name, locale)} placeholder={localize(category.searchPlaceholder, locale)} attributes={getCategoryAttributes(category.slug)} categories={categoryOptions.filter((item) => item.depth === 0).map((item) => ({ slug: item.slug, name: item.name, depth: item.depth }))} initialListings={listings.items} fallback={parent ? `/category/${parent.slug}` : "/categories"} />
  </main><MobileNav /></>;
}
