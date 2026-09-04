/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { AppLink as Link } from "@/components/app-link";
import { notFound, permanentRedirect } from "next/navigation";
import { MapPin, UserRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { ListingActions } from "@/components/listing-actions";
import { listingRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";

type ListingPageProps = { params: Promise<{ slug: string }> };

function canonicalListingPath(listing: { id: string; slug: string }) {
  return `/listing/${listing.id}-${listing.slug}`;
}

function metadataDescription(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157).trimEnd()}…` : normalized;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const [{ slug }, { locale }] = await Promise.all([params, getServerI18n()]);
  const listing = await listingRepository.findBySlug(slug, locale);
  if (!listing) notFound();
  const canonical = canonicalListingPath(listing);
  return {
    title: `${listing.title} — ${listing.priceLabel}`,
    description: metadataDescription(listing.description),
    alternates: { canonical },
    openGraph: { title: listing.title, description: metadataDescription(listing.description), url: canonical },
  };
}

export default function ListingPage(props: ListingPageProps) {
  return <ListingPageContent {...props} />;
}

async function ListingPageContent({ params }: ListingPageProps) {
  const [{ slug }, { locale, t }] = await Promise.all([params, getServerI18n()]);
  const listing = await listingRepository.findBySlug(slug, locale);
  if (!listing) notFound();
  const canonicalPath = canonicalListingPath(listing);
  if (`/listing/${slug}` !== canonicalPath) permanentRedirect(canonicalPath);
  const characteristics = listing.attributeDefinitions.flatMap((attribute) => {
    const raw = listing.attributes[attribute.key];
    if (raw === undefined || raw === false || raw === "") return [];
    const value = attribute.dataType === "boolean" ? t("common.yes") : listing.attributeDisplayValues?.[attribute.key] ?? String(raw);
    return [{ label: localize(attribute.label, locale), value: `${value}${attribute.unit ? ` ${localize(attribute.unit, locale)}` : ""}` }];
  });
  const fallback = `/category/${listing.categorySlug}`;
  const categoryName = localize(listing.categoryName, locale);
  return <><Header categorySlug={listing.categorySlug} searchPlaceholder={localize(listing.categorySearchPlaceholder, locale)} /><main id="main-content" tabIndex={-1} className="page-shell listing-page"><PageHeader fallback={fallback} eyebrow={categoryName || t("listing.advert")} title={listing.title} description={`${listing.locationLabel} · ${listing.publishedLabel}`} /><nav className="breadcrumbs"><Link href="/">{t("common.home")}</Link><span>/</span><Link href={fallback}>{categoryName || t("common.catalog")}</Link><span>/</span><span>{listing.title}</span></nav><div className="listing-layout"><section>{listing.imageUrl ? <div className="gallery-main"><img src={listing.imageUrl} alt={listing.title} decoding="async" /></div> : <EmptyState title={t("listing.photosMissing")} description={t("listing.photosMissingNote")} />} {characteristics.length ? <article className="detail-card"><h2>{t("listing.characteristics")}</h2><dl className="characteristics-grid">{characteristics.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></article> : null}<article className="detail-card"><h2>{t("listing.description")}</h2><p>{listing.description}</p></article><article className="detail-card"><h2>{t("listing.location")}</h2><p><MapPin size={17} /> {listing.locationLabel}</p></article></section><aside className="seller-column"><article className="price-card"><h2>{listing.title}</h2><div className="detail-price">{listing.priceLabel}</div><ListingActions listingId={listing.id} listingSlug={`${listing.id}-${listing.slug}`} title={listing.title} contactPhone={listing.contactPhone} /></article><Link className="seller-card" href={`/seller/${listing.sellerId}`}><div className="avatar"><UserRound size={22} /></div><div><strong>{listing.sellerName}</strong><small>{t("listing.openSeller")}</small></div></Link></aside></div></main><MobileNav /></>;
}
