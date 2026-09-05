import type { Metadata } from "next";
import { CategoryDirectory } from "@/components/category-directory";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { getServerI18n } from "@/lib/i18n/server";
import { getCategoryReferences, getHomeCategoryReferences } from "@/lib/reference-data/server";

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
  const [{ t }, catalog] = await Promise.all([getServerI18n(), getHomeCategoryReferences()]);
  return <><Header /><main id="main-content" tabIndex={-1} className="page-shell subpage-main"><PageHeader fallback="/" eyebrow={t("categories.eyebrow")} title={t("categories.title")} description={t("categories.description")} />{catalog.status === "ready" && catalog.data.categories.length > 0 ? <CategoryDirectory initialData={{ categories: catalog.data.categories }} /> : <EmptyState title={t("reference.categoriesUnavailableTitle")} description={t("reference.categoriesUnavailable")} actionHref="/help" actionLabel={t("nav.help")} />}</main><MobileNav /></>;
}
