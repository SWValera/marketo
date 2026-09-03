import type { Metadata } from "next";
import { AppLink as Link } from "@/components/app-link";
import { notFound, permanentRedirect } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { ListingCard } from "@/components/listing-card";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { SellerAvatar } from "@/components/seller-avatar";
import { listingRepository, profileRepository } from "@/lib/data/repositories";
import { resolveSellerListingsPage } from "@/lib/data/supabase/listings";
import { canonicalizeRouteUuid } from "@/lib/http/request-routing";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";
import { getSettlement } from "@/lib/reference-data/geography";
import { getGeographyReferences } from "@/lib/reference-data/server";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerI18n();
  return { title: locale === "kk" ? "Сатушы профилі" : "Профиль продавца" };
}

const PAGE_SIZE = 24;

type SellerPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function logSellerListingsReadFailure(error: unknown) {
  const record = error && typeof error === "object"
    ? error as { name?: unknown; code?: unknown }
    : {};
  console.error("[marketo-seller-listings] read failed", {
    name: typeof record.name === "string" ? record.name : "Error",
    ...(typeof record.code === "string" ? { code: record.code } : {}),
  });
}

export default function SellerPage(props: SellerPageProps) {
  return <SellerPageContent {...props} />;
}

async function SellerPageContent({ params, searchParams }: SellerPageProps) {
  const [{ id }, query, i18n] = await Promise.all([params, searchParams, getServerI18n()]);
  const sellerId = canonicalizeRouteUuid(id);
  if (!sellerId) notFound();
  const sellerPath = `/seller/${sellerId}`;
  const pageResolution = resolveSellerListingsPage(query.page);
  const requestedPage = pageResolution.page;
  const hasOnlySupportedParameters = Object.keys(query).every((key) => key === "page");
  if (id !== sellerId || !pageResolution.isCanonical || !hasOnlySupportedParameters) {
    permanentRedirect(requestedPage === 1 ? sellerPath : `${sellerPath}?page=${requestedPage}`);
  }
  const seller = await profileRepository.findById(sellerId);
  if (!seller) notFound();
  const [geography, listings] = await Promise.all([
    getGeographyReferences(),
    listingRepository
      .listPublishedBySeller(sellerId, { page: requestedPage, pageSize: PAGE_SIZE, locale: i18n.locale })
      .catch((error: unknown) => {
        logSellerListingsReadFailure(error);
        return null;
      }),
  ]);
  const city = seller.cityId ? getSettlement(geography.data, seller.cityId) : undefined;
  const { locale, t } = i18n;
  const sellerLocation = city
    ? localize(city.name, locale)
    : seller.cityId
      ? t("reference.geographyUnavailable")
      : t("common.kazakhstan");
  const retryPath = requestedPage === 1 ? sellerPath : `${sellerPath}?page=${requestedPage}`;
  if (listings?.state === "out_of_range") notFound();

  return <>
    <Header />
    <main id="main-content" tabIndex={-1} className="page-shell subpage-main seller-public-page">
      <PageHeader
        fallback="/search"
        eyebrow={t("seller.eyebrow")}
        title={seller.displayName}
        description={sellerLocation}
      />
      <section className="seller-profile-card">
        <SellerAvatar src={seller.avatarUrl} />
        <div className="seller-profile-main">
          <div><h2>{seller.displayName}</h2>{seller.verified ? <span className="verified-badge">{t("seller.verified")}</span> : null}</div>
          {city ? <p><MapPin size={16} /> {localize(city.name, locale)}</p> : null}
          {seller.bio ? <p>{seller.bio}</p> : null}
        </div>
      </section>
      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">{t("seller.offers")}</span>
            <h2>{t("seller.active")}</h2>
            {listings ? <p>{t("seller.activeCount", { count: listings.total })}</p> : null}
          </div>
        </div>
        {!listings ? <EmptyState
          icon={<AlertTriangle size={30} />}
          title={t("seller.loadErrorTitle")}
          description={t("seller.loadErrorNote")}
          actionHref={retryPath}
          actionLabel={t("common.retry")}
        /> : listings.total === 0 ? <EmptyState
          title={t("seller.empty")}
          description={t("seller.emptyNote")}
          actionHref="/search"
          actionLabel={t("nav.returnCatalog")}
        /> : <>
          <div className="listing-grid">
            {listings.items.map((listing) => <ListingCard listing={listing} key={listing.id} />)}
          </div>
          {listings.page > 1 || listings.nextCursor ? <nav className="owner-listing-pagination" aria-label={t("seller.offers")}>
            {listings.page > 1
              ? <Link href={listings.page === 2 ? sellerPath : `${sellerPath}?page=${listings.page - 1}`}><ChevronLeft size={17} />{t("seller.previousPage")}</Link>
              : <span />}
            {listings.nextCursor
              ? <Link href={`${sellerPath}?page=${listings.nextCursor}`}>{t("seller.nextPage")}<ChevronRight size={17} /></Link>
              : null}
          </nav> : null}
        </>}
      </section>
    </main>
    <MobileNav />
  </>;
}
