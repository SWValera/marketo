import type { Metadata } from "next";
import { AlertTriangle, ChevronLeft, ChevronRight, Heart, LogIn } from "lucide-react";
import { AppLink as Link } from "@/components/app-link";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { ListingCard } from "@/components/listing-card";
import { getCurrentAuthContext } from "@/lib/auth/context";
import { listingRepository } from "@/lib/data/repositories";
import { normalizePositivePage } from "@/lib/data/pagination";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Избранное", robots: { index: false, follow: false } };

const PAGE_SIZE = 24;

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const [{ t, locale }, authContext, params] = await Promise.all([
    getServerI18n(),
    getCurrentAuthContext(),
    searchParams,
  ]);
  const page = normalizePositivePage(params.page);
  if (authContext.status === "anonymous") {
    return <DashboardShell title={t("favorites.title")} description={t("favorites.description")} active="/favorites" authContext={authContext}>
      <EmptyState icon={<LogIn size={30} />} title={t("favorites.signInTitle")} description={t("favorites.signInNote")} actionHref="/login?next=/favorites" actionLabel={t("favorites.signIn")} />
    </DashboardShell>;
  }
  if (authContext.status === "error") {
    return <DashboardShell title={t("favorites.title")} description={t("favorites.description")} active="/favorites" authContext={authContext}>
      <EmptyState icon={<AlertTriangle size={30} />} title={t("favorites.loadErrorTitle")} description={t("favorites.loadErrorNote")} actionHref="/favorites" actionLabel={t("common.retry")} />
    </DashboardShell>;
  }

  let favorites: Awaited<ReturnType<typeof listingRepository.favorites>> | null = null;
  try {
    favorites = await listingRepository.favorites({ page, pageSize: PAGE_SIZE, locale });
  } catch {
    // The authenticated and empty states must remain distinct from a data failure.
  }
  return <DashboardShell title={t("favorites.title")} description={favorites ? `${favorites.total} ${t("favorites.saved")}.` : t("favorites.description")} active="/favorites" authContext={authContext}>
    {!favorites ? <EmptyState icon={<AlertTriangle size={30} />} title={t("favorites.loadErrorTitle")} description={t("favorites.loadErrorNote")} actionHref={page === 1 ? "/favorites" : `/favorites?page=${page}`} actionLabel={t("common.retry")} />
      : favorites.total === 0 ? <EmptyState icon={<Heart size={30} />} title={t("favorites.empty")} description={t("favorites.emptyNote")} actionHref="/search" actionLabel={t("home.viewCatalog")} />
        : favorites.items.length === 0 ? <EmptyState icon={<Heart size={30} />} title={t("favorites.pageOutOfRangeTitle")} description={t("favorites.pageOutOfRangeNote")} actionHref="/favorites" actionLabel={t("favorites.firstPage")} />
          : <>
            <div className="listing-grid">{favorites.items.map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div>
            {page > 1 || favorites.nextCursor ? <nav className="owner-listing-pagination" aria-label={t("favorites.title")}>
              {page > 1 ? <Link href={page === 2 ? "/favorites" : `/favorites?page=${page - 1}`}><ChevronLeft size={17} />{t("profile.previousPage")}</Link> : <span />}
              {favorites.nextCursor ? <Link href={`/favorites?page=${favorites.nextCursor}`}>{t("profile.nextPage")}<ChevronRight size={17} /></Link> : null}
            </nav> : null}
          </>}
  </DashboardShell>;
}
