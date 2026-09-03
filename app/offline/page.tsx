import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Нет подключения", robots: { index: false, follow: false } };

export default async function OfflinePage() {
  const { t } = await getServerI18n();
  return <><Header /><main id="main-content" tabIndex={-1} className="page-shell subpage-main"><EmptyState icon={<WifiOff size={30} />} title={t("state.offlineTitle")} description={t("state.offlineNote")} actionHref="/" actionLabel={t("state.tryAgain")} /></main><MobileNav /></>;
}
