import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink as Link } from "@/components/app-link";
import { ArrowRight, Heart, MessageCircle, Search, ShieldCheck } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { CityPremiumShowcase } from "@/components/city-premium-showcase";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { HomeMarketplaceTabs } from "@/components/home-marketplace-tabs";
import { MobileNav } from "@/components/mobile-nav";
import { localize } from "@/lib/i18n/config";
import { getServerI18n } from "@/lib/i18n/server";
import { translate, type Locale } from "@/lib/i18n/messages";
import { getHomeCategoryReferences } from "@/lib/reference-data/server";

export const metadata: Metadata = { alternates: { canonical: "/" } };

function homeText(locale: Locale, key: Parameters<typeof translate>[1]) {
  return translate(locale, key);
}

function HomeCatalogHeading({ locale }: { locale: Locale }) {
  return <div className="section-heading"><div><span className="section-kicker">{homeText(locale, "home.fullCatalog")}</span><h2 id="home-catalog-title">{homeText(locale, "home.popularCategories")}</h2></div><Link href="/categories">{homeText(locale, "home.allCategories")} <ArrowRight size={16} /></Link></div>;
}

function HomeCatalogFallback({ locale }: { locale: Locale }) {
  return <section className="home-tab-panel" aria-labelledby="home-catalog-title" aria-busy="true">
    <HomeCatalogHeading locale={locale} />
    <div className="category-grid" aria-label={homeText(locale, "common.loading")}><div className="skeleton-card" /></div>
  </section>;
}

async function HomeCatalogPanel({ locale }: { locale: Locale }) {
  const catalog = await getHomeCategoryReferences();
  const rootCategories = catalog.data.categories;
  return <section className="home-tab-panel" aria-labelledby="home-catalog-title">
    <HomeCatalogHeading locale={locale} />
    {rootCategories.length ? <div className="category-grid">{rootCategories.map((category) => <Link href={`/category/${category.slug}`} className="category-tile" key={category.id}><span className={`category-icon tone-${category.tone ?? "green"}`}><CategoryIcon name={category.icon ?? undefined} size={26} /></span><strong>{localize(category.name, locale)}</strong><small>{category.childCount} {homeText(locale, "home.sections")}</small></Link>)}</div> : <EmptyState title={homeText(locale, "reference.categoriesUnavailableTitle")} description={homeText(locale, "reference.categoriesUnavailable")} actionHref="/help" actionLabel={homeText(locale, "nav.help")} />}
  </section>;
}

export default async function Home() {
  const i18n = await getServerI18n();
  const { locale, t } = i18n;
  const catalogPanel = <Suspense fallback={<HomeCatalogFallback locale={locale} />}><HomeCatalogPanel locale={locale} /></Suspense>;

  return <>
    <Header />
    <main id="main-content" tabIndex={-1}>
      <section className="home-showcase-shell page-shell"><CityPremiumShowcase /></section>
      <HomeMarketplaceTabs catalog={catalogPanel} />
      <section className="trust-row home-trust-row page-shell"><div><ShieldCheck size={24} /><span><strong>{t("home.safety")}</strong><small>{t("home.safetyNote")}</small></span></div><div><Search size={24} /><span><strong>{t("home.preciseSearch")}</strong><small>{t("home.preciseSearchNote")}</small></span></div><div><MessageCircle size={24} /><span><strong>{t("home.chat")}</strong><small>{t("home.chatNote")}</small></span></div><div><Heart size={24} /><span><strong>{t("nav.favorites")}</strong><small>{t("home.favoritesNote")}</small></span></div></section>
      <section className="cta-section page-shell"><div><span className="section-kicker">{t("home.startNow")}</span><h2>{t("home.prepareFirst")}</h2><p>{t("home.prepareFirstNote")}</p></div><Link href="/publish" prefetch={false} className="primary-action">{t("header.publish")} <ArrowRight size={18} /></Link></section>
    </main>
    <footer className="site-footer"><div className="page-shell"><span className="brand"><span className="brand-mark">M</span>Marketo</span><p>{t("home.footer")}</p><span>© 2026 Marketo</span></div></footer>
    <MobileNav />
  </>;
}
