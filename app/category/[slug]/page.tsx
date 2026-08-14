import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogClient } from "@/components/catalog-client";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { categoryOptions, getCategoryAttributes, getCategoryBySlug, getCategoryParent, getCategoryPath } from "@/lib/catalog-config";
import { listingRepository } from "@/lib/data/repositories";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  return category ? {
    title: `${category.name.ru} в Казахстане`,
    description: `Объявления категории «${category.name.ru}» по всему Казахстану на Marketo.`,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: { title: `${category.name.ru} в Казахстане`, description: `Актуальные объявления раздела «${category.name.ru}» на Marketo.`, url: `/category/${category.slug}` },
  } : {};
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();
  const listings = await listingRepository.list();
  const parent = getCategoryParent(category.slug);
  const path = getCategoryPath(category.slug);
  return <><Header categorySlug={category.slug} searchPlaceholder={category.searchPlaceholder?.ru} /><main className="page-shell subpage-main">
    <nav className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link>{path.map((item) => <span key={item.slug}>/ <Link href={`/category/${item.slug}`}>{item.name.ru}</Link></span>)}</nav>
    {category.children?.length ? <section className="subcategory-strip" aria-label={`Разделы категории ${category.name.ru}`}><strong>Уточните раздел</strong><div>{category.children.map((child) => <Link href={`/category/${child.slug}`} key={child.slug}>{child.name.ru}</Link>)}</div></section> : null}
    <CatalogClient initialCategorySlug={category.slug} title={category.name.ru} placeholder={category.searchPlaceholder?.ru} attributes={getCategoryAttributes(category.slug)} categories={categoryOptions.filter((item) => item.depth === 0).map((item) => ({ slug: item.slug, label: item.name.ru, depth: item.depth }))} initialListings={listings.items} fallback={parent ? `/category/${parent.slug}` : "/categories"} />
  </main><MobileNav /></>;
}
