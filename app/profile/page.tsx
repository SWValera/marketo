/* eslint-disable @next/next/no-img-element -- Owner media is served through the authenticated same-origin media route. */
import type { Metadata } from "next";
import { AppLink as Link } from "@/components/app-link";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
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
import { normalizePositivePage } from "@/lib/data/pagination";
import { normalizeOwnerListingTab, ownerListingTabs, ownerProfileHref } from "@/lib/listings/owner-filters";
import { PublicationRefresh } from "@/components/publication-refresh";
import { LogoutButton } from "@/components/logout-button";

export const metadata: Metadata = {
  title: "Профиль",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 12;

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
  searchParams: Promise<{ page?: string | string[]; registered?: string; tab?: string }>;
}) {
  const [{ t, locale }, params, authContext] = await Promise.all([
    getServerI18n(),
    searchParams,
    getCurrentAuthContext(),
  ]);
  const page = normalizePositivePage(params.page);
  const tab = normalizeOwnerListingTab(params.tab);

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
    listings = await listingRepository.mine({
      page,
      pageSize: PAGE_SIZE,
      locale,
      authenticatedUserId: authContext.user.id,
      tab,
    });
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
    {params.registered === "success" ? <p className="auth-feedback is-success" role="status">{t("auth.registeredSuccess")}</p> : null}
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
      <div className="profile-account-actions">
        <Link className="secondary-button" href="/profile/edit"><PenLine size={16} />{t("common.edit")}</Link>
        <LogoutButton />
        <Link className="account-delete-link" href="/profile/delete">{t("accountDelete.title")}</Link>
      </div>
    </section>

    <section className="dashboard-section" aria-labelledby="my-listings-title">
      <div className="dashboard-section-heading">
        <div>
          <h2 id="my-listings-title">{t("profile.myListings")}</h2>
          <p>{listings ? t("profile.myListingsCount", { count: listings.total }) : t("profile.myListingsNote")}</p>
        </div>
        <Link className="primary-action" href="/publish" prefetch={false}><Plus size={17} />{t("profile.createListing")}</Link>
      </div>

      <aside className="publication-term-notice" aria-labelledby="publication-term-title">
        <span className="publication-term-icon" aria-hidden="true"><CalendarDays size={24} /></span>
        <div><h3 id="publication-term-title">{t("profile.publicationTermTitle")}</h3><p>{t("profile.publicationTermNote")}</p></div>
      </aside>
      <nav className="profile-listing-tabs" aria-label={t("profile.myListings")}>
        {ownerListingTabs.map((value) => <Link key={value} className="secondary-button" href={ownerProfileHref(value)} aria-current={tab === value ? "page" : undefined}>{t(`profile.tab.${value}`)}</Link>)}
      </nav>
      <PublicationRefresh expiresAt={listings?.items.filter((item) => item.status === "active" && item.expiresAt).map((item) => item.expiresAt!).sort()[0] ?? null} />
      {!listings ? <EmptyState
        icon={<AlertTriangle size={30} />}
        title={t("profile.listingsLoadErrorTitle")}
        description={t("profile.listingsLoadErrorNote")}
        actionHref={ownerProfileHref(tab, page)}
        actionLabel={t("common.retry")}
      /> : listings.state === "empty" ? <EmptyState
        title={t("profile.emptyListings")}
        description={t("profile.emptyListingsNote")}
        actionHref="/publish"
        actionLabel={t("profile.createListing")}
        actionPrefetch={false}
      /> : listings.state === "out_of_range" ? <EmptyState
        title={t("profile.pageEmptyTitle")}
        description={t("profile.pageEmptyNote")}
        actionHref={ownerProfileHref(tab)}
        actionLabel={t("profile.firstPage")}
      /> : <div className="owner-listings-shell">
        <div className="owner-listing-grid">
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
              {listing.status === "active" && listing.expiresLabel ? <small>{t("profile.expiresOn", { date: listing.expiresLabel })}</small> : null}
              {listing.status === "rejected" ? <div className="owner-listing-rejection" role="status">
                <strong>{t("profile.rejectionReason")}</strong>
                <span>{rejectionLabel(listing.rejectionReasonCode)}</span>
              </div> : null}
              <OwnerListingActions listing={listing} />
            </div>
          </article>)}
        </div>
        {listings.page > 1 || listings.nextCursor ? <nav className="owner-listing-pagination" aria-label={t("profile.myListings")}>
          {listings.page > 1
            ? <Link href={ownerProfileHref(tab, listings.page - 1)}><ChevronLeft size={17} />{t("profile.previousPage")}</Link>
            : <span />}
          {listings.nextCursor
            ? <Link href={ownerProfileHref(tab, listings.nextCursor)}>{t("profile.nextPage")}<ChevronRight size={17} /></Link>
            : null}
        </nav> : null}
      </div>}
    </section>
  </DashboardShell>;
}
