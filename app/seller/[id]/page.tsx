import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, MessageCircle, UserRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { listingRepository, profileRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";
import { getSettlement } from "@/lib/reference-data/geography";
import { getGeographyReferences } from "@/lib/reference-data/server";

export const metadata: Metadata = { title: "Профиль продавца" };

export default async function SellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seller = await profileRepository.findById(id);
  if (!seller) notFound();
  const [geography, listings, i18n] = await Promise.all([
    getGeographyReferences(),
    listingRepository.list(),
    getServerI18n(),
  ]);
  const city = seller.cityId ? getSettlement(geography.data, seller.cityId) : undefined;
  const { locale, t } = i18n;
  return <><Header /><main className="page-shell subpage-main seller-public-page"><PageHeader fallback="/search" eyebrow={t("seller.eyebrow")} title={seller.displayName} description={city ? localize(city.name, locale) : t("common.kazakhstan")} /><section className="seller-profile-card"><div className="seller-profile-avatar">{seller.avatarUrl ? "" : <UserRound size={30} />}</div><div className="seller-profile-main"><div><h2>{seller.displayName}</h2>{seller.verified ? <span className="verified-badge">{t("seller.verified")}</span> : null}</div>{city ? <p><MapPin size={16} /> {localize(city.name, locale)}</p> : null}{seller.bio ? <p>{seller.bio}</p> : null}</div><Link className="primary-action" href={`/messages/new?seller=${seller.id}`}><MessageCircle size={18} /> {t("seller.message")}</Link></section><section className="dashboard-section"><div className="section-heading"><div><span className="section-kicker">{t("seller.offers")}</span><h2>{t("seller.active")}</h2></div></div>{listings.total ? null : <EmptyState title={t("seller.empty")} description={t("seller.emptyNote")} actionHref="/search" actionLabel={t("nav.returnCatalog")} />}</section></main><MobileNav /></>;
}
