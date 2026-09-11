import { SITE_ORIGIN } from "@/lib/site-origin";
import type { Metadata } from "next";
import { CategoryDirectory } from "@/components/category-directory";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { getServerI18n } from "@/lib/i18n/server";
import { getHomeCategoryReferences } from "@/lib/reference-data/server";

export async function generateMetadata(): Promise<Metadata> {
  const [{ locale, t }, catalog] = await Promise.all([getServerI18n(), getHomeCategoryReferences()]);
  return {
    title: t("categories.title"),
    description: t("categories.description"),
    alternates: { canonical: "/categories" },
    ...(catalog.status === "ready" ? {} : { robots: { index: false, follow: true } }),
    openGraph: { siteName: "JEVU", images: [{url:`${SITE_ORIGIN}/icons/jevu-512-v1.png`,width:512,height:512,alt:"JEVU"}], title: t("categories.title"), description: t("categories.description"), locale: locale === "kk" ? "kk_KZ" : "ru_KZ", url: "/categories" },
  };
}

export default async function CategoriesPage() {
  const [{ t }, catalog] = await Promise.all([getServerI18n(), getHomeCategoryReferences()]);
  return <><Header /><main id="main-content" tabIndex={-1} className="page-shell subpage-main"><PageHeader fallback="/" eyebrow={t("categories.eyebrow")} title={t("categories.title")} description={t("categories.description")} />{catalog.status === "ready" && catalog.data.categories.length > 0 ? <CategoryDirectory initialData={catalog.data} /> : <EmptyState retry title={t("reference.categoriesUnavailableTitle")} description={t("reference.categoriesUnavailable")} actionHref="/categories" actionLabel={t("common.retry")} />}</main><MobileNav /></>;
}
