import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogClient } from "@/components/catalog-client";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { getCategoryBySlug } from "@/lib/catalog-config";

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
  return <><Header /><main className="page-shell subpage-main"><CatalogClient initialCategorySlug={category.slug} /></main><MobileNav /></>;
}
