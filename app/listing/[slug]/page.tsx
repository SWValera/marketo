/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flag, Heart, MapPin, MessageCircle, Phone, Share2, UserRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { getCategoryAttributes, getCategoryBySlug } from "@/lib/catalog-config";
import { listingRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const listing = await listingRepository.findBySlug(slug);
  return listing ? { title: `${listing.title} — ${listing.priceLabel}`, description: listing.description, alternates: { canonical: `/listing/${slug}` } } : {};
}

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await listingRepository.findBySlug(slug);
  if (!listing) notFound();
  const category = getCategoryBySlug(listing.categorySlug);
  const { locale, t } = await getServerI18n();
  const characteristics = getCategoryAttributes(listing.categorySlug).flatMap((attribute) => {
    const raw = listing.attributes[attribute.id];
    if (raw === undefined || raw === false || raw === "") return [];
    const option = attribute.options?.find((item) => item.value === raw);
    const value = attribute.type === "checkbox" ? t("common.yes") : option ? localize(option.label, locale) : String(raw);
    return [{ label: localize(attribute.label, locale), value: `${value}${attribute.unit ? ` ${localize(attribute.unit, locale)}` : ""}` }];
  });
  const fallback = `/category/${listing.categorySlug}`;
  return <><Header categorySlug={listing.categorySlug} searchPlaceholder={localize(category?.searchPlaceholder, locale)} /><main className="page-shell listing-page"><PageHeader fallback={fallback} eyebrow={category ? localize(category.name, locale) : t("listing.advert")} title={listing.title} description={`${listing.locationLabel} · ${listing.publishedLabel}`} /><nav className="breadcrumbs"><Link href="/">{t("common.home")}</Link><span>/</span><Link href={fallback}>{category ? localize(category.name, locale) : t("common.catalog")}</Link><span>/</span><span>{listing.title}</span></nav><div className="listing-layout"><section>{listing.imageUrl ? <div className="gallery-main"><img src={listing.imageUrl} alt={listing.title} /></div> : <EmptyState title={t("listing.photosMissing")} description={t("listing.photosMissingNote")} />} {characteristics.length ? <article className="detail-card"><h2>{t("listing.characteristics")}</h2><dl className="characteristics-grid">{characteristics.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></article> : null}<article className="detail-card"><h2>{t("listing.description")}</h2><p>{listing.description}</p></article><article className="detail-card"><h2>{t("listing.location")}</h2><p><MapPin size={17} /> {listing.locationLabel}</p></article></section><aside className="seller-column"><article className="price-card"><h2>{listing.title}</h2><div className="detail-price">{listing.priceLabel}</div><div className="detail-actions"><button type="button"><Phone size={19} /> {t("listing.showPhone")}</button><Link href={`/messages/new?listing=${listing.id}`}><MessageCircle size={19} /> {t("listing.messageSeller")}</Link></div><div className="detail-secondary"><button type="button"><Heart size={18} /> {t("listing.favorite")}</button><button type="button"><Share2 size={18} /> {t("listing.share")}</button></div></article><Link className="seller-card" href={`/seller/${listing.sellerId}`}><div className="avatar"><UserRound size={22} /></div><div><strong>{t("listing.sellerProfile")}</strong><small>{t("listing.openSeller")}</small></div></Link><button className="report-link" type="button"><Flag size={17} /> {t("listing.report")}</button></aside></div></main><MobileNav /></>;
}
