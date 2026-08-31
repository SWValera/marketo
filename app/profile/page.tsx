/* eslint-disable @next/next/no-img-element -- Owner media is served through the authenticated same-origin media route. */
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  LogIn,
  PenLine,
  Plus,
  UserRound,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { OwnerListingActions } from "@/components/owner-listing-actions";
import { getCurrentAuthContext } from "@/lib/auth/context";
import { listingRepository } from "@/lib/data/repositories";
import type { MyListingSummary } from "@/lib/data/types";
import { getServerI18n } from "@/lib/i18n/server";
import { MODERATION_REJECTION_REASONS } from "@/lib/moderation/policy";

export const metadata: Metadata = {
  title: "Профиль",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 12;

function requestedPage(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function safeInitial(value: string) {
  return Array.from(value.trim())[0]?.toLocaleUpperCase() ?? "M";
}

function logOwnerListingReadFailure(error: unknown) {
  const record = error && typeof error === "object"
    ? error as { name?: unknown; code?: unknown }
    : {};
  console.error("[marketo-owner-listings] read failed", {
    name: typeof record.name === "string" ? record.name : "Error",
    ...(typeof record.code === "string" ? { code: record.code } : {}),
  });
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [{ t, locale }, params, authContext] = await Promise.all([
    getServerI18n(),
    searchParams,
    getCurrentAuthContext(),
  ]);
  const page = requestedPage(params.page);

  if (authContext.status === "anonymous") {
    return <DashboardShell
      title={t("profile.title")}
      description={t("profile.description")}
      active="/profile"
      authContext={authContext}
      fallback="/"
    >
      <section className="dashboard-card profile-auth-state">
        <span className="profile-auth-icon"><UserRound size={30} /></span>
        <h2>{t("profile.signInTitle")}</h2>
        <p>{t("profile.signInNote")}</p>
        <div className="profile-auth-actions">
          <Link className="primary-action" href="/login?mode=login&next=/profile"><LogIn size={17} />{t("profile.login")}</Link>
          <Link className="secondary-button" href="/login?mode=register&next=/profile">{t("profile.register")}</Link>
          <Link className="secondary-button" href="/login?mode=recover&next=/profile">{t("profile.recover")}</Link>
        </div>
        <div className="profile-public-links">
          <Link href="/search">{t("profile.openCatalog")}</Link>
        </div>
      </section>
    </DashboardShell>;
  }

  if (authContext.status === "error") {
    return <DashboardShell
      title={t("profile.title")}
      description={t("profile.description")}
      active="/profile"
      authContext={authContext}
      fallback="/"
    >
      <EmptyState
        icon={<AlertTriangle size={30} />}
        title={t("profile.loadErrorTitle")}
        description={t("profile.loadErrorNote")}
        actionHref="/profile"
        actionLabel={t("common.retry")}
      />
    </DashboardShell>;
  }

  let listings: Awaited<ReturnType<typeof listingRepository.mine>> | null = null;
  try {
    listings = await listingRepository.mine({ page, pageSize: PAGE_SIZE, locale });
  } catch (error) {
    logOwnerListingReadFailure(error);
  }

  const statusLabel = (status: MyListingSummary["status"]) => t(`profile.status.${status}`);
  const rejectionLabel = (code: string | null) => {
    const reason = MODERATION_REJECTION_REASONS.find((candidate) => candidate.code === code);
    return reason ? (locale === "kk" ? reason.kk : reason.ru) : t("profile.rejectionUnknown");
  };

  return <DashboardShell
    title={t("profile.title")}
    description={t("profile.description")}
    active="/profile"
    authContext={authContext}
    fallback="/"
  >
    <section className="dashboard-card profile-hero">
      <span className="profile-avatar" aria-hidden="true">
        {safeInitial(authContext.profile.displayName)}
        {authContext.profile.verified ? <span><BadgeCheck size={14} /></span> : null}
      </span>
      <div className="profile-identity">
        <div className="profile-name-row">
          <h2>{authContext.profile.displayName}</h2>
          {authContext.profile.verified ? <span className="verified-badge"><BadgeCheck size={14} />{t("profile.verified")}</span> : null}
        </div>
        <p>{authContext.user.email}</p>
      </div>
      <Link className="secondary-button" href="/profile/edit"><PenLine size={16} />{t("common.edit")}</Link>
    </section>

    <section className="dashboard-section" aria-labelledby="my-listings-title">
      <div className="dashboard-section-heading">
        <div>
          <h2 id="my-listings-title">{t("profile.myListings")}</h2>
          <p>{listings ? t("profile.myListingsCount", { count: listings.total }) : t("profile.myListingsNote")}</p>
        </div>
        <Link className="primary-action" href="/publish"><Plus size={17} />{t("profile.createListing")}</Link>
      </div>

      {!listings ? <EmptyState
        icon={<AlertTriangle size={30} />}
        title={t("profile.listingsLoadErrorTitle")}
        description={t("profile.listingsLoadErrorNote")}
        actionHref={page === 1 ? "/profile" : `/profile?page=${page}`}
        actionLabel={t("common.retry")}
      /> : listings.total === 0 ? <EmptyState
        title={t("profile.emptyListings")}
        description={t("profile.emptyListingsNote")}
        actionHref="/publish"
        actionLabel={t("profile.createListing")}
      /> : <div className="owner-listings-shell">
        {listings.items.length ? <div className="owner-listing-grid">
          {listings.items.map((listing) => <article className="owner-listing-card" key={listing.id}>
            <div className="owner-listing-media">
              {listing.imageUrl
                ? <img src={listing.imageUrl} alt="" loading="lazy" />
                : <span aria-label={t("profile.noListingImage")}><ImageOff size={28} /></span>}
              <strong className={`owner-listing-status is-${listing.status}`}>{statusLabel(listing.status)}</strong>
            </div>
            <div className="owner-listing-copy">
              <h3>{listing.title}</h3>
              <strong className="owner-listing-price">{listing.priceLabel}</strong>
              <p>{listing.categoryLabel} · {listing.cityLabel}</p>
              <small>{t("profile.listingUpdated", { date: listing.updatedLabel })}</small>
              {listing.status === "rejected" ? <div className="owner-listing-rejection" role="status">
                <strong>{t("profile.rejectionReason")}</strong>
                <span>{rejectionLabel(listing.rejectionReasonCode)}</span>
              </div> : null}
              <OwnerListingActions listing={listing} />
            </div>
          </article>)}
        </div> : <EmptyState
          title={t("profile.pageEmptyTitle")}
          description={t("profile.pageEmptyNote")}
          actionHref="/profile"
          actionLabel={t("profile.firstPage")}
        />}
        {page > 1 || listings.nextCursor ? <nav className="owner-listing-pagination" aria-label={t("profile.myListings")}>
          {page > 1
            ? <Link href={page === 2 ? "/profile" : `/profile?page=${page - 1}`}><ChevronLeft size={17} />{t("profile.previousPage")}</Link>
            : <span />}
          {listings.nextCursor
            ? <Link href={`/profile?page=${listings.nextCursor}`}>{t("profile.nextPage")}<ChevronRight size={17} /></Link>
            : null}
        </nav> : null}
      </div>}
    </section>
  </DashboardShell>;
}
