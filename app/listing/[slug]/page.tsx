import type { Metadata } from "next";
import { SITE_ORIGIN } from "@/lib/site-origin";
import { PublicationRefresh } from "@/components/publication-refresh";
import { AppLink as Link } from "@/components/app-link";
import { notFound, permanentRedirect } from "next/navigation";
import { MapPin, UserRound, ChevronRight, Car, CalendarDays, Gauge, Settings2, Fuel, GitFork, CircleGauge, Circle, Tag, ClipboardCheck, SlidersHorizontal } from "lucide-react";
import { ListingDetailDisclosure } from "@/components/listing-detail-disclosure";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { ListingActions } from "@/components/listing-actions";
import { ListingGallery } from "@/components/listing-gallery";
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
  const images = listing.imageUrl ? [{url:new URL(listing.imageUrl, SITE_ORIGIN).href,alt:listing.title}] : [];
  return {
    title: `${listing.title} — ${listing.priceLabel}`,
    description: metadataDescription(listing.description),
    alternates: { canonical },
    openGraph: { title: listing.title, description: metadataDescription(listing.description), url: canonical, siteName: "JEVU", images },
    twitter: { card: "summary_large_image", title: listing.title, description: metadataDescription(listing.description), images },
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
    return [{ key: attribute.key, label: localize(attribute.label, locale), value: `${value}${attribute.unit ? ` ${localize(attribute.unit, locale)}` : ""}` }];
  });
  const fallback = `/category/${listing.categorySlug}`;
  const categoryName = localize(listing.categoryName, locale);
  const compactLabels: Record<string, { ru: string; kk: string }> = {
    year: { ru: "Год", kk: "Жылы" }, transmission: { ru: "КПП", kk: "Қорап" },
    engine_volume: { ru: "Объём", kk: "Көлемі" }, condition: { ru: "Состояние", kk: "Күйі" },
  };
  const icons: Record<string, typeof Car> = { brand: Car, model: Car, year: CalendarDays, mileage: Gauge, transmission: Settings2, fuel: Fuel, drive: GitFork, engine_volume: CircleGauge, steering: CircleGauge, color: Circle, condition: ClipboardCheck };
  return <>
    <PublicationRefresh expiresAt={listing.expiresAt ?? null} />
    <Header categorySlug={listing.categorySlug} searchPlaceholder={localize(listing.categorySearchPlaceholder, locale)} />
    <main id="main-content" tabIndex={-1} className="page-shell listing-page">
      <PageHeader fallback={fallback} eyebrow={categoryName || t("listing.advert")} title={listing.title} description={`${listing.locationLabel} · ${listing.publishedLabel}`} />
      <nav className="breadcrumbs"><Link href="/">{t("common.home")}</Link><span>/</span><Link href={fallback}>{categoryName || t("common.catalog")}</Link><span>/</span><span>{listing.title}</span></nav>
      <div className="listing-layout">
        <section className="listing-primary">
          {listing.imageUrls.length ? <ListingGallery key={listing.id} images={listing.imageUrls} title={listing.title} /> : <EmptyState title={t("listing.photosMissing")} description={t("listing.photosMissingNote")} />}
          <h2 className="listing-mobile-title" title={listing.title}>{listing.title}</h2>
          {characteristics.length ? <article className="detail-card listing-characteristics">
            <h2>{t("listing.characteristics")}</h2>
            <ListingDetailDisclosure kind="characteristics" label={`${t("listing.characteristics")} (${characteristics.length})`} collapsible={characteristics.length > 11}>
              <dl className="characteristics-grid">{characteristics.map((item) => {
                const Icon = icons[item.key] ?? SlidersHorizontal;
                return <div key={item.key}><dt><Icon className="characteristic-icon" size={14} aria-hidden="true" /><span className="characteristic-label-full">{item.label}</span><span className="characteristic-label-compact" title={item.label}>{compactLabels[item.key] ? localize(compactLabels[item.key], locale) : item.label}</span></dt><dd><span>{item.value}</span></dd></div>;
              })}</dl>
            </ListingDetailDisclosure>
          </article> : null}
          <article className="detail-card listing-description">
            <h2>{t("listing.description")}</h2>
            <ListingDetailDisclosure kind="description" label={t("listing.description")}><p>{listing.description}</p></ListingDetailDisclosure>
          </article>
          <article className="detail-card listing-location"><h2>{t("listing.location")}</h2><p><MapPin size={17} aria-hidden="true" /> {listing.locationLabel}</p></article>
        </section>
        <aside className="seller-column">
          <article className="price-card">
            <h2>{listing.title}</h2>
            <span className="listing-price-label"><Tag size={15} aria-hidden="true" />{t("publish.price")}</span>
            <div className="detail-price">{listing.priceLabel}</div>
            <ListingActions listingId={listing.id} listingSlug={`${listing.id}-${listing.slug}`} title={listing.title} contactPhone={listing.contactPhone} />
          </article>
          <Link className="seller-card" href={`/seller/${listing.sellerId}`}><div className="avatar"><UserRound size={22} /></div><div><strong>{listing.sellerName}</strong><small>{t("listing.openSeller")}</small></div><ChevronRight className="listing-seller-chevron" size={20} aria-hidden="true" /></Link>
        </aside>
        <p className="listing-publication-note">{listing.publishedLabel}</p>
      </div>
    </main>
    <MobileNav />
  </>;
}
