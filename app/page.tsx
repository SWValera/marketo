import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Heart, MessageCircle, Search, ShieldCheck } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { CityPremiumShowcase } from "@/components/city-premium-showcase";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { HomeMarketplaceTabs } from "@/components/home-marketplace-tabs";
import { ListingCard } from "@/components/listing-card";
import { MobileNav } from "@/components/mobile-nav";
import { listingRepository } from "@/lib/data/repositories";
import { localize } from "@/lib/i18n/config";
import { getServerI18n } from "@/lib/i18n/server";
import { createCategoryCatalogView, getCategoryChildren, getRootCategories } from "@/lib/reference-data/catalog";
import { getCategoryReferences } from "@/lib/reference-data/server";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const i18n = await getServerI18n();
  const { locale, t } = i18n;
  const [catalog, listings] = await Promise.all([
    getCategoryReferences(),
    listingRepository.list({ locale, limit: 12 }),
  ]);
  const catalogView = createCategoryCatalogView(catalog.data);
  const rootCategories = getRootCategories(catalogView);

  const catalogPanel = <section className="home-tab-panel" aria-labelledby="home-catalog-title">
    <div className="section-heading"><div><span className="section-kicker">{t("home.fullCatalog")}</span><h2 id="home-catalog-title">{t("home.popularCategories")}</h2></div><Link href="/categories">{t("home.allCategories")} <ArrowRight size={16} /></Link></div>
    {rootCategories.length ? <div className="category-grid">{rootCategories.map((category) => <Link href={`/category/${category.slug}`} className="category-tile" key={category.id}><span className={`category-icon tone-${category.tone ?? "green"}`}><CategoryIcon name={category.icon ?? undefined} size={26} /></span><strong>{localize(category.name, locale)}</strong><small>{getCategoryChildren(catalogView, category).length} {t("home.sections")}</small></Link>)}</div> : <EmptyState title={t("reference.categoriesUnavailableTitle")} description={t("reference.categoriesUnavailable")} actionHref="/help" actionLabel={t("nav.help")} />}
  </section>;

  const listingsPanel = <section className="home-tab-panel" aria-labelledby="home-listings-title">
    <div className="section-heading"><div><span className="section-kicker">{t("home.newOffers")}</span><h2 id="home-listings-title">{t("home.recommended")}</h2></div><Link href="/search">{t("home.allListings")} <ArrowRight size={16} /></Link></div>
    {listings.items.length ? <div className="listing-grid">{listings.items.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div> : <EmptyState title={t("home.emptyTitle")} description={t("home.emptyDescription")} actionHref="/publish" actionLabel={t("nav.publish")} />}
  </section>;

  return <>
    <Header />
    <main>
      <section className="home-showcase-shell page-shell"><CityPremiumShowcase /></section>
      <HomeMarketplaceTabs catalog={catalogPanel} listings={listingsPanel} />
      <section className="trust-row home-trust-row page-shell"><div><ShieldCheck size={24} /><span><strong>{t("home.safety")}</strong><small>{t("home.safetyNote")}</small></span></div><div><Search size={24} /><span><strong>{t("home.preciseSearch")}</strong><small>{t("home.preciseSearchNote")}</small></span></div><div><MessageCircle size={24} /><span><strong>{t("home.chat")}</strong><small>{t("home.chatNote")}</small></span></div><div><Heart size={24} /><span><strong>{t("nav.favorites")}</strong><small>{t("home.favoritesNote")}</small></span></div></section>
      <section className="cta-section page-shell"><div><span className="section-kicker">{t("home.startNow")}</span><h2>{t("home.prepareFirst")}</h2><p>{t("home.prepareFirstNote")}</p></div><Link href="/publish" className="primary-action">{t("header.publish")} <ArrowRight size={18} /></Link></section>
    </main>
    <footer className="site-footer"><div className="page-shell"><span className="brand"><span className="brand-mark">M</span>Marketo</span><p>{t("home.footer")}</p><span>© 2026 Marketo</span></div></footer>
    <MobileNav />
  </>;
}

