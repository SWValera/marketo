import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Heart, MapPin, MessageCircle, Search, ShieldCheck, Sparkles } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { categoryTree } from "@/lib/catalog-config";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const { locale, t } = await getServerI18n();
  return <>
    <Header />
    <main>
      <section className="hero-shell page-shell">
        <div className="category-sidebar"><div className="sidebar-heading">{t("admin.categories")}</div><nav aria-label={t("categories.aria")}>{categoryTree.map((category) => <Link key={category.slug} href={`/category/${category.slug}`}><CategoryIcon name={category.icon} size={17} /><span>{localize(category.name, locale)}</span></Link>)}</nav></div>
        <div className="hero-main">
          <div className="hero-card"><div className="hero-copy"><span className="eyebrow"><Sparkles size={15} /> {t("home.eyebrow")}</span><h1>{t("home.title")}</h1><p>{t("home.description")}</p><div className="hero-actions"><Link href="/publish" className="primary-action">{t("header.publish")} <ArrowRight size={18} /></Link><Link href="/search" className="secondary-action">{t("home.viewCatalog")}</Link></div><div className="hero-stats"><div><strong>90</strong><span>{t("home.cities")}</span></div><div><strong>20</strong><span>{t("home.regions")}</span></div><div><strong>2</strong><span>{t("home.languages")}</span></div></div></div><div className="hero-visual" aria-hidden="true"><div className="visual-orbit orbit-one"><Heart size={23} /></div><div className="visual-orbit orbit-two"><MapPin size={25} /></div><div className="visual-phone"><div className="visual-phone-top" /><div className="mini-search"><Search size={12} /> {t("common.search")}...</div><div className="mini-card large" /><div className="mini-grid"><div /><div /></div></div></div></div>
          <div className="trust-row"><div><ShieldCheck size={24} /><span><strong>{t("home.safety")}</strong><small>{t("home.safetyNote")}</small></span></div><div><Search size={24} /><span><strong>{t("home.preciseSearch")}</strong><small>{t("home.preciseSearchNote")}</small></span></div><div><MessageCircle size={24} /><span><strong>{t("home.chat")}</strong><small>{t("home.chatNote")}</small></span></div><div><Heart size={24} /><span><strong>{t("nav.favorites")}</strong><small>{t("home.favoritesNote")}</small></span></div></div>
          <section className="popular-section" aria-labelledby="popular-title"><div className="section-heading"><div><span className="section-kicker">{t("home.fullCatalog")}</span><h2 id="popular-title">{t("home.popularCategories")}</h2></div><Link href="/categories">{t("home.allCategories")} <ArrowRight size={16} /></Link></div><div className="category-grid">{categoryTree.slice(0, 8).map((category) => <Link href={`/category/${category.slug}`} className="category-tile" key={category.slug}><span className={`category-icon tone-${category.tone}`}><CategoryIcon name={category.icon} size={26} /></span><strong>{localize(category.name, locale)}</strong><small>{category.children?.length ?? 0} {t("home.sections")}</small></Link>)}</div></section>
        </div>
      </section>
      <section className="listings-section"><div className="page-shell"><div className="section-heading"><div><span className="section-kicker">{t("home.newOffers")}</span><h2>{t("home.recommended")}</h2></div></div><EmptyState title={t("home.emptyTitle")} description={t("home.emptyDescription")} actionHref="/publish" actionLabel={t("nav.publish")} /></div></section>
      <section className="cta-section page-shell"><div><span className="section-kicker">{t("home.startNow")}</span><h2>{t("home.prepareFirst")}</h2><p>{t("home.prepareFirstNote")}</p></div><Link href="/publish" className="primary-action">{t("header.publish")} <ArrowRight size={18} /></Link></section>
    </main>
    <footer className="site-footer"><div className="page-shell"><span className="brand"><span className="brand-mark">M</span>Marketo</span><p>{t("home.footer")}</p><span>© 2026 Marketo</span></div></footer>
    <MobileNav />
  </>;
}
