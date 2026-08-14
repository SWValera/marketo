import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { listingRepository } from "@/lib/data/repositories";

export const metadata: Metadata = { title: "Избранное", robots: { index: false, follow: false } };

export default async function FavoritesPage() {
  const favorites = await listingRepository.favorites();
  return <DashboardShell title="Избранное" description={`${favorites.total} сохранённых объявлений.`} active="/favorites"><EmptyState icon={<Heart size={30} />} title="В избранном пока пусто" description="Сохраняйте интересные объявления, чтобы быстро вернуться к ним после подключения аккаунта." actionHref="/search" actionLabel="Открыть каталог" /></DashboardShell>;
}
