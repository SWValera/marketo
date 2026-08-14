import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { categoryTree } from "@/lib/catalog-config";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";

export const metadata: Metadata = { title: "Все категории", description: "Полный каталог категорий Marketo Казахстан.", alternates: { canonical: "/categories" } };

export default async function CategoriesPage() {
  const { locale, t } = await getServerI18n();
  return <><Header /><main className="page-shell subpage-main"><PageHeader fallback="/" eyebrow={t("categories.eyebrow")} title={t("categories.title")} description={t("categories.description")} /><div className="category-directory">{categoryTree.map((category) => <section className="category-directory-group" key={category.slug}><Link className="category-directory-title" href={`/category/${category.slug}`}><span className={`category-icon tone-${category.tone}`}><CategoryIcon name={category.icon} /></span><strong>{localize(category.name, locale)}</strong><ChevronRight size={19} /></Link><div>{category.children?.map((child) => <Link href={`/category/${child.slug}`} key={child.slug}>{localize(child.name, locale)}</Link>)}</div></section>)}</div></main><MobileNav /></>;
}
