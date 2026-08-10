import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogClient } from "@/components/catalog-client";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { categories } from "@/lib/mock-data";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  return category ? { title: `${category.name} в Алматы`, description: `Объявления категории «${category.name}» в Алматы на Marketo.` } : {};
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();
  return <><Header /><main className="page-shell subpage-main"><CatalogClient initialCategory={category.name} /></main><MobileNav /></>;
}
