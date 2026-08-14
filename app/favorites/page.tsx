import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { listingRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Избранное", robots: { index: false, follow: false } };

export default async function FavoritesPage() {
  const favorites = await listingRepository.favorites();
  const { t } = await getServerI18n();
  return <DashboardShell title={t("favorites.title")} description={`${favorites.total} ${t("favorites.saved")}.`} active="/favorites"><EmptyState icon={<Heart size={30} />} title={t("favorites.empty")} description={t("favorites.emptyNote")} actionHref="/search" actionLabel={t("home.viewCatalog")} /></DashboardShell>;
}
