import type { Metadata } from "next";
import { AppLink as Link } from "@/components/app-link";
import { ChevronRight } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";
import { createCategoryCatalogView, getCategoryChildren, getRootCategories } from "@/lib/reference-data/catalog";
import { getCategoryReferences } from "@/lib/reference-data/server";

export async function generateMetadata(): Promise<Metadata> {
  const [{ locale, t }, catalog] = await Promise.all([getServerI18n(), getCategoryReferences()]);
  return {
    title: t("categories.title"),
    description: t("categories.description"),
    alternates: { canonical: "/categories" },
    ...(catalog.status === "ready" ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title: t("categories.title"), description: t("categories.description"), locale: locale === "kk" ? "kk_KZ" : "ru_KZ", url: "/categories" },
  };
}

export default async function CategoriesPage() {
  const [{ locale, t }, catalog] = await Promise.all([getServerI18n(), getCategoryReferences()]);
  const view = createCategoryCatalogView(catalog.data);
  const roots = getRootCategories(view);
  return <><Header /><main id="main-content" tabIndex={-1} className="page-shell subpage-main"><PageHeader fallback="/" eyebrow={t("categories.eyebrow")} title={t("categories.title")} description={t("categories.description")} />{roots.length > 0 ? <div className="category-directory">{roots.map((category) => <section className="category-directory-group" key={category.id}><Link className="category-directory-title" href={`/category/${category.slug}`}><span className={`category-icon tone-${category.tone ?? "green"}`}><CategoryIcon name={category.icon ?? undefined} /></span><strong>{localize(category.name, locale)}</strong><ChevronRight size={19} /></Link><div>{getCategoryChildren(view, category).map((child) => <Link href={`/category/${child.slug}`} key={child.id}>{localize(child.name, locale)}</Link>)}</div></section>)}</div> : <EmptyState title={t("reference.categoriesUnavailableTitle")} description={t("reference.categoriesUnavailable")} actionHref="/help" actionLabel={t("nav.help")} />}</main><MobileNav /></>;
}
